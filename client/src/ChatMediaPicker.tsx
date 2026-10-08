import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Search } from 'lucide-react';
import { api, errorMessage } from './api';
import { ErrorBox, Modal } from './components';
import {
  emojiDescription,
  emojiGroups,
  emojiSearch,
  emojiWithTone,
  emojiVariants,
  emojiCount,
  isKnownEmoji,
  skinTones,
  toneNames,
} from './chatEmoji';
import { GifPreview } from './GifPreview';
import { searchKlipy, type CataloguePage, type RemoteGif } from './chatGif';

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
  onRemoteGif,
}: {
  userId: string;
  initialTab?: 'emoji' | 'gif' | 'sticker';
  onClose: () => void;
  onEmoji: (emoji: string) => boolean;
  onFiles: (files: File[]) => boolean;
  onRemoteGif: (gif: RemoteGif) => true | string;
}) {
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Todos');
  const [emojiLimit, setEmojiLimit] = useState(240);
  const [tone, setTone] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [gifs, setGifs] = useState<GifPage>({ items: [], total: 0 });
  const [source, setSource] = useState('online');
  const online = tab === 'sticker' || source === 'online';
  const mediaName = tab === 'sticker' ? 'Sticker' : 'GIF';
  const [key, setKey] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<CataloguePage>({ items: [], hasNext: false });
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
      setRecent(
        Array.isArray(saved.recent)
          ? saved.recent
              .filter((e: unknown) => typeof e === 'string' && isKnownEmoji(e))
              .slice(0, 18)
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
    const abort = new AbortController();
    void api<{ key: string }>('/chat/gif-provider', 'GET', undefined, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setKey(value.key);
      })
      .catch(() => {
        if (!abort.signal.aborted) setKey('');
      });
    return () => abort.abort();
  }, [retry]);
  useEffect(() => {
    if (tab === 'emoji') return;
    setCatalogue({ items: [], hasNext: false });
    if (online && !key) {
      setLoading(key === null);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      const task = online
        ? searchKlipy(
            key!,
            query,
            page,
            abort.signal,
            tab === 'sticker' ? 'stickers' : 'gifs',
          ).then((value) => {
            if (!abort.signal.aborted) {
              setCatalogue(value);
              setError('');
            }
          })
        : api<GifPage>(
            `/chat/gifs?page=${page}&q=${encodeURIComponent(query)}`,
            'GET',
            undefined,
            abort.signal,
          ).then((value) => {
            if (!abort.signal.aborted) {
              setGifs(value);
              setError('');
            }
          });
      void task
        .catch((e) => {
          if (!abort.signal.aborted) {
            setError(errorMessage(e));
            if (online) setCatalogue({ items: [], hasNext: false });
            else setGifs({ items: [], total: 0 });
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [tab, page, query, retry, online, key]);
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
  const filtered = (
    group === 'Variantes de piel'
      ? emojiVariants
      : emojiGroups.filter((g) => group === 'Todos' || g.name === group).flatMap((g) => g.items)
  ).filter(
    (item) =>
      search.split(/\s+/).every((word) => emojiSearch(item[3]).includes(word)) ||
      item[0].includes(query),
  );
  return (
    <Modal title="Emojis, GIFs y stickers" onClose={onClose}>
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
          <button
            className="btn btn-ghost"
            aria-pressed={tab === 'sticker'}
            onClick={() => {
              setTab('sticker');
              setQuery('');
              setPage(1);
              setError('');
            }}
          >
            Stickers
          </button>
        </div>
        <div className="chat-search">
          <Search size={16} />
          <input
            aria-label={
              tab === 'emoji'
                ? 'Buscar emojis'
                : online
                  ? `Buscar ${tab === 'sticker' ? 'stickers' : 'GIFs'} en KLIPY`
                  : 'Buscar GIFs por nombre'
            }
            placeholder={
              tab === 'emoji' ? 'Buscar emoji…' : online ? 'Search KLIPY' : 'Buscar en tus GIFs…'
            }
            maxLength={80}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
              setEmojiLimit(240);
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
                onChange={(e) => {
                  setGroup(e.target.value);
                  setEmojiLimit(240);
                }}
              >
                {['Todos', 'Recientes', ...emojiGroups.map((g) => g.name), 'Variantes de piel'].map(
                  (name) => (
                    <option key={name}>{name}</option>
                  ),
                )}
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
                <>
                  <div className="chat-emoji-grid">
                    {filtered.slice(0, emojiLimit).map((item) => (
                      <button
                        type="button"
                        key={item[0]}
                        title={item[1]}
                        aria-label={`Insertar ${item[1]}`}
                        onClick={() => select(emojiWithTone(item[0], item[2], tone))}
                      >
                        {emojiWithTone(item[0], item[2], tone)}
                      </button>
                    ))}
                  </div>
                  {filtered.length > emojiLimit && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => setEmojiLimit(emojiLimit + 240)}
                    >
                      Mostrar más emojis
                    </button>
                  )}
                  {!filtered.length && (
                    <p className="muted small">No hay emojis con esa búsqueda.</p>
                  )}
                </>
              )}
            </div>
            <p className="muted small" role="status">
              {status || `${emojiCount} emojis y variantes. Elige varios antes de cerrar.`}
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
            {tab === 'gif' && (!online || !key) && (
              <button
                className="btn btn-primary"
                disabled={!!busy}
                onClick={() => input.current?.click()}
              >
                <ImagePlus size={18} /> Adjuntar GIF
              </button>
            )}
            <div className="chat-gif-heading">
              {tab === 'gif' ? (
                <select
                  aria-label="Origen de GIFs"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setPage(1);
                    setQuery('');
                    setError('');
                  }}
                >
                  <option value="online">Buscar en KLIPY</option>
                  <option value="chats">GIFs de tus chats</option>
                </select>
              ) : (
                <span className="muted small">Stickers de KLIPY</span>
              )}
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
                <p role="status">Cargando {tab === 'sticker' ? 'stickers' : 'GIFs'}…</p>
              ) : (
                <div className="chat-gif-grid">
                  {online
                    ? catalogue.items.map((gif) => (
                        <button
                          key={gif.id}
                          className="chat-gif-option"
                          aria-label={`Elegir ${mediaName} ${gif.title}`}
                          onClick={() => {
                            const result = onRemoteGif({
                              url: gif.url,
                              provider: 'KLIPY',
                              kind: tab === 'sticker' ? 'sticker' : 'gif',
                            });
                            if (result === true) onClose();
                            else setError(result);
                          }}
                        >
                          <GifPreview
                            src={gif.preview}
                            name={gif.title}
                            animate={animate}
                            controls={false}
                          />
                          <span>{gif.title}</span>
                        </button>
                      ))
                    : gifs.items.map((gif) => (
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
              {!loading && !error && online && !catalogue.items.length && (
                <p className="muted small">
                  {!key
                    ? tab === 'sticker'
                      ? 'El catálogo no está activado. Tu administrador debe configurar KLIPY con acceso a stickers.'
                      : 'El catálogo no está activado. Tu administrador debe configurar KLIPY. Puedes adjuntar archivos o elegir GIFs de tus chats.'
                    : 'No hay resultados. Prueba otra palabra.'}
                </p>
              )}
              {!loading && !online && !gifs.items.length && (
                <p className="muted small">
                  {query
                    ? 'No hay GIFs con ese nombre.'
                    : 'Adjunta tu primer GIF. Los GIFs de los chats a los que tienes acceso aparecerán aquí para reutilizarlos.'}
                </p>
              )}
            </div>
            {(page > 1 || (online ? catalogue.hasNext : gifs.total > 24)) && (
              <div className="chat-pagination">
                <button
                  className="btn btn-ghost"
                  disabled={page === 1 || loading || !!busy}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </button>
                <span>
                  {online
                    ? `Página ${page}`
                    : `${page} / ${Math.max(1, Math.ceil(gifs.total / 24))}`}
                </span>
                <button
                  className="btn btn-ghost"
                  disabled={
                    (online ? !catalogue.hasNext : page * 24 >= gifs.total) || loading || !!busy
                  }
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
            <p className={`muted small ${online ? 'chat-gif-attribution' : ''}`}>
              {online ? (
                <a href="https://klipy.com" target="_blank" rel="noreferrer">
                  Powered by KLIPY
                </a>
              ) : (
                'Hasta 10 MB por GIF. Se agrega al borrador.'
              )}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
