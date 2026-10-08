import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useChanges } from './changes';
import type { ChatRoom } from './ChatContext';

export type Presence = 'online' | 'away' | 'offline';
export type PresenceMap = Record<string, Presence> | null;
const idleAfter = 5 * 60 * 1000;

export function useChatPresence(enabled: boolean) {
  const [presence, setPresence] = useState<PresenceMap>(null);
  const token = useRef('');
  const pulseRef = useRef(() => {});
  const request = useRef(0);
  const available = useRef(false);
  const reload = useCallback(async () => {
    const number = ++request.current;
    try {
      const result = await api<Record<string, Presence>>('/chat/presence');
      if (number === request.current) {
        available.current = true;
        setPresence(result);
      }
    } catch {
      if (number === request.current) {
        available.current = false;
        setPresence(null);
      }
    }
  }, []);
  useChanges(['presence', 'chat', 'access'], () => {
    if (enabled) void reload();
  });
  useEffect(() => {
    if (!enabled) {
      setPresence(null);
      return;
    }
    let alive = true;
    let lastActivity = Date.now();
    let lastSent = 0;
    let lastState: boolean | undefined;
    let sending = false;
    let queued = false;
    const active = () =>
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      Date.now() - lastActivity < idleAfter;
    const pulse = () => {
      if (!alive || !token.current) return;
      const current = active();
      if (sending) {
        queued = true;
        return;
      }
      if (current === lastState && Date.now() - lastSent < 25_000) return;
      const connection = token.current;
      sending = true;
      lastState = current;
      lastSent = Date.now();
      void api(`/chat/presence/${connection}`, 'PUT', { active: current })
        .then(() => {
          if (alive && !available.current) void reload();
        })
        .catch(() => {
          if (alive) {
            lastState = undefined;
            available.current = false;
            setPresence(null);
          }
        })
        .finally(() => {
          sending = false;
          if (queued) {
            queued = false;
            pulse();
          }
        });
    };
    pulseRef.current = () => {
      lastState = undefined;
      pulse();
    };
    const activity = () => {
      lastActivity = Date.now();
      pulse();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') {
        lastActivity = Date.now();
        void reload();
      }
      pulse();
    };
    const timer = setInterval(pulse, 30_000);
    document.addEventListener('pointerdown', activity, { passive: true });
    document.addEventListener('pointermove', activity, { passive: true });
    document.addEventListener('keydown', activity);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', activity);
    window.addEventListener('blur', pulse);
    window.addEventListener('online', visibility);
    return () => {
      alive = false;
      token.current = '';
      request.current++;
      clearInterval(timer);
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('pointermove', activity);
      document.removeEventListener('keydown', activity);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', activity);
      window.removeEventListener('blur', pulse);
      window.removeEventListener('online', visibility);
    };
  }, [enabled, reload]);
  const connect = useCallback(
    (connectionId: string) => {
      token.current = connectionId;
      pulseRef.current();
      void reload();
    },
    [reload],
  );
  const disconnect = useCallback(() => {
    token.current = '';
    request.current++;
    available.current = false;
    setPresence(null);
  }, []);
  return { presence, connect, disconnect };
}

export function PresenceBadge({
  userId,
  presence,
  active = true,
}: {
  userId: string;
  presence: PresenceMap;
  active?: boolean;
}) {
  const status = !active ? 'inactive' : presence ? presence[userId] || 'offline' : 'unknown';
  const label = {
    online: 'Conectado',
    away: 'Ausente',
    offline: 'Desconectado',
    unknown: 'Estado no disponible',
    inactive: 'Cuenta desactivada',
  }[status];
  return (
    <span className="chat-presence" data-presence={status}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function RoomPresence({
  room,
  userId,
  presence,
}: {
  room: ChatRoom;
  userId: string;
  presence: PresenceMap;
}) {
  if (!room.isGroup) {
    const other = room.members.find((m) => m.userId !== userId);
    return other ? (
      <PresenceBadge userId={other.userId} active={other.active} presence={presence} />
    ) : null;
  }
  const online = room.members.filter((m) => m.active && presence?.[m.userId] === 'online').length;
  const away = room.members.filter((m) => m.active && presence?.[m.userId] === 'away').length;
  return (
    <span className="chat-group-presence">
      {room.members.length} integrantes ·{' '}
      {presence
        ? `${online} ${online === 1 ? 'conectado' : 'conectados'}${away ? ` · ${away} ${away === 1 ? 'ausente' : 'ausentes'}` : ''}`
        : 'Estado no disponible'}
    </span>
  );
}
