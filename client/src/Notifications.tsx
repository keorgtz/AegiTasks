import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';
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
export function NotificationCenter({ onOpen }: { onOpen: (notice: Notice) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(empty);
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestNumber = useRef(0);
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
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void load(controller.signal).catch((e) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        });
      }
    };
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
            <p className="notification-settings-link">
              <a href="#settings/notifications" onClick={() => setOpen(false)}>
                Configurar notificaciones del dispositivo
              </a>
            </p>
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
