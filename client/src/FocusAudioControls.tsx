import { useRef } from 'react';
import { AudioLines, FileAudio, Mic, Square } from 'lucide-react';
import type { useFocusAudio } from './useFocusAudio';

export function FocusAudioControls({
  audio,
  animated,
}: {
  audio: ReturnType<typeof useFocusAudio>;
  animated: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <section className="focus-audio-panel" aria-label="Audio del espectro">
      <div className="focus-audio-heading">
        <AudioLines size={18} />
        <strong>Espectro circular</strong>
      </div>
      <p className="small">
        Conecta una fuente para que el anillo responda al sonido real. El micrófono escucha el
        ambiente; con auriculares, usa audio compartido o un archivo local.
      </p>
      <div className="focus-audio-actions">
        <button
          className="btn focus-secondary"
          disabled={audio.pending || !audio.canShare}
          onClick={() => void audio.start('shared')}
        >
          <AudioLines size={16} /> Compartir audio
        </button>
        <button
          className="btn focus-secondary"
          disabled={audio.pending || !audio.canMicrophone}
          onClick={() => void audio.start('microphone')}
        >
          <Mic size={16} /> Usar micrófono
        </button>
        <button
          className="btn focus-secondary"
          disabled={audio.pending}
          onClick={() => file.current?.click()}
        >
          <FileAudio size={16} /> Reproducir archivo
        </button>
        {(audio.source || audio.pending) && (
          <button className="btn focus-secondary" onClick={audio.stop}>
            <Square size={16} />
            {audio.pending ? 'Cancelar conexión' : 'Desconectar audio'}
          </button>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept="audio/*"
        hidden
        aria-label="Archivo de audio local"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          e.target.value = '';
          if (selected) void audio.start('file', selected);
        }}
      />
      <p className="small focus-audio-state" role="status">
        {audio.pending
          ? 'Esperando acceso al audio…'
          : audio.source === 'shared'
            ? 'Audio compartido conectado'
            : audio.source === 'microphone'
              ? 'Micrófono conectado'
              : audio.source === 'file'
                ? `Archivo local · ${audio.fileName}`
                : audio.notice || 'Audio desconectado · el anillo permanece en reposo'}
      </p>
      {audio.suspended && (
        <div className="focus-audio-actions">
          <span className="small">El dispositivo pausó el audio.</span>
          <button className="btn focus-secondary" onClick={() => void audio.resume()}>
            Reactivar audio
          </button>
        </div>
      )}
      {audio.error && (
        <p role="alert" className="focus-audio-error">
          {audio.error}
        </p>
      )}
      <div ref={audio.playerContainer} hidden={audio.source !== 'file'} />
      <p className="focus-audio-help">
        {audio.canShare
          ? 'Para compartir, elige una pestaña o pantalla y activa «Compartir audio» en el diálogo del navegador.'
          : 'Este navegador no ofrece captura del audio de otras apps. Usa el micrófono o un archivo local.'}{' '}
        No se graban ni se envían audio, archivos o imágenes.
      </p>
      {!animated && (
        <p className="focus-audio-help">
          El movimiento está pausado. Activa las animaciones para ver el espectro en movimiento.
        </p>
      )}
      <p className="focus-audio-reduced focus-audio-help">
        Tu dispositivo tiene movimiento reducido activado; el ambiente y el espectro se muestran
        estáticos.
      </p>
    </section>
  );
}
