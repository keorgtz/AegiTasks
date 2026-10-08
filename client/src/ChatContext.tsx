import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MessageCircle } from 'lucide-react';
import { api, errorMessage } from './api';
import { emitChanges, useChanges } from './changes';
import { ChatLiveNotifications } from './ChatNotifications';
import { useChatPresence, type PresenceMap } from './ChatPresence';

export interface ChatRoom {
  id: string;
  name: string;
  isGroup: boolean;
  ownerId: string;
  version: string;
  unread: number;
  muted: boolean;
  notificationMode: string;
  preview: string | null;
  members: { userId: string; name: string; active: boolean }[];
}
export interface ChatDraft {
  body: string;
  files: File[];
  clientId: string;
  task: { id: string; title: string } | null;
}
const blank = (): ChatDraft => ({ body: '', files: [], clientId: crypto.randomUUID(), task: null });
interface State {
  presence: PresenceMap;
  rooms: ChatRoom[];
  error: string;
  loading: boolean;
  drafts: Record<string, ChatDraft>;
  busyId: string;
  update: (id: string, value: Partial<ChatDraft>) => void;
  send: (id: string) => Promise<boolean>;
  reload: () => Promise<void>;
}
const Context = createContext<State | null>(null);
export function ChatProvider({
  userId,
  enabled,
  children,
}: {
  userId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const { presence, connect, disconnect } = useChatPresence(enabled);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, ChatDraft>>(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(`aegitasks-chat-drafts-${userId}`) || '{}',
      ) as Record<string, Omit<ChatDraft, 'files'>>;
      return Object.fromEntries(
        Object.entries(saved).map(([key, value]) => [key, { ...value, files: [] }]),
      );
    } catch {
      return {};
    }
  });
  const draftsRef = useRef(drafts);
  const busy = useRef('');
  const [busyId, setBusyId] = useState('');
  const request = useRef(0);
  const reload = useCallback(async () => {
    const number = ++request.current;
    try {
      const result = await api<ChatRoom[]>('/chat');
      if (number === request.current) {
        setRooms(result);
        setError('');
        setLoading(false);
      }
    } catch (e) {
      if (number === request.current) {
        setError(errorMessage(e));
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    if (!enabled) {
      request.current++;
      setRooms([]);
      setLoading(false);
      return;
    }
    void reload();
    const events = new EventSource('/api/chat/events');
    const ready = (event: Event) => {
      connect(JSON.parse((event as MessageEvent).data).connectionId);
      void reload();
      emitChanges(['chat', 'chat-notifications']);
    };
    events.addEventListener('ready', ready);
    events.addEventListener('error', disconnect);
    events.addEventListener('change', (event) =>
      emitChanges(JSON.parse((event as MessageEvent).data)),
    );
    events.addEventListener('revoked', (event) => {
      events.close();
      disconnect();
      request.current++;
      setRooms([]);
      if ((event as MessageEvent).data === '401')
        window.dispatchEvent(new Event('session-expired'));
      else emitChanges(['access']);
    });
    // EventSource reconnects automatically; ready refreshes messages missed while offline.
    return () => {
      events.close();
      disconnect();
      request.current++;
    };
  }, [enabled, reload, connect, disconnect]);
  useChanges(['chat', 'access'], () => {
    if (enabled) void reload();
  });
  useEffect(() => {
    const visible = () => {
      if (enabled && document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [enabled, reload]);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `aegitasks-chat-drafts-${userId}`,
        JSON.stringify(
          Object.fromEntries(
            Object.entries(drafts)
              .filter(([, d]) => d.body || d.task)
              .map(([key, { body, clientId, task }]) => [key, { body, clientId, task }]),
          ),
        ),
      );
    } catch {
      /* Drafts remain in memory if storage is unavailable. */
    }
  }, [drafts, userId]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (
        Object.values(draftsRef.current).some((d) => d.body || d.task || d.files.length) ||
        busy.current
      )
        event.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, []);
  const update = (id: string, value: Partial<ChatDraft>) => {
    const next = {
      ...draftsRef.current,
      [id]: { ...(draftsRef.current[id] || blank()), ...value, clientId: crypto.randomUUID() },
    };
    draftsRef.current = next;
    setDrafts(next);
  };
  async function send(id: string) {
    if (busy.current) return false;
    const draft = draftsRef.current[id];
    if (!draft) return false;
    busy.current = id;
    setBusyId(id);
    setError('');
    const form = new FormData();
    form.set('body', draft.body);
    form.set('clientId', draft.clientId);
    if (draft.task) form.set('taskId', draft.task.id);
    for (const file of draft.files) form.append('files', file);
    try {
      await api(`/chat/${id}/messages`, 'POST', form);
      if (draftsRef.current[id]?.clientId === draft.clientId) {
        const next = { ...draftsRef.current, [id]: blank() };
        draftsRef.current = next;
        setDrafts(next);
      }
      emitChanges(['chat']);
      await reload();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      busy.current = '';
      setBusyId('');
    }
  }
  return (
    <Context.Provider
      value={{ rooms, presence, error, loading, drafts, busyId, update, send, reload }}
    >
      {children}
      <ChatLiveNotifications userId={userId} enabled={enabled} />
      <span
        hidden
        data-update-blocked={
          !!busyId ||
          (enabled &&
            Object.entries(drafts).some(
              ([id, d]) =>
                rooms.some((room) => room.id === id) && (!!d.body || !!d.task || !!d.files.length),
            ))
        }
      />
    </Context.Provider>
  );
}
export function useChat() {
  const state = useContext(Context);
  if (!state) throw new Error('ChatProvider is required');
  return state;
}
export function chatName(room: ChatRoom, userId: string) {
  return room.isGroup
    ? room.name
    : room.members.find((m) => m.userId !== userId)?.name || 'Conversación';
}
export function ChatButton({ onOpen }: { onOpen: () => void }) {
  const { rooms } = useChat();
  const unread = rooms.reduce((n, room) => n + room.unread, 0);
  return (
    <button
      className="btn-icon notification-bell chat-header-button"
      aria-label={unread ? `Chat: ${unread} sin leer` : 'Chat'}
      onClick={onOpen}
    >
      <MessageCircle size={19} />
      {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
  );
}
