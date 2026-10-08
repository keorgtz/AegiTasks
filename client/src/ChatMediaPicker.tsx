import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Search } from 'lucide-react';
import { api, errorMessage } from './api';
import { ErrorBox, Modal } from './components';
import {
  emojiDescription,
  emojiGroups,
  emojiSearch,
  emojiWithTone,
  skinTones,
  toneNames,
} from './chatEmoji';
import { GifPreview } from './GifPreview';

interface Gif {
  id: string;
  name: string;
  size: number;
}
interface GifPage {
  items: Gif[];
  total: number;
}
export function ChatMediaPicker({
  userId,
  initialTab = 'emoji',
  onClose,
  onEmoji,
  onFiles,
}: {
  userId: string;
  initialTab?: 'emoji' | 'gif';
  onClose: () => void;
  onEmoji: (emoji: string) => boolean;
  onFiles: (files: File[]) => boolean;
}) {
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Todos');
  const [tone, setTone] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [gifs, setGifs] = useState<GifPage>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [animate, setAnimate] = useState(
    () => !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const marker = `aegitasks-chat-emoji-${userId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(marker) || '{}');
      const valid = new Set(
        emojiGroups.flatMap((g) =>
          g.items.flatMap((item) =>
            skinTones.map((_, tone) => emojiWithTone(item[0], item.length > 2, tone)),
          ),
        ),
      );
      setRecent(
        Array.isArray(saved.recent)
          ? saved.recent.filter((e: unknown) => typeof e === 'string' && valid.has(e)).slice(0, 18)
          : [],
      );
      setTone(
        Number.isInteger(saved.tone) && saved.tone >= 0 && saved.tone < skinTones.length
          ? saved.tone
          : 0,
      );
    } catch {
      /* Local preferences are optional. */
    }
    return () => controller.current?.abort();
  }, [marker]);
  useEffect(() => {
    if (tab !== 'gif') return;
    const abort = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void api<GifPage>(
        `/chat/gifs?page=${page}&q=${encodeURIComponent(query)}`,
        'GET',
        undefined,
        abort.signal,
      )
        .then((value) => {
          if (!abort.signal.aborted) {
            setGifs(value);
            setError('');
          }
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(errorMessage(e));
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [tab, page, query, retry]);
  function remember(next: string[], nextTone: number) {
    try {
      localStorage.setItem(marker, JSON.stringify({ recent: next, tone: nextTone }));
    } catch {
      /* Emoji remains usable when storage is unavailable. */
    }
  }
  function select(emoji: string) {
    if (!onEmoji(emoji)) {
      setError('El mensaje admite hasta 4000 caracteres.');
      return;
    }
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, 18);
    setRecent(next);
    remember(next, tone);
    setError('');
    setStatus('Emoji agregado al mensaje');
  }
  async function reuse(gif: Gif) {
    if (busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(gif.id);
    setError('');
    try {
      const response = await fetch(`/api/chat/files/${gif.id}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: abort.signal,
      });
      if (!response.ok)
        throw new Error('El GIF ya no está disponible. Vuelve a cargar la galería.');
      const blob = await response.blob();
      if (blob.type !== 'image/gif' || blob.size > 10 * 1024 * 1024)
        throw new Error('GIF no válido o mayor de 10 MB.');
      const file = new File([blob], gif.name, { type: 'image/gif' });
      if (onFiles([file])) onClose();
      else setError('Máximo 5 archivos, 10 MB por GIF y 25 MB por mensaje.');
    } catch (e) {
      if (!abort.signal.aborted) setError(errorMessage(e));
    } finally {
      if (!abort.signal.aborted) setBusy('');
    }
  }
  const search = emojiSearch(query);
  return (
    <Modal title="Emojis y GIFs" onClose={onClose}>
      <div className="modal-body chat-media-picker">
        <div className="chat-media-tabs" role="group" aria-label="Tipo de contenido">
          <button
            className="btn btn-ghost"
            aria-pressed={tab === 'emoji'}
            onClick={() => {
              setTab('emoji');
              setQuery('');
              setError('');
            }}
          >
            Emojis
          </button>
          <button
            className="btn btn-ghost"
            aria-pressed={tab === 'gif'}
            onClick={() => {
              setTab('gif');
              setQuery('');
              setPage(1);
              setError('');
            }}
          >
            GIFs
          </button>
        </div>
        <div className="chat-search">
          <Search size={16} />
          <input
            aria-label={tab === 'emoji' ? 'Buscar emojis' : 'Buscar GIFs por nombre'}
            placeholder={tab === 'emoji' ? 'Buscar emoji…' : 'Buscar en tus GIFs…'}
            maxLength={80}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <ErrorBox message={error} />
        {tab === 'emoji' ? (
          <>
            <div className="chat-emoji-options">
              <select
                aria-label="Categoría de emojis"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                {['Todos', 'Recientes', ...emojiGroups.map((g) => g.name)].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <select
                aria-label="Tono de piel"
                value={tone}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setTone(next);
                  remember(recent, next);
                }}
              >
                {toneNames.map((name, index) => (
                  <option key={name} value={index}>
                    {index ? `👍${skinTones[index]} ` : '👍 '}
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="chat-media-scroll">
              {group === 'Recientes' ? (
                <div className="chat-emoji-grid">
                  {recent
                    .filter(
                      (e) =>
                        !query ||
                        e.includes(query) ||
                        emojiSearch(emojiDescription(e)).includes(search),
                    )
                    .map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        title={emojiDescription(emoji)}
                        aria-label={`Insertar ${emoji}`}
                        onClick={() => select(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  {!recent.length && (
                    <p className="muted small">Tus emojis recientes aparecerán aquí.</p>
                  )}
                </div>
              ) : (
                emojiGroups
                  .filter((g) => group === 'Todos' || g.name === group)
                  .map((g) => {
                    const items = g.items.filter(
                      (item) => emojiSearch(item[1]).includes(search) || item[0].includes(query),
                    );
                    return items.length ? (
                      <section key={g.name} aria-label={g.name}>
                        <h3>{g.name}</h3>
                        <div className="chat-emoji-grid">
                          {items.map((item) => {
                            const emoji = emojiWithTone(item[0], item.length > 2, tone);
                            return (
                              <button
                                type="button"
                                key={item[0]}
                                title={item[1]}
                                aria-label={`Insertar ${item[1]}`}
                                onClick={() => select(emoji)}
                              >
                                {emoji}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ) : null;
                  })
              )}
              {group !== 'Recientes' &&
                !emojiGroups
                  .filter((g) => group === 'Todos' || g.name === group)
                  .some((g) =>
                    g.items.some(
                      (item) => emojiSearch(item[1]).includes(search) || item[0].includes(query),
                    ),
                  ) && <p className="muted small">No hay emojis con esa búsqueda.</p>}
            </div>
            <p className="muted small" role="status">
              {status || 'Elige varios emojis y cierra para seguir escribiendo.'}
            </p>
          </>
        ) : (
          <>
            <input
              ref={input}
              type="file"
              accept="image/gif,.gif"
              multiple
              hidden
              disabled={!!busy}
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                if (!files.length) return;
                if (files.some((f) => f.size > 10 * 1024 * 1024)) {
                  setError('Selecciona GIFs de hasta 10 MB cada uno.');
                  return;
                }
                const abort = new AbortController();
                controller.current = abort;
                setBusy('upload');
                try {
                  const headers = await Promise.all(files.map((f) => f.slice(0, 6).text()));
                  if (abort.signal.aborted) return;
                  if (headers.some((header) => header !== 'GIF87a' && header !== 'GIF89a')) {
                    setError('Selecciona un archivo GIF válido.');
                    return;
                  }
                  if (onFiles(files)) onClose();
                  else setError('Máximo 5 archivos y 25 MB por mensaje.');
                } catch {
                  if (!abort.signal.aborted)
                    setError('No se pudo leer el GIF. Inténtalo nuevamente.');
                } finally {
                  if (!abort.signal.aborted) setBusy('');
                }
              }}
            />
            <button
              className="btn btn-primary"
              disabled={!!busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={18} /> Adjuntar GIF
            </button>
            <div className="chat-gif-heading">
              <h3>GIFs de tus chats</h3>
              <label>
                <input
                  type="checkbox"
                  checked={animate}
                  onChange={(e) => setAnimate(e.target.checked)}
                />{' '}
                Animar
              </label>
            </div>
            <div className="chat-media-scroll">
              {loading ? (
                <p role="status">Cargando GIFs…</p>
              ) : (
                <div className="chat-gif-grid">
                  {gifs.items.map((gif) => (
                    <button
                      key={gif.id}
                      className="chat-gif-option"
                      disabled={!!busy}
                      aria-label={`Adjuntar GIF ${gif.name}`}
                      onClick={() => void reuse(gif)}
                    >
                      <GifPreview
                        src={`/api/chat/files/${gif.id}`}
                        name={gif.name}
                        animate={animate}
                        controls={false}
                      />
                      <span>{busy === gif.id ? 'Preparando…' : gif.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {!loading && !gifs.items.length && (
                <p className="muted small">
                  {query
                    ? 'No hay GIFs con ese nombre.'
                    : 'Adjunta tu primer GIF. Los GIFs de los chats a los que tienes acceso aparecerán aquí para reutilizarlos.'}
                </p>
              )}
            </div>
            {gifs.total > 24 && (
              <div className="chat-pagination">
                <button
                  className="btn btn-ghost"
                  disabled={page === 1 || loading || !!busy}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </button>
                <span>
                  {page} / {Math.ceil(gifs.total / 24)}
                </span>
                <button
                  className="btn btn-ghost"
                  disabled={page * 24 >= gifs.total || loading || !!busy}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </button>
              </div>
            )}
            {error && (
              <button
                className="btn btn-ghost"
                disabled={loading || !!busy}
                onClick={() => setRetry(retry + 1)}
              >
                Reintentar galería
              </button>
            )}
            <p className="muted small">
              Hasta 10 MB por GIF. Se adjunta al borrador; tú decides cuándo enviarlo.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
