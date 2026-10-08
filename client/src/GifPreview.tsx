import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

export function GifPreview({
  src,
  name,
  animate,
  controls = true,
  kind = 'gif',
}: {
  src: string;
  name: string;
  animate?: boolean;
  controls?: boolean;
  kind?: 'gif' | 'sticker';
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(
    () => animate ?? !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (animate !== undefined) {
      setPlaying(animate);
      return;
    }
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setPlaying(!media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [animate]);
  return (
    <div className="chat-gif-preview">
      <img
        src={src}
        referrerPolicy="no-referrer"
        alt={name}
        loading={playing ? 'lazy' : 'eager'}
        hidden={!playing || failed}
        onLoad={(event) => {
          const image = event.currentTarget;
          const target = canvas.current;
          if (!target || !image.naturalWidth) return;
          const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
          target.width = Math.max(1, Math.round(image.naturalWidth * scale));
          target.height = Math.max(1, Math.round(image.naturalHeight * scale));
          target.getContext('2d')?.drawImage(image, 0, 0, target.width, target.height);
          setReady(true);
        }}
        onError={() => setFailed(true)}
      />
      <canvas ref={canvas} hidden={playing || !ready || failed} role="img" aria-label={name} />
      {failed && <span className="muted small">Vista previa no disponible</span>}
      {controls && ready && !failed && (
        <button
          type="button"
          className="chat-gif-toggle"
          aria-label={`${playing ? 'Pausar' : 'Reproducir'} ${kind === 'sticker' ? 'sticker' : 'GIF'} ${name}`}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}{' '}
          {kind === 'sticker' ? 'Sticker' : 'GIF'}
        </button>
      )}
    </div>
  );
}
