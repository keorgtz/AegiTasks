import { useCallback, useEffect, useRef, useState } from 'react';

type Source = 'shared' | 'microphone' | 'file';
type Resources = {
  context: AudioContext;
  stream?: MediaStream;
  source?: AudioNode;
  analyser?: AnalyserNode;
  url?: string;
  player?: HTMLAudioElement;
};

function dispose(resources: Resources | null) {
  if (!resources) return;
  resources.context.onstatechange = null;
  resources.stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
  resources.source?.disconnect();
  resources.analyser?.disconnect();
  if (resources.player) {
    resources.player.onerror = null;
    resources.player.pause();
    resources.player.removeAttribute('src');
    resources.player.load();
    resources.player.remove();
  }
  if (resources.url) URL.revokeObjectURL(resources.url);
  void resources.context.close().catch(() => {});
}

function explain(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError')
    return 'No se concedió acceso al audio. Puedes intentarlo de nuevo o elegir otra fuente.';
  if (name === 'NotFoundError')
    return 'No se encontró una fuente de audio. Prueba un archivo local.';
  if (name === 'NotReadableError')
    return 'El dispositivo no pudo abrir el audio. Revisa si otra aplicación lo está utilizando.';
  if (name === 'NotSupportedError')
    return 'Este navegador no admite esa fuente o formato. Prueba otra opción.';
  return error instanceof Error ? error.message : 'No se pudo activar el audio.';
}

export function useFocusAudio(enabled: boolean) {
  const resources = useRef<Resources | null>(null);
  const generation = useRef(0);
  const playerContainer = useRef<HTMLDivElement>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileName, setFileName] = useState('');
  const [suspended, setSuspended] = useState(false);
  const release = useCallback(() => {
    generation.current++;
    dispose(resources.current);
    resources.current = null;
  }, []);
  const stop = useCallback(() => {
    release();
    setAnalyser(null);
    setSource(null);
    setPending(false);
    setFileName('');
    setSuspended(false);
  }, [release]);
  useEffect(() => {
    if (!enabled) {
      stop();
      setError('');
      setNotice('');
    }
  }, [enabled, stop]);
  useEffect(() => release, [release]);
  // Release capture when leaving the page, including browsers that retain it in the back/forward cache.
  useEffect(() => {
    window.addEventListener('pagehide', stop);
    return () => window.removeEventListener('pagehide', stop);
  }, [stop]);

  async function start(kind: Source, file?: File) {
    stop();
    setError('');
    setNotice('');
    if (!enabled) return;
    const version = generation.current;
    const current = () => generation.current === version;
    try {
      if (!window.isSecureContext || !window.AudioContext)
        throw new Error(
          'Abre AegiTasks con HTTPS en un navegador compatible para activar el audio.',
        );
      if (kind === 'shared' && !navigator.mediaDevices?.getDisplayMedia)
        throw new Error(
          'Este navegador no permite compartir el audio del dispositivo. Usa el micrófono o un archivo local.',
        );
      if (kind === 'microphone' && !navigator.mediaDevices?.getUserMedia)
        throw new Error('Este navegador no permite abrir el micrófono. Prueba un archivo local.');
      const context = new AudioContext();
      const item: Resources = { context };
      resources.current = item;
      context.onstatechange = () => {
        if (current()) setSuspended(context.state !== 'running');
      };
      setPending(true);
      // Resume and request capture in the click gesture; never request permissions on mount.
      const resumed = context.resume();
      void resumed.catch(() => {});
      const node = context.createAnalyser();
      node.fftSize = 2048;
      node.smoothingTimeConstant = 0.85;
      item.analyser = node;
      if (kind === 'file') {
        if (!file || !playerContainer.current) throw new Error('Selecciona un archivo de audio.');
        // A MediaElementAudioSourceNode can only be created once for each media element.
        const element = document.createElement('audio');
        element.controls = true;
        element.setAttribute('aria-label', 'Reproductor de audio local');
        element.onerror = () => {
          if (current()) fileError();
        };
        playerContainer.current.replaceChildren(element);
        item.player = element;
        item.url = URL.createObjectURL(file);
        element.src = item.url;
        item.source = context.createMediaElementSource(element);
        item.source.connect(node);
        // Only local playback reaches the speakers. Capture never echoes the microphone/system audio.
        node.connect(context.destination);
        await resumed;
        if (!current()) return;
        await element.play();
        if (!current()) return;
        setFileName(file.name);
      } else {
        const stream =
          kind === 'shared'
            ? await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
                systemAudio: 'include',
                selfBrowserSurface: 'exclude',
              } as DisplayMediaStreamOptions)
            : await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                video: false,
              });
        if (!current()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        item.stream = stream;
        if (!stream.getAudioTracks().some((track) => track.readyState === 'live'))
          throw new Error(
            'La fuente no compartió audio. Vuelve a elegirla y activa «Compartir audio», o usa un archivo local.',
          );
        // Display capture requires video, but its frames are never read, recorded or transmitted.
        item.source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        item.source.connect(node);
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (current()) {
              stop();
              setNotice('La fuente dejó de compartir audio. Puedes conectarla de nuevo.');
            }
          };
        });
        await resumed;
        if (!current()) return;
      }
      setAnalyser(node);
      setSource(kind);
      setPending(false);
      setSuspended(context.state !== 'running');
    } catch (e) {
      if (current()) {
        stop();
        setError(explain(e));
      }
    }
  }
  async function resume() {
    try {
      await resources.current?.context.resume();
    } catch (e) {
      setError(explain(e));
    }
  }
  function fileError() {
    if (resources.current?.player) {
      stop();
      setError('No se pudo reproducir este archivo. Prueba un formato de audio compatible.');
    }
  }
  return {
    analyser,
    source,
    pending,
    error,
    notice,
    fileName,
    suspended,
    playerContainer,
    start,
    stop,
    resume,
    canShare: window.isSecureContext && !!navigator.mediaDevices?.getDisplayMedia,
    canMicrophone: window.isSecureContext && !!navigator.mediaDevices?.getUserMedia,
  };
}
