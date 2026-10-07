import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Bell, BellOff, CheckCircle2, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from './api';
import { useChanges } from './changes';
import { Badge, ErrorBox, Modal } from './components';

const supported = () =>
  window.isSecureContext &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;
const installed = () =>
  matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: window-controls-overlay)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
function decodeKey(key: string) {
  const text = atob(
    key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4),
  );
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}
function wasIntroduced(key: string) {
  try {
    return localStorage.getItem(key) === 'seen';
  } catch {
    return false;
  }
}
async function readyWorker() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error('La app todavía se está preparando. Intenta de nuevo en unos segundos.'),
            ),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
interface DeviceState {
  enabled: boolean;
  permission: NotificationPermission;
  capable: boolean;
  isInstalled: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  message: string;
  refresh: () => Promise<void>;
  toggle: () => Promise<boolean>;
}
const DeviceContext = createContext<DeviceState | null>(null);
export function DeviceNotificationsProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supported() ? Notification.permission : 'default',
  );
  const [isInstalled, setInstalled] = useState(installed);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState(false);
  const checked = useRef(false);
  const mutating = useRef(false);
  const alive = useRef(true);
  const pending = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const marker = `aegitasks-push-introduction-v1-${userId}`;
  const dismissed = useRef(wasIntroduced(marker));
  const markIntroduced = () => {
    dismissed.current = true;
    try {
      localStorage.setItem(marker, 'seen');
    } catch {
      /* Keep the decision for this app instance when storage is unavailable. */
    }
  };
  const refresh = useCallback((): Promise<void> => {
    if (mutating.current) return Promise.resolve();
    if (pending.current) return pending.current;
    const signal = controller.current?.signal;
    const work = async () => {
      if (!supported()) {
        checked.current = true;
        setLoading(false);
        return;
      }
      setPermission(Notification.permission);
      const status = await api<{ enabled: boolean }>(
        '/notifications/device',
        'GET',
        undefined,
        signal,
      );
      const registration = status.enabled
        ? await readyWorker()
        : await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (mutating.current || signal?.aborted || !alive.current) return;
      if (status.enabled && subscription && Notification.permission === 'granted')
        await api('/notifications/devices', 'POST', subscription.toJSON(), signal);
      if (!signal?.aborted && alive.current) {
        setEnabled(status.enabled && !!subscription && Notification.permission === 'granted');
        checked.current = true;
        setLoading(false);
        setError('');
      }
    };
    const request = work()
      .catch((e) => {
        if (!signal?.aborted && alive.current) {
          setError(errorMessage(e));
          setLoading(false);
        }
      })
      .finally(() => {
        if (pending.current === request) pending.current = null;
      });
    pending.current = request;
    return request;
  }, []);
  useEffect(() => {
    let disposed = false;
    alive.current = true;
    controller.current = new AbortController();
    void refresh();
    const visible = () => {
      if (!disposed && document.visibilityState === 'visible') void refresh();
    };
    const mode = matchMedia('(display-mode: standalone)');
    const changed = () => setInstalled(installed());
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    window.addEventListener('focus', visible);
    mode.addEventListener('change', changed);
    let permissionStatus: PermissionStatus | undefined;
    void navigator.permissions
      ?.query({ name: 'notifications' })
      .then((status) => {
        if (!disposed && alive.current) {
          permissionStatus = status;
          status.addEventListener('change', visible);
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
      alive.current = false;
      controller.current?.abort();
      pending.current = null;
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
      window.removeEventListener('focus', visible);
      mode.removeEventListener('change', changed);
      permissionStatus?.removeEventListener('change', visible);
    };
  }, [refresh]);
  useChanges(['access'], () => void refresh());
  useEffect(() => {
    if (!isInstalled || !supported() || loading || !checked.current || dismissed.current || error)
      return;
    if (enabled) {
      markIntroduced();
      return;
    }
    const show = () => {
      if (dismissed.current || wasIntroduced(marker) || document.visibilityState !== 'visible')
        return;
      if (
        !document.querySelector('.app-shell[data-device-prompt-ready="true"]') ||
        document.querySelector(
          'dialog[open], [data-unsaved-note="true"], .focus-stage.is-immersive',
        )
      )
        return;
      markIntroduced();
      setPrompt(true);
    };
    show();
    const observer = new MutationObserver(show);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'class', 'data-device-prompt-ready', 'data-unsaved-note'],
    });
    document.addEventListener('visibilitychange', show);
    const elsewhere = (event: StorageEvent) => {
      if (event.key === marker && event.newValue === 'seen') {
        dismissed.current = true;
        setPrompt(false);
      }
    };
    window.addEventListener('storage', elsewhere);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', show);
      window.removeEventListener('storage', elsewhere);
    };
  }, [isInstalled, loading, enabled, error, marker, prompt]);
  async function toggle() {
    if (mutating.current || !supported()) return false;
    mutating.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    // Keep native permission inside the originating click, before any awaited network work.
    try {
      const choice = enabled ? null : Notification.requestPermission();
      const next = choice ? await choice : permission;
      setPermission(next);
      await pending.current;
      if (enabled) {
        await api('/notifications/device', 'DELETE');
        setEnabled(false);
        const registration = await navigator.serviceWorker.getRegistration();
        await (await registration?.pushManager.getSubscription())?.unsubscribe();
        setMessage(
          'Notificaciones desactivadas en este dispositivo. El historial sigue disponible.',
        );
      } else {
        if (next !== 'granted') {
          setMessage('Puedes habilitar el permiso desde los ajustes de tu navegador.');
          return false;
        }
        const config = await api<{ publicKey: string }>('/notifications/push-config');
        const registration = await readyWorker();
        let subscription = await registration.pushManager.getSubscription();
        const key = decodeKey(config.publicKey);
        if (
          subscription?.options.applicationServerKey &&
          new Uint8Array(subscription.options.applicationServerKey).some((b, i) => b !== key[i])
        ) {
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        await api('/notifications/devices', 'POST', subscription.toJSON());
        setEnabled(true);
        setMessage('Listo. Este dispositivo recibirá tus notificaciones.');
      }
      if (isInstalled) markIntroduced();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  const state = {
    enabled,
    permission,
    capable: supported(),
    isInstalled,
    loading,
    busy,
    error,
    message,
    refresh,
    toggle,
  };
  return (
    <DeviceContext.Provider value={state}>
      {children}
      {prompt && (
        <Modal
          title="¿Activar notificaciones en este dispositivo?"
          onClose={() => {
            if (!busy) setPrompt(false);
          }}
        >
          <div className="modal-body device-welcome">
            <div className="device-welcome-icon">
              <Bell size={30} />
            </div>
            <p>
              Recibe avisos cuando te asignen un pendiente, lo actualicen, comenten o agreguen
              evidencia. También verás los avisos de pendientes sin responsable de tus workspaces.
            </p>
            <p className="muted">
              Puedes cambiar esta decisión en Ajustes → Notificaciones. Solo afecta a este
              dispositivo.
            </p>
            {permission === 'denied' && (
              <p className="device-permission-help">
                El navegador tiene el permiso bloqueado. Revisa cómo habilitarlo desde la
                configuración.
              </p>
            )}
            <ErrorBox message={error} />
            {message && <p role="status">{message}</p>}
            <div className="form-actions">
              <button className="btn btn-ghost" disabled={busy} onClick={() => setPrompt(false)}>
                Ahora no
              </button>
              {permission === 'denied' ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setPrompt(false);
                    location.hash = 'settings/notifications';
                  }}
                >
                  Ir a ajustes
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void toggle().then((ok) => {
                      if (ok) setPrompt(false);
                    })
                  }
                >
                  <Bell size={17} />
                  {busy ? 'Activando…' : 'Activar notificaciones'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </DeviceContext.Provider>
  );
}
export function DeviceNotificationSettings() {
  const state = useContext(DeviceContext);
  if (!state) return null;
  const {
    enabled,
    capable,
    permission,
    isInstalled,
    loading,
    busy,
    error,
    message,
    toggle,
    refresh,
  } = state;
  const needsInstall =
    (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) &&
    !isInstalled;
  const label = loading
    ? 'Comprobando'
    : !capable || needsInstall
      ? 'No disponible'
      : enabled
        ? 'Activadas'
        : permission === 'denied'
          ? 'Permiso bloqueado'
          : 'Desactivadas';
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PREFERENCIAS PERSONALES</div>
          <h1>Notificaciones</h1>
          <p>Elige si esta computadora o teléfono recibe avisos fuera de la app.</p>
        </div>
      </div>
      <section
        className="card device-settings-card"
        aria-labelledby="device-settings-title"
        data-update-blocked={busy}
      >
        <div className="settings-panel-heading">
          <span className="settings-panel-icon">
            <MonitorSmartphone size={23} />
          </span>
          <div>
            <h2 id="device-settings-title">Este dispositivo</h2>
            <p>La configuración de tus otros dispositivos se conserva.</p>
          </div>
          <Badge color={enabled ? 'green' : 'neutral'}>{label}</Badge>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <p role="status">Comprobando el permiso y la suscripción…</p>
        ) : (
          <div className="device-settings-action">
            <div>
              <strong>
                {enabled
                  ? 'Avisos activados en este dispositivo'
                  : 'Recibe avisos aunque no tengas la app abierta'}
              </strong>
              <p>
                {needsInstall
                  ? 'En iPhone o iPad, agrega AegiTasks a la pantalla de inicio y abre la app para activar los avisos.'
                  : !capable
                    ? 'Este navegador no permite notificaciones push. El historial de la campanita sigue disponible.'
                    : permission === 'denied'
                      ? 'El permiso está bloqueado. Habilítalo en los ajustes de notificaciones del navegador o del sistema y vuelve aquí.'
                      : 'Al activar los avisos, el navegador te solicitará permiso si todavía no lo concediste.'}
              </p>
            </div>
            {capable && !needsInstall && (
              <button
                className={`btn ${enabled ? 'btn-ghost' : 'btn-primary'}`}
                disabled={busy || (!enabled && permission === 'denied')}
                onClick={() => void toggle()}
              >
                {enabled ? <BellOff size={17} /> : <Bell size={17} />}
                {busy ? 'Actualizando…' : enabled ? 'Desactivar' : 'Activar en este dispositivo'}
              </button>
            )}
          </div>
        )}
        {(error || permission === 'denied') && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => void refresh()}>
            Comprobar de nuevo
          </button>
        )}
        {message && (
          <p role="status" className="device-settings-message">
            {message}
          </p>
        )}
      </section>
      <section className="card settings-explanation">
        <h2>Qué avisos recibirás</h2>
        <ul>
          <li>
            <CheckCircle2 size={18} />
            <span>
              Creación, cambios, comentarios y nuevas evidencias de los pendientes asignados a ti
              cuando actúa otra persona.
            </span>
          </li>
          <li>
            <Bell size={18} />
            <span>
              Pendientes sin responsable de tus workspaces: todos los integrantes con acceso reciben
              el mismo aviso.
            </span>
          </li>
          <li>
            <ShieldCheck size={18} />
            <span>
              El historial de la campanita funciona aunque desactives los avisos del dispositivo.
              Solo ves contenido al que tienes acceso.
            </span>
          </li>
        </ul>
      </section>
    </>
  );
}
