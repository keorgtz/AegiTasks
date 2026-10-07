import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, errorMessage } from './api';
import { useChanges } from './changes';
import { ErrorBox, Modal } from './components';
import './styles/notifications.css';

interface Notice {
  id: string;
  spaceId: string;
  workItemId: string;
  message: string;
  title: string;
  spaceName: string;
  createdAt: string;
  readAt: string | null;
}
interface Notices {
  items: Notice[];
  unreadCount: number;
  total: number;
  page: number;
  pageSize: number;
}
const empty: Notices = { items: [], unreadCount: 0, total: 0, page: 1, pageSize: 30 };
const supported = () =>
  window.isSecureContext &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;
function decodeKey(key: string) {
  const text = atob(
    key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4),
  );
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}
export function NotificationCenter({ onOpen }: { onOpen: (notice: Notice) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(empty);
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supported() ? Notification.permission : 'default',
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestNumber = useRef(0);
  useEffect(() => {
    if (!supported()) return;
    let alive = true;
    let status: PermissionStatus | undefined;
    const update = () => {
      if (alive) setPermission(Notification.permission);
    };
    update();
    void navigator.permissions
      ?.query({ name: 'notifications' })
      .then((result) => {
        if (!alive) return;
        status = result;
        status.addEventListener('change', update);
      })
      .catch(() => {
        /* Some mobile browsers expose Notification permission without Permissions API. */
      });
    return () => {
      alive = false;
      status?.removeEventListener('change', update);
    };
  }, [open]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const request = ++requestNumber.current;
      const result = await api<Notices>(
        `/notifications?page=${page}&unread=${unread}`,
        'GET',
        undefined,
        signal,
      );
      if (!signal?.aborted && request === requestNumber.current) {
        if (!result.items.length && page > 1)
          setPage(Math.max(1, Math.ceil(result.total / result.pageSize)));
        setData(result);
        setLoading(false);
      }
    },
    [page, unread],
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal).catch((e) => {
      if (!controller.signal.aborted) {
        setError(errorMessage(e));
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [load]);
  useChanges(
    ['notifications', 'access'],
    () => void load().catch((e) => setError(errorMessage(e))),
  );
  useEffect(() => {
    const controller = new AbortController();
    async function refreshDevice() {
      if (!supported()) return;
      setPermission(Notification.permission);
      const status = await api<{ enabled: boolean }>(
        '/notifications/device',
        'GET',
        undefined,
        controller.signal,
      );
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (status.enabled && subscription && Notification.permission === 'granted')
        await api('/notifications/devices', 'POST', subscription.toJSON(), controller.signal);
      if (!controller.signal.aborted)
        setEnabled(status.enabled && !!subscription && Notification.permission === 'granted');
    }
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void load(controller.signal).catch((e) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        });
        void refreshDevice().catch((e) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        });
      }
    };
    void refreshDevice().catch((e) => {
      if (!controller.signal.aborted) setError(errorMessage(e));
    });
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [load]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const received = (event: MessageEvent) => {
      if (event.data?.type === 'AEGITASKS_NOTIFICATIONS')
        void load().catch((e) => setError(errorMessage(e)));
    };
    navigator.serviceWorker.addEventListener('message', received);
    return () => navigator.serviceWorker.removeEventListener('message', received);
  }, [load]);
  async function togglePush() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (enabled) {
        await api('/notifications/device', 'DELETE');
        setEnabled(false);
        const registration = await navigator.serviceWorker.getRegistration();
        await (await registration?.pushManager.getSubscription())?.unsubscribe();
        setMessage(
          'Notificaciones desactivadas en este dispositivo. El historial sigue disponible.',
        );
      } else {
        // Request permission directly from the click, before network or worker waits.
        const next = await Notification.requestPermission();
        setPermission(next);
        if (next !== 'granted') {
          setMessage('Puedes habilitar el permiso desde los ajustes de tu navegador.');
          return;
        }
        const config = await api<{ publicKey: string }>('/notifications/push-config');
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    'La app todavía se está preparando. Intenta de nuevo en unos segundos.',
                  ),
                ),
              10000,
            ),
          ),
        ]);
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
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const iosNeedsInstall =
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !matchMedia('(display-mode: standalone)').matches;
  return (
    <>
      <button
        className="btn-icon notification-bell"
        aria-label={`Notificaciones${data.unreadCount ? `: ${data.unreadCount} sin leer` : ''}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Bell size={19} />
        {data.unreadCount > 0 && (
          <span className="notification-count">
            {data.unreadCount > 99 ? '99+' : data.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <Modal title="Notificaciones" onClose={() => setOpen(false)}>
          <div className="notification-center">
            <div className="notification-device">
              <div>
                <strong>
                  {enabled
                    ? 'Avisos activados en este dispositivo'
                    : 'Recibe avisos aunque no tengas la app abierta'}
                </strong>
                <p>
                  {iosNeedsInstall
                    ? 'En iPhone o iPad, agrega AegiTasks a la pantalla de inicio y abre la app para activar los avisos.'
                    : !supported()
                      ? 'Este navegador no permite notificaciones push. Puedes consultar aquí tu historial.'
                      : permission === 'denied'
                        ? 'El permiso está bloqueado. Habilítalo desde los ajustes del navegador para activar los avisos.'
                        : 'Asignaciones, cambios, comentarios y nuevas evidencias de tus pendientes.'}
                </p>
              </div>
              {supported() && !iosNeedsInstall && (
                <button
                  className={`btn ${enabled ? 'btn-ghost' : 'btn-primary'}`}
                  disabled={busy || permission === 'denied'}
                  onClick={() => void togglePush()}
                >
                  {enabled ? <BellOff size={17} /> : <Bell size={17} />}
                  {enabled ? 'Desactivar' : 'Activar en este dispositivo'}
                </button>
              )}
            </div>
            <ErrorBox message={error} />
            {error && (
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setError('');
                  })
                }
              >
                Reintentar
              </button>
            )}
            {message && (
              <p role="status" className="muted">
                {message}
              </p>
            )}
            <div className="notification-toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={unread}
                  onChange={(e) => {
                    setUnread(e.target.checked);
                    setPage(1);
                  }}
                />{' '}
                Solo sin leer
              </label>
              <button
                className="btn btn-ghost"
                disabled={busy || !data.unreadCount}
                onClick={() =>
                  void run(async () => {
                    await api('/notifications/read-all', 'PUT');
                  })
                }
              >
                <CheckCheck size={17} /> Marcar todas leídas
              </button>
            </div>
            {loading ? (
              <p role="status">Cargando notificaciones…</p>
            ) : !data.items.length ? (
              <p className="notification-empty">
                {unread
                  ? 'No tienes notificaciones sin leer.'
                  : 'Aquí aparecerán los avisos de tus pendientes y Spaces.'}
              </p>
            ) : (
              <ul className="notification-list">
                {data.items.map((n) => (
                  <li key={n.id} className={n.readAt ? '' : 'unread'}>
                    <button
                      className="notification-open"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (!n.readAt) await api(`/notifications/${n.id}/read`, 'PUT');
                          setOpen(false);
                          onOpen(n);
                        })
                      }
                    >
                      <span
                        className="notification-dot"
                        aria-label={n.readAt ? 'Leída' : 'Sin leer'}
                      />
                      <span>
                        <strong>{n.title}</strong>
                        <span>{n.message}</span>
                        <small>
                          {n.spaceName} ·{' '}
                          {new Date(n.createdAt).toLocaleString('es-MX', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </small>
                      </span>
                    </button>
                    {!n.readAt && (
                      <button
                        className="btn-icon"
                        aria-label={`Marcar leída: ${n.title}`}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(`/notifications/${n.id}/read`, 'PUT');
                          })
                        }
                      >
                        <CheckCheck size={18} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.total > data.pageSize && (
              <div className="notification-pagination">
                <button
                  className="btn-icon"
                  aria-label="Notificaciones anteriores"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
                </span>
                <button
                  className="btn-icon"
                  aria-label="Notificaciones siguientes"
                  disabled={page * data.pageSize >= data.total || loading}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
