import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BellOff, Plus, Trash2, X } from 'lucide-react';
import { api, errorMessage } from './api';
import { emitChanges, useChanges } from './changes';
import { ErrorBox, Field, Modal } from './components';
import './styles/chat-notifications.css';

interface QuietPeriod {
  days: number[];
  startMinute: number;
  endMinute: number;
}
interface Silence {
  mode: 'on' | 'always' | 'until' | 'schedule';
  until: string | null;
  timeZone: string;
  periods: QuietPeriod[] | null;
}
interface Notice {
  id: string;
  roomId: string;
  userId: string;
  title: string;
  count: number;
  sequence: number;
  previews: string[];
  tag: string;
}
const days = [
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mié'],
  [4, 'Jue'],
  [5, 'Vie'],
  [6, 'Sáb'],
  [0, 'Dom'],
] as const;
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const time = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const localDate = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export function clearChatNotices(userId: string, roomId?: string, sequence?: number) {
  navigator.serviceWorker?.controller?.postMessage({
    type: 'AEGITASKS_CHAT_CLEAR',
    userId,
    roomId,
    sequence,
  });
}
export function ChatNotificationSettings({
  roomId,
  userId,
  name,
  onClose,
  onSaved,
}: {
  roomId: string;
  userId: string;
  name: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [settings, setSettings] = useState<Silence>({
    mode: 'on',
    until: null,
    timeZone: deviceZone,
    periods: [],
  });
  const [version, setVersion] = useState<string | null>(null);
  const [until, setUntil] = useState(localDate(new Date(Date.now() + 3600000)));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void api<{ settings: Silence; version: string | null }>(
      `/chat/${roomId}/notifications`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setSettings(
          result.version ? result.settings : { ...result.settings, timeZone: deviceZone },
        );
        setVersion(result.version);
        setLoadFailed(false);
        if (result.settings.until && Date.parse(result.settings.until) > Date.now())
          setUntil(localDate(new Date(result.settings.until)));
        setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(e));
          setLoadFailed(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [roomId, deviceZone, attempt]);
  const change = (value: Partial<Silence>) => {
    setSettings((s) => ({ ...s, ...value }));
    setDirty(true);
  };
  const periods = settings.periods || [];
  function period(index: number, value: Partial<QuietPeriod>) {
    change({ periods: periods.map((p, i) => (i === index ? { ...p, ...value } : p)) });
  }
  function close() {
    if (!busy && (!dirty || confirm('¿Descartar los cambios de notificaciones de este chat?')))
      onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const value = {
        ...settings,
        until: settings.mode === 'until' ? new Date(until).toISOString() : null,
      };
      await api(`/chat/${roomId}/notifications`, 'PUT', { settings: value, version });
      clearChatNotices(userId, roomId);
      emitChanges(['chat', 'chat-notifications']);
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const zoneName = new Intl.DateTimeFormat('es-MX', {
    timeZone: settings.timeZone,
    timeZoneName: 'long',
  })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value;
  return (
    <Modal title="Notificaciones del chat" onClose={close}>
      <form
        className="modal-body chat-notification-settings"
        onSubmit={submit}
        data-update-blocked={dirty || busy}
      >
        <div className="chat-settings-scroll">
          <p className="muted">
            {name} · Estas preferencias solo afectan a tu cuenta, en todos tus dispositivos.
          </p>
          <ErrorBox message={error} />
          {loading ? (
            <p role="status">Cargando preferencias…</p>
          ) : loadFailed ? (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Reintentar
            </button>
          ) : (
            <fieldset disabled={busy}>
              <Field label="Cuándo notificar">
                <select
                  value={settings.mode}
                  onChange={(e) =>
                    change({
                      mode: e.target.value as Silence['mode'],
                      ...(e.target.value === 'schedule' && !periods.length
                        ? {
                            periods: [
                              { days: [1, 2, 3, 4, 5], startMinute: 22 * 60, endMinute: 8 * 60 },
                            ],
                          }
                        : {}),
                    })
                  }
                >
                  <option value="on">Notificaciones activadas</option>
                  <option value="until">Silenciar hasta una fecha</option>
                  <option value="schedule">Silencio por horarios y días</option>
                  <option value="always">Silenciar siempre</option>
                </select>
              </Field>
              {settings.mode === 'until' && (
                <>
                  <div className="chat-mute-durations">
                    {[
                      [1, '1 hora'],
                      [8, '8 horas'],
                      [24, '1 día'],
                      [168, '7 días'],
                    ].map(([hours, label]) => (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        key={hours}
                        onClick={() => {
                          setUntil(localDate(new Date(Date.now() + Number(hours) * 3600000)));
                          setDirty(true);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Field label="Volver a notificar el">
                    <input
                      type="datetime-local"
                      required
                      value={until}
                      min={localDate(new Date())}
                      onChange={(e) => {
                        setUntil(e.target.value);
                        setDirty(true);
                      }}
                    />
                  </Field>
                </>
              )}
              {settings.mode === 'schedule' && (
                <>
                  <p className="chat-mute-zone">
                    Horario: {zoneName}. Se conserva al cambiar de dispositivo.
                  </p>
                  {settings.timeZone !== deviceZone && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => change({ timeZone: deviceZone })}
                    >
                      Usar zona horaria de este dispositivo
                    </button>
                  )}
                  <p className="muted small">
                    Selecciona los días en que comienza el silencio. Si termina al día siguiente, el
                    horario cruza medianoche.
                  </p>
                  {periods.map((p, index) => (
                    <section
                      className="chat-quiet-period"
                      key={index}
                      aria-label={`Horario ${index + 1}`}
                    >
                      <div className="section-heading">
                        <strong>Horario {index + 1}</strong>
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label={`Eliminar horario ${index + 1}`}
                          onClick={() => change({ periods: periods.filter((_, i) => i !== index) })}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                      <div className="chat-quiet-days">
                        {days.map(([id, label]) => (
                          <button
                            type="button"
                            aria-pressed={p.days.includes(id)}
                            key={id}
                            onClick={() =>
                              period(index, {
                                days: p.days.includes(id)
                                  ? p.days.filter((d) => d !== id)
                                  : [...p.days, id],
                              })
                            }
                          >
                            {p.days.includes(id) ? `✓ ${label}` : label}
                          </button>
                        ))}
                      </div>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={p.startMinute === p.endMinute}
                          onChange={(e) =>
                            period(
                              index,
                              e.target.checked
                                ? { startMinute: 0, endMinute: 0 }
                                : { startMinute: 22 * 60, endMinute: 8 * 60 },
                            )
                          }
                        />
                        Todo el día
                      </label>
                      {p.startMinute !== p.endMinute && (
                        <div className="chat-quiet-times">
                          <Field label="Desde">
                            <input
                              type="time"
                              required
                              value={time(p.startMinute)}
                              onChange={(e) =>
                                period(index, { startMinute: minutes(e.target.value) })
                              }
                            />
                          </Field>
                          <Field label="Hasta">
                            <input
                              type="time"
                              required
                              value={time(p.endMinute)}
                              onChange={(e) =>
                                period(index, { endMinute: minutes(e.target.value) })
                              }
                            />
                          </Field>
                        </div>
                      )}
                    </section>
                  ))}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={periods.length >= 14}
                    onClick={() =>
                      change({
                        periods: [
                          ...periods,
                          { days: [0, 1, 2, 3, 4, 5, 6], startMinute: 0, endMinute: 0 },
                        ],
                      })
                    }
                  >
                    <Plus size={17} />
                    Agregar horario
                  </button>
                </>
              )}
              <p className="chat-mute-help">
                <BellOff size={18} />
                <span>
                  Silenciar evita los avisos dentro de la app y del dispositivo. Los mensajes y sus
                  contadores sin leer se conservan.
                </span>
              </p>
            </fieldset>
          )}
        </div>
        {!loading && !loadFailed && (
          <div className="form-actions">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={close}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar preferencias'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

export function ChatLiveNotifications({ userId, enabled }: { userId: string; enabled: boolean }) {
  const [toasts, setToasts] = useState<Notice[]>([]);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const serial = useRef(0);
  const refresh = useCallback(async () => {
    const number = ++serial.current;
    try {
      const notices = await api<Notice[]>('/chat/notifications');
      if (number !== serial.current) return;
      const fresh = initialized.current
        ? notices.filter(
            (n) =>
              !seen.current.has(n.id) &&
              !(document.visibilityState === 'visible' && location.hash === `#chat/${n.roomId}`),
          )
        : [];
      seen.current = new Set(notices.map((n) => n.id));
      initialized.current = true;
      setToasts((old) =>
        [
          ...fresh,
          ...old
            .filter((n) => !fresh.some((next) => next.roomId === n.roomId))
            .flatMap((n) => {
              const current = notices.find((next) => next.roomId === n.roomId);
              return current ? [current] : [];
            }),
        ].slice(0, 3),
      );
    } catch {
      /* Chat's connection indicator handles errors; never show cached private previews. */ setToasts(
        [],
      );
    }
  }, []);
  useEffect(() => {
    initialized.current = false;
    seen.current.clear();
    if (!enabled) {
      serial.current++;
      setToasts([]);
      clearChatNotices(userId);
      return;
    }
    void refresh();
    return () => {
      serial.current++;
    };
  }, [enabled, userId, refresh]);
  useChanges(['chat', 'chat-notifications', 'access'], () => {
    if (enabled) void refresh();
  });
  useEffect(() => {
    const received = (event: MessageEvent) => {
      if (event.data?.type === 'AEGITASKS_CHAT_NOTIFICATIONS')
        emitChanges(['chat', 'chat-notifications']);
    };
    navigator.serviceWorker?.addEventListener('message', received);
    return () => navigator.serviceWorker?.removeEventListener('message', received);
  }, []);
  if (!enabled || !toasts.length) return null;
  return (
    <aside className="chat-live-notices" aria-label="Nuevos mensajes" aria-live="polite">
      {toasts.map((n) => (
        <article className="chat-live-notice" key={n.roomId}>
          <button
            className="chat-live-open"
            onClick={() => {
              location.hash = `chat/${n.roomId}`;
              setToasts((old) => old.filter((t) => t.roomId !== n.roomId));
            }}
          >
            <span className="chat-notification-mark" aria-hidden="true" />
            <div>
              <strong>{n.title}</strong>
              <small>{n.count === 1 ? 'Mensaje nuevo' : `${n.count} mensajes nuevos`}</small>
              {n.previews.slice(-3).map((preview, i) => (
                <p key={i}>{preview}</p>
              ))}
            </div>
          </button>
          <button
            className="btn-icon"
            aria-label={`Cerrar aviso de ${n.title}`}
            onClick={() => setToasts((old) => old.filter((t) => t.roomId !== n.roomId))}
          >
            <X size={17} />
          </button>
        </article>
      ))}
    </aside>
  );
}
