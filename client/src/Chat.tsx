import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Download,
  FileText,
  Link2,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import { api, ApiError, errorMessage } from './api';
import { useChanges } from './changes';
import { Empty, ErrorBox, Field, Modal } from './components';
import { chatName, useChat, type ChatRoom } from './ChatContext';
import { ChatNotificationSettings, clearChatNotices } from './ChatNotifications';
import type { Space, User } from './types';
import './styles/chat.css';

interface Message {
  id: string;
  userId: string;
  author: string;
  sequence: number;
  body: string;
  createdAt: string;
  task: { available: boolean; id?: string; title?: string; spaceId?: string } | null;
  files: { id: string; name: string; contentType: string; size: number }[];
}
export default function ChatPage({
  user,
  spaces,
  activeSpace,
  route,
  navigate,
  openTask,
}: {
  user: User;
  spaces: Space[];
  activeSpace: string;
  route: string;
  navigate: (route: string) => void;
  openTask: (id: string, space: string) => void;
}) {
  const chat = useChat();
  const selected = route.split('/')[1] || '';
  const room = chat.rooms.find((r) => r.id === selected);
  const [filter, setFilter] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [manage, setManage] = useState(false);
  const [share, setShare] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [attachments, setAttachments] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const initial = useRef(true);
  const request = useRef(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const draft = chat.drafts[selected] || { body: '', files: [], task: null };
  const busy = chat.busyId === selected;
  useEffect(() => {
    const content = page.current?.closest<HTMLElement>('.app-content');
    const viewport = window.visualViewport;
    if (!content || !viewport) return;
    const resize = () => {
      // Follow the visible viewport when a mobile keyboard resizes/pans it; preserve pinch zoom.
      if (viewport.scale !== 1) return;
      content.style.setProperty('--chat-viewport-height', `${viewport.height}px`);
      content.style.setProperty('--chat-viewport-top', `${viewport.offsetTop}px`);
      content.dataset.chatKeyboard = String(innerHeight - viewport.height > 80);
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
      content.style.removeProperty('--chat-viewport-height');
      content.style.removeProperty('--chat-viewport-top');
      delete content.dataset.chatKeyboard;
    };
  }, []);
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    const resize = () => {
      element.style.height = '0px';
      const maximum = Math.min(160, Math.max(44, innerHeight * 0.25));
      const style = getComputedStyle(element);
      const fullHeight =
        element.scrollHeight +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.borderBottomWidth);
      element.style.height = `${Math.min(maximum, Math.max(44, fullHeight))}px`;
      element.style.overflowY = fullHeight > maximum ? 'auto' : 'hidden';
    };
    resize();
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        resize();
      }
    });
    let width = element.clientWidth;
    observer.observe(element);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [draft.body, selected, !!room]);
  const load = useCallback(
    async (reset = false) => {
      if (!selected) return;
      const number = ++request.current;
      try {
        const result = await api<{ items: Message[]; hasMore: boolean }>(
          `/chat/${selected}/messages`,
        );
        if (number !== request.current || selectedRef.current !== selected) return;
        const nearBottom =
          !scroll.current ||
          scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight <
            120;
        setMessages((old) =>
          reset
            ? result.items
            : Array.from(new Map([...old, ...result.items].map((m) => [m.id, m])).values()).sort(
                (a, b) => a.sequence - b.sequence,
              ),
        );
        if (reset) setMore(result.hasMore);
        setError('');
        setLoading(false);
        if (document.visibilityState === 'visible' && result.items.length)
          void api(`/chat/${selected}/read`, 'POST', {
            sequence: result.items.at(-1)!.sequence,
          })
            .then(() => clearChatNotices(user.id, selected, result.items.at(-1)!.sequence))
            .catch((e) => setError(errorMessage(e)));
        if (initial.current || nearBottom) {
          initial.current = false;
          requestAnimationFrame(() => {
            scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
          });
        }
      } catch (e) {
        if (number === request.current) {
          setError(errorMessage(e));
          setLoading(false);
          if (e instanceof ApiError && [403, 404].includes(e.status)) setMessages([]);
        }
      }
    },
    [selected, user.id],
  );
  useEffect(() => {
    request.current++;
    setMessages([]);
    setMore(false);
    setLoading(!!selected);
    initial.current = true;
    void load(true);
    return () => {
      request.current++;
    };
  }, [load, selected]);
  useChanges(['chat'], () => void load());
  useChanges(['access'], () => {
    setMessages([]);
    void load(true);
  });
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [load]);
  async function older() {
    if (!messages.length || historyBusy) return;
    const id = selected;
    setHistoryBusy(true);
    const previousHeight = scroll.current?.scrollHeight || 0;
    try {
      const result = await api<{ items: Message[]; hasMore: boolean }>(
        `/chat/${id}/messages?before=${messages[0]!.sequence}`,
      );
      if (selectedRef.current !== id) return;
      setMessages((old) =>
        Array.from(new Map([...result.items, ...old].map((m) => [m.id, m])).values()).sort(
          (a, b) => a.sequence - b.sequence,
        ),
      );
      setMore(result.hasMore);
      requestAnimationFrame(() => {
        if (scroll.current)
          scroll.current.scrollTop += scroll.current.scrollHeight - previousHeight;
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setHistoryBusy(false);
    }
  }
  async function send() {
    if (await chat.send(selected)) {
      initial.current = true;
      await load();
    }
  }
  function attach(files: File[]) {
    const next = [...draft.files, ...files];
    if (next.length > 5 || next.reduce((n, f) => n + f.size, 0) > 25 * 1024 * 1024) {
      setError('Máximo 5 archivos y 25 MB por mensaje.');
      return;
    }
    chat.update(selected, { files: next });
    setError('');
  }
  return (
    <section
      ref={page}
      className={`chat-page ${room ? 'chat-conversation-open' : ''}`}
      aria-label="Chat entre usuarios"
    >
      <aside className="chat-sidebar">
        <div className="chat-title">
          <div>
            <div className="eyebrow">CONVERSACIONES</div>
            <h1>Chat</h1>
          </div>
          <button className="btn-icon" aria-label="Nuevo chat" onClick={() => setNewChat(true)}>
            <Plus size={21} />
          </button>
        </div>
        <p className="muted small">Tus conversaciones, en todos los Spaces.</p>
        <div className="chat-search">
          <Search size={17} />
          <input
            aria-label="Buscar conversaciones"
            placeholder="Buscar conversación…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <ErrorBox message={chat.error} />
        {chat.error && (
          <button className="btn btn-ghost" onClick={() => void chat.reload()}>
            Reintentar
          </button>
        )}
        <nav aria-label="Conversaciones" className="chat-rooms">
          {chat.loading ? (
            <p role="status">Cargando conversaciones…</p>
          ) : (
            chat.rooms
              .filter((r) => chatName(r, user.id).toLowerCase().includes(filter.toLowerCase()))
              .map((r) => (
                <button
                  key={r.id}
                  className={`chat-room ${r.id === selected ? 'selected' : ''}`}
                  aria-current={r.id === selected ? 'page' : undefined}
                  onClick={() => navigate(`chat/${r.id}`)}
                >
                  <span className="chat-room-icon">
                    {r.isGroup ? <Users size={20} /> : <MessageCircle size={20} />}
                  </span>
                  <span className="chat-room-copy">
                    <strong>{chatName(r, user.id)}</strong>
                    <small>
                      {r.preview ||
                        (r.isGroup
                          ? `${r.members.length} integrantes`
                          : 'Comienza la conversación')}
                    </small>
                  </span>
                  {r.unread > 0 && <span className="chat-unread">{r.unread}</span>}
                  {r.muted && (
                    <BellOff
                      className="chat-muted-icon"
                      size={16}
                      aria-label="Notificaciones silenciadas"
                    />
                  )}
                </button>
              ))
          )}
        </nav>
        {!chat.loading && !chat.rooms.length && (
          <div className="chat-list-empty">
            <MessageCircle size={30} />
            <p>Conversa con una persona o crea un grupo.</p>
            <button className="btn btn-primary" onClick={() => setNewChat(true)}>
              Comenzar chat
            </button>
          </div>
        )}
      </aside>
      <div className="chat-conversation">
        {!room ? (
          <Empty icon={<MessageCircle size={40} />} title="Un lugar para conversar">
            Elige una conversación o comienza una nueva. Los chats no pertenecen a ningún workspace.
          </Empty>
        ) : (
          <>
            <header className="chat-head">
              <button
                className="btn-icon chat-back"
                aria-label="Volver a conversaciones"
                onClick={() => navigate('chat')}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2>{chatName(room, user.id)}</h2>
                <p className="muted small">
                  {room.isGroup
                    ? `${room.members.length} integrantes · Grupo`
                    : 'Conversación privada'}
                </p>
              </div>
              <button
                className="btn-icon"
                aria-label="Notificaciones del chat"
                onClick={() => setNotifications(true)}
              >
                {room.muted ? <BellOff size={20} /> : <Bell size={20} />}
              </button>
              {room.isGroup && (
                <button
                  className="btn-icon"
                  aria-label="Integrantes del grupo"
                  onClick={() => setManage(true)}
                >
                  <Settings2 size={20} />
                </button>
              )}
            </header>
            <ErrorBox message={error || chat.error} />
            <div
              className="chat-messages"
              ref={scroll}
              role="log"
              aria-label="Mensajes"
              aria-live="polite"
            >
              {hasMore && (
                <button
                  className="btn btn-ghost chat-history"
                  disabled={historyBusy}
                  onClick={() => void older()}
                >
                  {historyBusy ? 'Cargando…' : 'Mensajes anteriores'}
                </button>
              )}
              {loading ? (
                <p role="status">Cargando mensajes…</p>
              ) : !messages.length ? (
                <p className="chat-greeting">Todavía no hay mensajes. Saluda para comenzar.</p>
              ) : (
                messages.map((m) => (
                  <article
                    key={m.id}
                    className={`chat-message ${m.userId === user.id ? 'mine' : ''}`}
                  >
                    <div className="chat-message-meta">
                      <strong>{m.userId === user.id ? 'Tú' : m.author}</strong>
                      <time dateTime={m.createdAt}>
                        {new Date(m.createdAt).toLocaleString('es-MX', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </time>
                    </div>
                    {m.body && <p className="chat-message-text">{m.body}</p>}
                    {m.task &&
                      (m.task.available ? (
                        <button
                          className="chat-task-link"
                          onClick={() => openTask(m.task!.id!, m.task!.spaceId!)}
                        >
                          <Link2 size={18} />
                          <span>
                            <small>Pendiente compartido</small>
                            <strong>{m.task.title}</strong>
                          </span>
                        </button>
                      ) : (
                        <p className="muted small">
                          El pendiente ya no está disponible o no tienes acceso.
                        </p>
                      ))}
                    {m.files.map((file) => (
                      <div key={file.id} className="chat-file">
                        {file.contentType.startsWith('image/') ? (
                          <a href={`/api/chat/files/${file.id}`} target="_blank" rel="noreferrer">
                            <img
                              src={`/api/chat/files/${file.id}`}
                              alt={file.name}
                              loading="lazy"
                            />
                          </a>
                        ) : file.contentType.startsWith('video/') ? (
                          <video
                            src={`/api/chat/files/${file.id}`}
                            controls
                            preload="metadata"
                            aria-label={file.name}
                          />
                        ) : (
                          <FileText size={24} />
                        )}
                        <a
                          className="chat-download"
                          href={`/api/chat/files/${file.id}?download=true`}
                        >
                          <Download size={16} />
                          <span>
                            {file.name}
                            <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                          </span>
                        </a>
                      </div>
                    ))}
                  </article>
                ))
              )}
            </div>
            <form
              className="chat-composer"
              data-update-blocked={busy || !!draft.body || !!draft.files.length || !!draft.task}
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {draft.task && (
                <div className="chat-draft-chip">
                  <Link2 size={17} />
                  <span>{draft.task.title}</span>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label="Quitar pendiente adjunto"
                    disabled={busy}
                    onClick={() => chat.update(selected, { task: null })}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {!!draft.files.length && (
                <div className="chat-draft-files">
                  {draft.files.map((file, index) => (
                    <div className="chat-draft-chip" key={index}>
                      <Paperclip size={15} />
                      <span>{file.name}</span>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Quitar ${file.name}`}
                        disabled={busy}
                        onClick={() =>
                          chat.update(selected, {
                            files: draft.files.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="chat-composer-row">
                <input
                  ref={input}
                  type="file"
                  multiple
                  hidden
                  accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.zip,.txt,.md,.csv,.json,.log,.mp4,.webm"
                  onChange={(e) => {
                    attach(Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="Agregar al mensaje"
                  disabled={busy}
                  onClick={() => setAttachments(true)}
                >
                  <Plus size={21} />
                </button>
                <textarea
                  ref={textarea}
                  aria-label="Mensaje"
                  placeholder="Escribe un mensaje…"
                  maxLength={4000}
                  rows={1}
                  value={draft.body}
                  disabled={busy}
                  onChange={(e) => chat.update(selected, { body: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary chat-send"
                  aria-label={busy ? 'Enviando…' : 'Enviar'}
                  title={busy ? 'Enviando…' : 'Enviar'}
                  disabled={busy || (!draft.body.trim() && !draft.files.length && !draft.task)}
                >
                  <Send size={17} />
                  <span className="sr-only">{busy ? 'Enviando…' : 'Enviar'}</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>
      {attachments && (
        <Modal title="Agregar al mensaje" onClose={() => setAttachments(false)}>
          <div className="modal-body chat-attachment-options">
            <button
              className="btn btn-ghost"
              onClick={() => {
                setAttachments(false);
                input.current?.click();
              }}
            >
              <Paperclip size={20} /> Adjuntar archivos
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setAttachments(false);
                setShare(true);
              }}
            >
              <Link2 size={20} /> Compartir pendiente
            </button>
            <p className="muted small">
              Imágenes, documentos y videos. Hasta 5 archivos y 25 MB por mensaje.
            </p>
          </div>
        </Modal>
      )}
      {newChat && (
        <ChatEditor
          user={user}
          onClose={() => setNewChat(false)}
          onSaved={async (id) => {
            setNewChat(false);
            await chat.reload();
            navigate(`chat/${id}`);
          }}
        />
      )}
      {notifications && room && (
        <ChatNotificationSettings
          roomId={room.id}
          userId={user.id}
          name={chatName(room, user.id)}
          onClose={() => setNotifications(false)}
          onSaved={chat.reload}
        />
      )}
      {manage && room && (
        <ChatEditor
          user={user}
          room={room}
          onClose={() => setManage(false)}
          onSaved={async () => {
            setManage(false);
            await chat.reload();
          }}
        />
      )}
      {share && room && (
        <TaskPicker
          roomId={room.id}
          spaces={spaces}
          activeSpace={activeSpace}
          onClose={() => setShare(false)}
          onSelect={(task) => {
            chat.update(selected, { task });
            setShare(false);
          }}
        />
      )}
    </section>
  );
}

function ChatEditor({
  user,
  room,
  onClose,
  onSaved,
}: {
  user: User;
  room?: ChatRoom;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [group, setGroup] = useState(!!room);
  const [name, setName] = useState(room?.name || '');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    items: { id: string; name: string; username: string }[];
    total: number;
  }>({ items: [], total: 0 });
  const [selected, setSelected] = useState<{ id: string; name: string }[]>(
    room?.members
      .filter((m) => m.userId !== user.id)
      .map((m) => ({ id: m.userId, name: m.name })) || [],
  );
  const [busy, setBusy] = useState(false);
  const [version] = useState(room?.version);
  const [error, setError] = useState('');
  const canEdit = !room || room.ownerId === user.id;
  useEffect(() => {
    if (!canEdit) return;
    const controller = new AbortController();
    void api<typeof result>(
      `/chat/users?q=${encodeURIComponent(q)}&page=${page}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [q, page, canEdit]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      if (room) {
        await api(`/chat/${room.id}`, 'PUT', {
          name,
          users: selected.map((u) => u.id),
          version,
        });
        await onSaved(room.id);
      } else {
        const result = await api<{ id: string }>('/chat', 'POST', {
          isGroup: group,
          name,
          users: selected.map((u) => u.id),
        });
        await onSaved(result.id);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={room ? 'Integrantes del grupo' : 'Nueva conversación'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="modal-body chat-editor"
        data-update-blocked={busy || !!name || !!selected.length}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ErrorBox message={error} />
        {!room && (
          <div className="chat-kind">
            <button
              type="button"
              className={`btn ${!group ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setGroup(false);
                setSelected([]);
              }}
            >
              Una persona
            </button>
            <button
              type="button"
              className={`btn ${group ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setGroup(true)}
            >
              Grupo
            </button>
          </div>
        )}
        {group && (
          <Field label="Nombre del grupo">
            <input
              value={name}
              maxLength={80}
              required
              disabled={!canEdit || busy}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}
        <p className="muted small">
          {room
            ? canEdit
              ? 'Puedes agregar o quitar integrantes. Los nuevos integrantes podrán ver el historial.'
              : 'Solo quien creó el grupo puede editar sus integrantes.'
            : 'Busca cualquier usuario activo. No necesita estar en tu workspace.'}
        </p>
        <div className="chat-selected-users">
          {selected.map((u) => (
            <span key={u.id}>
              {u.name}
              {canEdit && (
                <button
                  className="btn-icon"
                  type="button"
                  aria-label={`Quitar ${u.name}`}
                  disabled={busy}
                  onClick={() => setSelected(selected.filter((m) => m.id !== u.id))}
                >
                  <X size={15} />
                </button>
              )}
            </span>
          ))}
          {room && <span>{user.name} · Tú</span>}
        </div>
        {canEdit && (
          <>
            <input
              aria-label="Buscar usuarios"
              placeholder="Nombre o usuario…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <div className="chat-user-options">
              {result.items.map((u) => (
                <label key={u.id}>
                  <input
                    type="checkbox"
                    checked={selected.some((m) => m.id === u.id)}
                    disabled={
                      busy ||
                      (!selected.some((m) => m.id === u.id) &&
                        (group ? selected.length >= 49 : selected.length >= 1))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? [...selected, u] : selected.filter((m) => m.id !== u.id),
                      )
                    }
                  />
                  <span>
                    <strong>{u.name}</strong>
                    <small>@{u.username}</small>
                  </span>
                </label>
              ))}
            </div>
            {!result.items.length && <p className="muted">No hay coincidencias.</p>}
            {result.total > 30 && (
              <div className="chat-pagination">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </button>
                <span>
                  {page} / {Math.ceil(result.total / 30)}
                </span>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={page * 30 >= result.total}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            {canEdit ? 'Cancelar' : 'Cerrar'}
          </button>
          {canEdit && (
            <button className="btn btn-primary" disabled={busy || !selected.length}>
              {busy ? 'Guardando…' : room ? 'Guardar grupo' : 'Comenzar chat'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
function TaskPicker({
  roomId,
  spaces,
  activeSpace,
  onClose,
  onSelect,
}: {
  roomId: string;
  spaces: Space[];
  activeSpace: string;
  onClose: () => void;
  onSelect: (task: { id: string; title: string }) => void;
}) {
  const [space, setSpace] = useState(activeSpace);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: { id: string; title: string }[]; total: number }>({
    items: [],
    total: 0,
  });
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api<typeof result>(
      `/chat/${roomId}/task-options?space=${space}&q=${encodeURIComponent(q)}&page=${page}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [roomId, space, q, page]);
  return (
    <Modal title="Compartir pendiente" onClose={onClose}>
      <div className="modal-body chat-task-picker">
        <p className="muted">
          Solo se muestran pendientes de un workspace al que todos los integrantes tienen acceso.
        </p>
        <Field label="Workspace">
          <select
            value={space}
            onChange={(e) => {
              setSpace(e.target.value);
              setPage(1);
            }}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <input
          aria-label="Buscar pendientes para compartir"
          placeholder="Buscar pendiente…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <ErrorBox message={error} />
        <div className="chat-task-options">
          {result.items.map((t) => (
            <button className="chat-task-link" key={t.id} onClick={() => onSelect(t)}>
              <Link2 size={17} />
              <strong>{t.title}</strong>
            </button>
          ))}
        </div>
        {!result.items.length && (
          <p className="muted">
            No hay pendientes compartibles. Revisa que todos pertenezcan a este workspace y tengan
            acceso a pendientes.
          </p>
        )}
        {result.total > 30 && (
          <div className="chat-pagination">
            <button
              className="btn btn-ghost"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>
              {page} / {Math.ceil(result.total / 30)}
            </span>
            <button
              className="btn btn-ghost"
              disabled={page * 30 >= result.total}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
