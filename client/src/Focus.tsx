import { useEffect, useRef, useState } from 'react';
import {
  Coffee,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCw,
  Square,
  Target,
  Volume2,
} from 'lucide-react';
import { api, errorMessage } from './api';
import { ErrorBox, Field } from './components';
import type { Space, TaskItem, TaskPage } from './types';
interface Profile {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cycles: number;
  theme: string;
  animated: boolean;
  sound: boolean;
}
interface Session {
  id: string;
  spaceId: string;
  goal: string;
  taskIdsJson: string;
  phase: string;
  state: string;
  remainingSeconds: number;
  endsAt: string | null;
  completedCycles: number;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cycles: number;
  version: string;
  startedAt: string;
}
interface FocusData {
  profile: Profile;
  session: Session | null;
  history: Session[];
  serverNow: string;
}
const defaults: Profile = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cycles: 4,
  theme: 'aurora',
  animated: true,
  sound: false,
};
export function FocusPage({
  space,
  canTasks,
  openTask,
}: {
  space: Space;
  canTasks: boolean;
  openTask: (id: string) => void;
}) {
  const [profile, setProfile] = useState<Profile>(defaults);
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [goal, setGoal] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskQuery, setTaskQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const stage = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const alerted = useRef('');
  async function load() {
    const d = await api<FocusData>('/focus');
    setSession(d.session);
    setProfile(d.profile);
    setHistory(d.history);
    setOffset(new Date(d.serverNow).getTime() - Date.now());
  }
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    if (!canTasks) return;
    const c = new AbortController();
    const timer = setTimeout(
      () =>
        void api<TaskPage>(
          `/tasks?scope=open&q=${encodeURIComponent(taskQuery)}`,
          'GET',
          undefined,
          c.signal,
        )
          .then((d) => setTasks(d.items))
          .catch((e) => {
            if (!c.signal.aborted) setError(errorMessage(e));
          }),
      250,
    );
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [space.id, taskQuery, canTasks]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    const refresh = () => {
      if (document.visibilityState === 'visible')
        void load().catch((e) => setError(errorMessage(e)));
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    const exit = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImmersive(false);
    };
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, []);
  useEffect(() => {
    if (!immersive || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    void navigator.wakeLock
      .request('screen')
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [immersive]);
  const remaining = session
    ? session.state === 'running' && session.endsAt
      ? Math.max(0, Math.ceil((new Date(session.endsAt).getTime() - (now + offset)) / 1000))
      : session.remainingSeconds
    : profile.focusMinutes * 60;
  const total = session
    ? (session.phase === 'focus'
        ? session.focusMinutes
        : session.phase === 'shortBreak'
          ? session.shortBreakMinutes
          : session.longBreakMinutes) * 60
    : profile.focusMinutes * 60;
  const ready = !!session && remaining === 0;
  const phase = session?.phase || 'focus';
  useEffect(() => {
    const key = `${session?.id}-${session?.endsAt}`;
    if (ready && profile.sound && audio.current && alerted.current !== key) {
      alerted.current = key;
      try {
        const ctx = audio.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 660;
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      } catch {}
    }
  }, [ready, profile.sound, session?.id, session?.endsAt]);
  function unlockSound() {
    if (!audio.current) audio.current = new AudioContext();
    void audio.current.resume().catch(() => {});
  }
  async function start() {
    if (profile.sound) unlockSound();
    setBusy(true);
    setError('');
    try {
      await api('/focus/profile', 'PUT', profile);
      const s = await api<Session>('/focus/start', 'POST', { goal, taskIds: selected });
      setSession(s);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string, updatedGoal?: string) {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const s = await api<Session>(`/focus/${session.id}/action`, 'POST', {
        action,
        version: session.version,
        goal: updatedGoal,
      });
      if (action === 'finish') {
        setSession(null);
        await load();
      } else setSession(s);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const toggleGoal = (index: number) => {
    if (!session) return;
    const lines = session.goal.split('\n');
    const line = lines[index] || '';
    const done = /^(?:- )?\[x\] /i.test(line);
    lines[index] = `${done ? '[ ]' : '[x]'} ${line.replace(/^(?:- )?\[[ x]\] /i, '')}`;
    void action('goals', lines.join('\n'));
  };
  async function fullScreen() {
    setImmersive(true);
    try {
      await stage.current?.requestFullscreen();
    } catch {
      /* Immersive layout also works without the Fullscreen API. */
    }
  }
  useEffect(() => {
    const changed = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const leave = () => {
    setImmersive(false);
    if (document.fullscreenElement) void document.exitFullscreen();
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">UNA COSA A LA VEZ</div>
          <h1>
            Focus Mode<span className="heading-dot">.</span>
          </h1>
          <p>Tu tiempo, con intención. Un timer personal que continúa al cambiar de pantalla.</p>
        </div>
      </div>
      <ErrorBox message={!immersive ? error : ''} />
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <div
        ref={stage}
        className={`focus-stage focus-${profile.theme} ${profile.animated ? 'is-animated' : ''} ${immersive ? 'is-immersive' : ''}`}
      >
        <div className="focus-art" aria-hidden="true">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="orb orb-three" />
          <svg className="focus-waves" viewBox="0 0 1200 300" preserveAspectRatio="none">
            <path d="M0 120 Q200 10 400 120 T800 120 T1200 120 V300 H0Z" />
            <path d="M0 180 Q200 70 400 180 T800 180 T1200 180 V300 H0Z" />
          </svg>
          <div className="terminal-art">
            const focus = true;
            <br />
            while (focus) {'{'}
            <br />
            &nbsp; await oneSmallStep();
            <br />
            {'}'}
            <br />
            // progress, not perfection
          </div>
        </div>
        <div className="focus-topline">
          <span>
            <span className="focus-live-dot" />
            AEGIPULSE / FOCUS
          </span>
          <button
            className="btn-icon"
            aria-label={immersive ? 'Salir de pantalla completa' : 'Pantalla completa'}
            onClick={() => (immersive ? leave() : void fullScreen())}
          >
            {immersive ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </button>
        </div>
        {immersive && <ErrorBox message={error} />}
        <div className="focus-center">
          <div className="focus-phase">
            {phase === 'focus' ? <Target size={17} /> : <Coffee size={17} />}{' '}
            {ready
              ? 'Intervalo completo'
              : phase === 'focus'
                ? 'Tiempo de enfoque'
                : phase === 'shortBreak'
                  ? 'Respira. Una pausa corta.'
                  : 'Un descanso merecido.'}
          </div>
          <div className="focus-dial">
            <svg viewBox="0 0 300 300" aria-hidden="true">
              <circle cx="150" cy="150" r="137" />
              <circle
                cx="150"
                cy="150"
                r="137"
                strokeDasharray={`${Math.min(1, remaining / (total || 1)) * 861} 861`}
              />
            </svg>
            <div
              className="focus-digits"
              role="timer"
              aria-label={`${Math.floor(remaining / 60)} minutos ${remaining % 60} segundos`}
            >
              <strong>
                {String(Math.floor(remaining / 60)).padStart(2, '0')}
                <span>:</span>
                {String(remaining % 60).padStart(2, '0')}
              </strong>
              <small>
                {session?.state === 'paused' && !ready
                  ? 'EN PAUSA'
                  : session
                    ? `POMODORO ${session.completedCycles + 1} · ${session.cycles} HASTA PAUSA LARGA`
                    : 'ENCUENTRA TU RITMO'}
              </small>
            </div>
          </div>
          <p className="focus-intention">
            {session?.goal.split('\n')[0]?.replace(/^(?:- )?\[[ x]\] /i, '') ||
              'Pequeños pasos. Grandes avances.'}
          </p>
          <div className="focus-controls">
            {!session ? (
              <button className="btn focus-primary" disabled={busy} onClick={() => void start()}>
                <Play size={18} />
                Comenzar enfoque
              </button>
            ) : (
              <>
                {ready ? (
                  <button
                    className="btn focus-primary"
                    disabled={busy}
                    onClick={() => void action('next')}
                  >
                    <RotateCw size={18} />
                    {phase === 'focus' ? 'Comenzar descanso' : 'Volver al enfoque'}
                  </button>
                ) : (
                  <button
                    className="btn focus-primary"
                    disabled={busy}
                    onClick={() => void action(session.state === 'running' ? 'pause' : 'resume')}
                  >
                    {session.state === 'running' ? <Pause size={18} /> : <Play size={18} />}{' '}
                    {session.state === 'running' ? 'Pausar' : 'Continuar'}
                  </button>
                )}
                <button
                  className="btn focus-secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        '¿Finalizar esta sesión de enfoque? Se guardarán los ciclos completados.',
                      )
                    )
                      void action('finish');
                  }}
                >
                  <Square size={15} />
                  Finalizar
                </button>
              </>
            )}
          </div>
          <p className="focus-caption">
            {ready
              ? 'Cuando estés listo, inicia la siguiente etapa.'
              : session
                ? `${session.completedCycles} ciclos completados · No necesitas mantener esta pestaña activa.`
                : 'El ruido puede esperar. Este momento es tuyo.'}
          </p>
        </div>
        {session?.goal && (
          <div className="focus-goals">
            {session.goal.split('\n').map(
              (g, i) =>
                g.trim() && (
                  <label key={i}>
                    <input
                      type="checkbox"
                      checked={/^(?:- )?\[x\] /i.test(g)}
                      disabled={busy}
                      onChange={() => toggleGoal(i)}
                    />
                    <span>{g.replace(/^(?:- )?\[[ x]\] /i, '')}</span>
                  </label>
                ),
            )}
          </div>
        )}
        {immersive && (
          <button className="focus-exit" onClick={leave}>
            Volver a mi espacio · Esc
          </button>
        )}
      </div>
      <div className="settings-grid subsection">
        <section className="card">
          <h2>Elige tu ritmo</h2>
          <p className="muted small">Las duraciones se aplican al comenzar una nueva sesión.</p>
          <div className="form-grid subsection">
            {[
              { key: 'focusMinutes', label: 'Enfoque (min)', max: 240 },
              { key: 'shortBreakMinutes', label: 'Pausa corta (min)', max: 60 },
              { key: 'longBreakMinutes', label: 'Pausa larga (min)', max: 120 },
              { key: 'cycles', label: 'Ciclos hasta pausa larga', max: 12 },
            ].map((f) => (
              <Field key={f.key} label={f.label}>
                <input
                  type="number"
                  min={1}
                  max={f.max}
                  value={profile[f.key as keyof Profile] as number}
                  onChange={(e) => setProfile((p) => ({ ...p, [f.key]: Number(e.target.value) }))}
                />
              </Field>
            ))}
          </div>
          <Field label="Ambiente visual">
            <select
              value={profile.theme}
              onChange={(e) => setProfile((p) => ({ ...p, theme: e.target.value }))}
            >
              <option value="aurora">Aurora · formas suaves</option>
              <option value="waves">Waves · ondas de calma</option>
              <option value="terminal">Terminal · coding flow</option>
            </select>
          </Field>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={profile.animated}
              onChange={(e) => setProfile((p) => ({ ...p, animated: e.target.checked }))}
            />
            Animaciones de fondo
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={profile.sound}
              onChange={(e) => {
                if (e.target.checked) unlockSound();
                setProfile((p) => ({ ...p, sound: e.target.checked }));
              }}
            />
            <Volume2 size={17} />
            Sonido al completar el intervalo
          </label>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await api('/focus/profile', 'PUT', profile);
                setMessage('Preferencias de enfoque guardadas.');
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Guardar preferencias
          </button>
        </section>
        <section className="card">
          <h2>{session ? 'Tu sesión actual' : '¿Qué quieres avanzar?'}</h2>
          {!session ? (
            <>
              <Field label="Objetivos de la sesión">
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={
                    'Un objetivo por línea\nResolver el bug de reservas\nRevisar los cambios'
                  }
                />
              </Field>
              {canTasks && (
                <>
                  <Field label="Buscar pendientes para enfocar">
                    <input
                      value={taskQuery}
                      onChange={(e) => setTaskQuery(e.target.value)}
                      placeholder="Título del pendiente…"
                    />
                  </Field>
                  <div className="focus-task-picker">
                    {tasks.map((t) => (
                      <label key={t.id} className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={selected.includes(t.id)}
                          disabled={!selected.includes(t.id) && selected.length >= 10}
                          onChange={() =>
                            setSelected((ids) =>
                              ids.includes(t.id) ? ids.filter((i) => i !== t.id) : [...ids, t.id],
                            )
                          }
                        />
                        <span>{t.title}</span>
                      </label>
                    ))}
                  </div>
                  <p className="muted small">
                    Hasta 10 pendientes. Completarlos en el timer no cambia su estado
                    automáticamente.
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              <p className="muted">
                Tus objetivos aparecen en el timer. Puedes marcarlos sin perder la concentración.
              </p>
              {session.spaceId === space.id &&
                canTasks &&
                (JSON.parse(session.taskIdsJson) as string[]).map((id) => (
                  <button key={id} className="focus-task-link" onClick={() => openTask(id)}>
                    {tasks.find((t) => t.id === id)?.title || 'Abrir pendiente asociado'}
                  </button>
                ))}
              {session.spaceId !== space.id && (
                <p className="small muted">
                  Los pendientes asociados pertenecen al espacio donde comenzaste la sesión.
                </p>
              )}
            </>
          )}
          <div className="focus-history">
            <h3>Tu avance reciente</h3>
            <strong>
              {history.reduce((sum, s) => sum + s.completedCycles * s.focusMinutes, 0)}
              <small> min de enfoque completados</small>
            </strong>
            <p className="muted small">Últimas 30 sesiones. Solo incluye intervalos completos.</p>
            {history.slice(0, 5).map((s) => (
              <div className="history-row" key={s.id}>
                <span>{s.goal.split('\n')[0] || 'Sesión de enfoque'}</span>
                <small>
                  {s.completedCycles} ciclos · {new Date(s.startedAt).toLocaleDateString('es-MX')}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
