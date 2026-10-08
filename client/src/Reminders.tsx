import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Pause,
  Play,
  Search,
  Trash2,
  ArrowUpRight,
} from 'lucide-react';
import { api, errorMessage } from './api';
import { useChanges } from './changes';
import { ErrorBox, Field, Modal } from './components';
import type { User, Workspace } from './types';
import './styles/reminders.css';

export interface ReminderSchedule {
  mode: 'interval' | 'weekly' | 'once';
  every: number;
  unit: 'minutes' | 'hours' | 'days';
  days: number[];
  time: string;
  timeZone: string;
  startsAt: string;
}
export interface Reminder {
  id: string;
  spaceId: string;
  projectId: string | null;
  workItemId: string | null;
  title: string;
  message: string;
  audience: 'workspace' | 'project' | 'user' | 'assignee';
  recipientId: string | null;
  schedule: ReminderSchedule;
  enabled: boolean;
  suppressed: boolean;
  nextRunAt: string | null;
  lastSentAt: string | null;
  version: string;
}
const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const units = { minutes: 'minutos', hours: 'horas', days: 'días' };
const localInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export function scheduleLabel(schedule: ReminderSchedule) {
  if (schedule.mode === 'once') return 'Una sola vez';
  if (schedule.mode === 'weekly')
    return `${schedule.days.map((d) => weekdays[d]).join(', ')} · ${schedule.time}`;
  return `Cada ${schedule.every} ${units[schedule.unit]}`;
}
const dateTime = (value: string, zone: string) =>
  new Date(value).toLocaleString('es-MX', {
    timeZone: zone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
const payload = (reminder: Reminder, enabled = reminder.enabled) => ({
  ...reminder,
  projectId: reminder.workItemId ? null : reminder.projectId,
  enabled,
});

export function RemindersPage({
  workspace,
  user,
  editorId,
  navigate,
  openTask,
}: {
  workspace: Workspace;
  user: User;
  editorId: string | null;
  navigate: (route: string) => void;
  openTask: (id: string) => void;
}) {
  return (
    <section className="reminders-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Tu workspace</p>
          <h1>Recordatorios</h1>
          <p className="muted">
            Mensajes programados para ti o el equipo, sin estados ni vencimiento.
          </p>
        </div>
      </div>
      <ReminderList
        workspace={workspace}
        user={user}
        editorId={editorId}
        closeRoute={() => navigate('reminders')}
        openTask={openTask}
      />
    </section>
  );
}
export function TaskReminders({
  taskId,
  title,
  workspace,
  user,
  onClose,
}: {
  taskId: string;
  title: string;
  workspace: Workspace;
  user: User;
  onClose: () => void;
}) {
  return (
    <Modal title="Recordatorios del pendiente" onClose={onClose}>
      <div className="modal-body">
        <p className="muted small">
          {title}. Los avisos se suspenden mientras el pendiente esté resuelto o archivado.
        </p>
        <ReminderList taskId={taskId} taskTitle={title} workspace={workspace} user={user} />
      </div>
    </Modal>
  );
}
function ReminderList({
  workspace: w,
  user,
  taskId,
  taskTitle,
  editorId,
  closeRoute,
  openTask,
}: {
  workspace: Workspace;
  user: User;
  taskId?: string;
  taskTitle?: string;
  editorId?: string | null;
  closeRoute?: () => void;
  openTask?: (id: string) => void;
}) {
  const requests = useRef(0);
  const [data, setData] = useState<{ items: Reminder[]; total: number }>({ items: [], total: 0 });
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('workspace');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [editor, setEditor] = useState<Reminder | 'new' | null>(null);
  const [removing, setRemoving] = useState<Reminder | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++requests.current;
      const params = new URLSearchParams({ page: String(page), q: query });
      if (taskId) params.set('taskId', taskId);
      else if (kind !== 'all') params.set('linked', String(kind === 'tasks'));
      const result = await api<{ items: Reminder[]; total: number }>(
        `/reminders?${params}`,
        'GET',
        undefined,
        signal,
      );
      if (!signal?.aborted && sequence === requests.current) {
        setError('');
        setData(result);
        setLoading(false);
        if (!result.items.length && page > 1) setPage(Math.max(1, Math.ceil(result.total / 30)));
      }
    },
    [taskId, kind, page, query],
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void load(controller.signal).catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  useChanges(
    ['reminders', 'tasks', 'catalog', 'access'],
    () => void load().catch((e) => setError(errorMessage(e))),
  );
  useEffect(() => {
    if (!editorId) return;
    const controller = new AbortController();
    void api<Reminder>(`/reminders/${editorId}`, 'GET', undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setEditor(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [editorId]);
  async function run(id: string, action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(id);
    setError('');
    try {
      await action();
      setRemoving(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  const closeEditor = () => {
    setEditor(null);
    if (editorId) closeRoute?.();
  };
  const audience = (r: Reminder) =>
    r.audience === 'user'
      ? w.users.find((u) => u.id === r.recipientId)?.name || 'Usuario no disponible'
      : r.audience === 'assignee'
        ? 'Responsable del pendiente'
        : r.audience === 'project'
          ? 'Todos con acceso al proyecto'
          : 'Todos en el espacio';
  return (
    <div className="reminder-list">
      <div className="reminder-tools">
        <div className="chat-search reminder-search">
          <Search size={17} />
          <input
            aria-label="Buscar recordatorios"
            placeholder="Buscar recordatorios…"
            value={query}
            maxLength={100}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {!taskId && (
          <select
            aria-label="Tipo de recordatorios"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="workspace">Del workspace</option>
            <option value="tasks">De pendientes</option>
            <option value="all">Todos</option>
          </select>
        )}
        <button className="btn btn-primary" onClick={() => setEditor('new')}>
          <Plus size={17} /> Nuevo recordatorio
        </button>
      </div>
      <ErrorBox message={error} />
      {error && (
        <button
          className="btn btn-ghost"
          onClick={() =>
            void load()
              .then(() => setError(''))
              .catch((e) => setError(errorMessage(e)))
          }
        >
          Volver a cargar
        </button>
      )}
      {loading ? (
        <p role="status">Cargando recordatorios…</p>
      ) : !data.items.length ? (
        <div className="empty-state">
          <BellRing size={30} />
          <h3>Sin recordatorios</h3>
          <p>{query ? 'Prueba otra búsqueda.' : 'Programa el primer aviso para ti o tu equipo.'}</p>
        </div>
      ) : (
        <div className="reminder-grid">
          {data.items.map((r) => (
            <article className="card reminder-card" key={r.id} aria-label={r.title}>
              <div className="reminder-card-head">
                <BellRing size={19} />
                <button className="reminder-title" onClick={() => setEditor(r)}>
                  {r.title}
                </button>
                <button
                  className="btn-icon"
                  disabled={!!busy}
                  aria-label={`${r.enabled ? 'Pausar' : 'Activar'} recordatorio ${r.title}`}
                  onClick={() =>
                    void run(r.id, () => api(`/reminders/${r.id}`, 'PUT', payload(r, !r.enabled)))
                  }
                >
                  {r.enabled ? <Pause size={17} /> : <Play size={17} />}
                </button>
              </div>
              {r.message && <p className="reminder-message">{r.message}</p>}
              <div className="reminder-meta">
                <span>{audience(r)}</span>
                <span>
                  {r.projectId
                    ? w.projects.find((p) => p.id === r.projectId)?.name || 'Proyecto'
                    : 'General del workspace'}
                </span>
                {r.workItemId && <span>Ligado a un pendiente</span>}
              </div>
              <p className="reminder-cadence">
                <CalendarClock size={16} />
                {scheduleLabel(r.schedule)}
              </p>
              <p className="muted small">
                {!r.enabled
                  ? 'Programación pausada'
                  : r.suppressed
                    ? r.workItemId
                      ? 'Avisos suspendidos por pendiente resuelto o archivado'
                      : 'Avisos suspendidos por proyecto archivado'
                    : r.nextRunAt
                      ? `Próximo: ${dateTime(r.nextRunAt, r.schedule.timeZone)}`
                      : 'Sin más ejecuciones programadas'}
              </p>
              <div className="reminder-card-footer">
                <span className="muted small">{r.schedule.timeZone}</span>
                <div>
                  {r.workItemId && openTask && (
                    <button
                      className="btn-icon"
                      aria-label={`Abrir pendiente ${r.title}`}
                      onClick={() => openTask(r.workItemId!)}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  )}
                  <button
                    className="btn-icon"
                    aria-label={`Editar recordatorio ${r.title}`}
                    onClick={() => setEditor(r)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className="btn-icon"
                    disabled={!!busy}
                    aria-label={`Eliminar recordatorio ${r.title}`}
                    onClick={() => setRemoving(r)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {data.total > 30 && (
        <div className="reminder-pagination">
          <button
            className="btn btn-ghost"
            disabled={page === 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={17} /> Anterior
          </button>
          <span>
            {page} / {Math.ceil(data.total / 30)}
          </span>
          <button
            className="btn btn-ghost"
            disabled={page * 30 >= data.total || loading}
            onClick={() => setPage(page + 1)}
          >
            Siguiente <ChevronRight size={17} />
          </button>
        </div>
      )}
      {editor && (
        <ReminderEditor
          key={editor === 'new' ? 'new' : editor.id}
          reminder={editor === 'new' ? undefined : editor}
          taskId={taskId}
          taskTitle={taskTitle}
          workspace={w}
          user={user}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
            void load().catch((e) => setError(errorMessage(e)));
          }}
        />
      )}
      {removing && (
        <Modal
          title="Eliminar recordatorio"
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <div className="modal-body">
            <p>¿Eliminar «{removing.title}» y cancelar sus próximos avisos?</p>
            <ErrorBox message={error} />
          </div>
          <div className="modal-footer reminder-actions">
            <button className="btn btn-ghost" disabled={!!busy} onClick={() => setRemoving(null)}>
              Cancelar
            </button>
            <button
              className="btn btn-danger"
              disabled={!!busy}
              onClick={() =>
                void run(removing.id, () =>
                  api(`/reminders/${removing.id}?version=${removing.version}`, 'DELETE'),
                )
              }
            >
              Eliminar recordatorio
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ReminderEditor({
  reminder,
  taskId,
  taskTitle,
  workspace: w,
  user,
  onClose,
  onSaved,
}: {
  reminder?: Reminder;
  taskId?: string;
  taskTitle?: string;
  workspace: Workspace;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const linked = reminder?.workItemId || taskId;
  const defaultSchedule: ReminderSchedule = {
    mode: 'interval',
    every: 1,
    unit: 'hours',
    days: [1, 2, 3, 4, 5],
    time: '09:00',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    startsAt: new Date(Math.ceil(Date.now() / 60000) * 60000 + 5 * 60000).toISOString(),
  };
  const [title, setTitle] = useState(reminder?.title || taskTitle || '');
  const [message, setMessage] = useState(reminder?.message || '');
  const [project, setProject] = useState(linked ? '' : reminder?.projectId || '');
  const [audience, setAudience] = useState(reminder?.audience || (linked ? 'assignee' : 'user'));
  const [recipient, setRecipient] = useState(reminder?.recipientId || user.id);
  const [schedule, setSchedule] = useState(
    reminder?.schedule
      ? { ...reminder.schedule, days: reminder.schedule.days || [1, 2, 3, 4, 5] }
      : defaultSchedule,
  );
  const [enabled, setEnabled] = useState(reminder?.enabled ?? true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const zoneId = useId();
  const formId = useId();
  const change = <K extends keyof ReminderSchedule>(key: K, value: ReminderSchedule[K]) => {
    setSchedule((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };
  const close = () => {
    if (!busy && (!dirty || confirm('¿Descartar los cambios del recordatorio?'))) onClose();
  };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(reminder ? `/reminders/${reminder.id}` : '/reminders', reminder ? 'PUT' : 'POST', {
        title,
        message,
        projectId: project || null,
        workItemId: linked || null,
        audience,
        recipientId: audience === 'user' ? recipient : null,
        schedule,
        enabled,
        version: reminder?.version,
      });
      setDirty(false);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={reminder ? 'Editar recordatorio' : 'Nuevo recordatorio'} onClose={close}>
      <form
        className="modal-body reminder-editor"
        id={formId}
        onSubmit={save}
        data-update-blocked={dirty || busy}
      >
        <ErrorBox message={error} />
        <fieldset disabled={busy}>
          <Field label={linked ? 'Pendiente' : 'Título'}>
            <input
              required
              maxLength={200}
              readOnly={!!linked}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </Field>
          <Field
            label="Mensaje"
            hint={
              linked
                ? 'Opcional. Si se deja vacío se enviará un aviso para resolver el pendiente.'
                : 'El texto que recibirá la persona o el equipo.'
            }
          >
            <textarea
              maxLength={2000}
              rows={3}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setDirty(true);
              }}
            />
          </Field>
          <div className="reminder-fields">
            {!linked && (
              <Field label="Contexto">
                <select
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                    if (!e.target.value && audience === 'project') setAudience('workspace');
                    setDirty(true);
                  }}
                >
                  <option value="">General del workspace</option>
                  {w.projects
                    .filter((p) => !p.archived || p.id === project)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="Para quién">
              <select
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value as Reminder['audience']);
                  setDirty(true);
                }}
              >
                {linked && <option value="assignee">Responsable del pendiente</option>}
                <option value="user">Una persona</option>
                <option value="workspace">Todos en este espacio</option>
                {(linked || project) && (
                  <option value="project">Todos con acceso al proyecto</option>
                )}
              </select>
            </Field>
            {audience === 'user' && (
              <Field label="Destinatario">
                <select
                  required
                  value={recipient}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    setDirty(true);
                  }}
                >
                  <option value="" disabled>
                    Selecciona una persona
                  </option>
                  {w.users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.id === user.id ? ' (yo)' : ''}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
          {audience === 'assignee' && (
            <p className="muted small">
              Sin responsable, se avisará a todos con acceso al pendiente. La asignación se revisa
              en cada aviso.
            </p>
          )}
          {audience === 'project' && (
            <p className="muted small">
              Miembros del workspace con permiso para proyectos. Se revisa el acceso en cada aviso.
            </p>
          )}
          <h3 className="reminder-section-label">Programación</h3>
          <Field label="Repetición">
            <select
              value={schedule.mode}
              onChange={(e) => change('mode', e.target.value as ReminderSchedule['mode'])}
            >
              <option value="interval">Cada cierto tiempo</option>
              <option value="weekly">Días de la semana</option>
              <option value="once">Una sola vez</option>
            </select>
          </Field>
          {schedule.mode === 'interval' && (
            <div className="reminder-fields">
              <Field label="Cada">
                <input
                  required
                  type="number"
                  min={1}
                  max={10000}
                  value={schedule.every}
                  onChange={(e) => change('every', Number(e.target.value))}
                />
              </Field>
              <Field label="Unidad">
                <select
                  value={schedule.unit}
                  onChange={(e) => change('unit', e.target.value as ReminderSchedule['unit'])}
                >
                  <option value="minutes">Minutos</option>
                  <option value="hours">Horas</option>
                  <option value="days">Días</option>
                </select>
              </Field>
            </div>
          )}
          {schedule.mode === 'weekly' && (
            <>
              <div className="field">
                <span>Días de la semana</span>
                <div className="reminder-weekdays" role="group" aria-label="Días de la semana">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      key={d}
                      aria-pressed={schedule.days.includes(d)}
                      onClick={() =>
                        change(
                          'days',
                          schedule.days.includes(d)
                            ? schedule.days.filter((x) => x !== d)
                            : [...schedule.days, d].sort(),
                        )
                      }
                    >
                      {weekdays[d]}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Hora del aviso">
                <input
                  required
                  type="time"
                  value={schedule.time}
                  onChange={(e) => change('time', e.target.value)}
                />
              </Field>
            </>
          )}
          <div className="reminder-fields">
            <Field
              label={
                schedule.mode === 'once'
                  ? 'Fecha del aviso (hora del dispositivo)'
                  : 'Comenzar desde (hora del dispositivo)'
              }
            >
              <input
                required
                type="datetime-local"
                value={localInput(new Date(schedule.startsAt))}
                onChange={(e) => {
                  if (e.target.value) change('startsAt', new Date(e.target.value).toISOString());
                }}
              />
            </Field>
            <Field
              label="Zona horaria"
              hint="Los días y horas del calendario se calculan en esta zona."
            >
              <div>
                <input
                  required
                  maxLength={100}
                  list={zoneId}
                  value={schedule.timeZone}
                  onChange={(e) => change('timeZone', e.target.value)}
                />
                <datalist id={zoneId}>
                  {Array.from(
                    new Set([
                      defaultSchedule.timeZone,
                      'UTC',
                      ...Intl.supportedValuesOf('timeZone'),
                    ]),
                  ).map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </div>
            </Field>
          </div>
          <label className="reminder-enabled">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setDirty(true);
              }}
            />{' '}
            Programación activa
          </label>
          <p className="muted small">
            {scheduleLabel(schedule)} · {schedule.timeZone}. No tiene fecha de vencimiento. Los
            avisos del dispositivo requieren activar notificaciones en Ajustes.
          </p>
        </fieldset>
      </form>
      <div className="modal-footer reminder-actions">
        <button className="btn btn-ghost" disabled={busy} onClick={close}>
          Cancelar
        </button>
        <button className="btn btn-primary" form={formId} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar recordatorio'}
        </button>
      </div>
    </Modal>
  );
}
