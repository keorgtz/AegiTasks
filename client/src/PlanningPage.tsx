import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarRange,
  Columns3,
  Filter,
  Layers3,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
  Unlink,
} from 'lucide-react';
import { api, errorMessage, getActiveSpace } from './api';
import { useChanges } from './changes';
import { Badge, Empty, ErrorBox, Field, Modal } from './components';
import { estimateLabel } from './estimates';
import { GroupEditor, GroupTaskPicker, Progress, type GroupKind } from './ProjectPlanning';
import {
  dateLabel,
  type PlanningProgress,
  type Project,
  type ProjectGroup,
  type ProjectPlanningData,
  type TaskItem,
  type TaskPage,
  type Workspace,
} from './types';
import './styles/planning-page.css';

type Layout = 'gallery' | 'list' | 'board' | 'timeline';
type Entry = { group: ProjectGroup; progress: PlanningProgress };
const layouts = [
  { id: 'gallery', label: 'Tarjetas', icon: LayoutGrid },
  { id: 'list', label: 'Lista', icon: List },
  { id: 'board', label: 'Tablero', icon: Columns3 },
  { id: 'timeline', label: 'Cronología', icon: CalendarRange },
] as const;
const moduleStages = [
  { id: 'empty', label: 'Sin pendientes' },
  { id: 'pending', label: 'Sin resolver' },
  { id: 'progress', label: 'Avance parcial' },
  { id: 'done', label: 'Resueltos' },
];
const cycleStages = [
  { id: 'undated', label: 'Sin periodo definido' },
  { id: 'upcoming', label: 'Próximos' },
  { id: 'active', label: 'En curso' },
  { id: 'ended', label: 'Periodo finalizado' },
];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function planningStage(kind: GroupKind, entry: Entry, day = today()) {
  if (kind === 'modules')
    return !entry.progress.total
      ? 'empty'
      : entry.progress.done === entry.progress.total
        ? 'done'
        : entry.progress.done
          ? 'progress'
          : 'pending';
  const { startsOn, endsOn } = entry.group;
  // Partial dates remain visible without inventing a complete sprint schedule.
  if (endsOn && endsOn < day) return 'ended';
  if (startsOn && startsOn > day) return 'upcoming';
  if (startsOn && endsOn) return 'active';
  return 'undated';
}
function period(group: ProjectGroup) {
  return group.startsOn || group.endsOn
    ? `${group.startsOn ? dateLabel(group.startsOn) : 'Sin inicio'} → ${group.endsOn ? dateLabel(group.endsOn) : 'Sin fecha final'}`
    : 'Fechas opcionales · sin programar';
}
function LayoutPicker({
  value,
  onChange,
  detail = false,
}: {
  value: string;
  onChange: (value: Layout) => void;
  detail?: boolean;
}) {
  return (
    <div
      className="planning-layouts"
      role="group"
      aria-label={detail ? 'Vista de pendientes de la agrupación' : 'Vista de agrupaciones'}
    >
      {layouts
        .filter((l) => !detail || ['list', 'board'].includes(l.id))
        .map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className="btn-icon"
            title={label}
            aria-label={label}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <Icon size={18} />
          </button>
        ))}
    </div>
  );
}
export function PlanningPage({
  project,
  kind,
  groupId,
  workspace,
  userId,
  canTasks,
  navigate,
  onSaved,
  onOpenTask,
  onNewTask,
  taskRevision,
}: {
  project: Project;
  kind: GroupKind;
  groupId: string;
  workspace: Workspace;
  userId: string;
  canTasks: boolean;
  navigate: (route: string) => void;
  onSaved: () => Promise<void>;
  onOpenTask: (id: string) => void;
  onNewTask: (kind: GroupKind, id: string) => void;
  taskRevision: number;
}) {
  const preferenceKey = `aegitasks-planning-${userId}-${getActiveSpace()}-${project.id}-${kind}`;
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const value = localStorage.getItem(preferenceKey);
      return layouts.some((l) => l.id === value) ? (value as Layout) : 'gallery';
    } catch {
      return 'gallery';
    }
  });
  const [data, setData] = useState<ProjectPlanningData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ group?: ProjectGroup } | null>(null);
  const [picker, setPicker] = useState<ProjectGroup | null>(null);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [sort, setSort] = useState('name');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [day, setDay] = useState(today);
  const stages = kind === 'modules' ? moduleStages : cycleStages;
  const singular = kind === 'modules' ? 'módulo' : 'ciclo';
  const title = kind === 'modules' ? 'Módulos' : 'Ciclos';
  const base = `project/${project.id}/${kind}`;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api<ProjectPlanningData>(
        `/projects/${project.id}/planning`,
        'GET',
        undefined,
        signal,
      );
      if (!signal?.aborted) {
        setData(result);
        setError('');
        setDay(today());
      }
    },
    [project.id],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal).catch((e) => {
      if (!c.signal.aborted) setError(errorMessage(e));
    });
    return () => c.abort();
  }, [load, taskRevision]);
  useChanges(['catalog'], () => void load().catch((e) => setError(errorMessage(e))));
  // Refresh date classifications after local midnight, without polling server data.
  useEffect(() => {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => setDay(today()), next.getTime() - Date.now() + 50);
    return () => clearTimeout(timer);
  }, [day]);
  const saved = async () => {
    await onSaved();
    await load();
  };
  const entries = data?.[kind] || [];
  const current = entries.find((e) => e.group.id === groupId);
  const visible = entries
    .filter(
      (e) =>
        (!stage || planningStage(kind, e, day) === stage) &&
        `${e.group.name} ${e.group.description}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => {
      if (sort === 'progress')
        return b.progress.percent - a.progress.percent || a.group.name.localeCompare(b.group.name);
      if (sort === 'date')
        return (
          (a.group.startsOn || a.group.endsOn || '9999').localeCompare(
            b.group.startsOn || b.group.endsOn || '9999',
          ) || a.group.name.localeCompare(b.group.name)
        );
      return a.group.name.localeCompare(b.group.name);
    });
  function changeLayout(value: Layout) {
    setLayout(value);
    try {
      localStorage.setItem(preferenceKey, value);
    } catch {
      /* Layout remains usable when storage is unavailable. */
    }
  }
  async function remove(group: ProjectGroup) {
    if (
      !confirm(
        `¿Eliminar ${singular} «${group.name}»? Los pendientes se conservan sin esta agrupación.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/${kind}/${group.id}`, 'DELETE');
      await saved();
      if (groupId === group.id) navigate(base);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function groupCard(entry: Entry, compact = false) {
    const status = planningStage(kind, entry, day);
    return (
      <article
        className={`planning-entry ${compact ? 'planning-entry-row' : ''}`}
        key={entry.group.id}
        aria-label={`${singular} ${entry.group.name}`}
      >
        <button
          className="planning-entry-open"
          aria-label={`Abrir ${singular} ${entry.group.name}`}
          onClick={() => navigate(`${base}/${entry.group.id}`)}
        >
          <span className="planning-entry-title">
            <span className={`planning-entry-icon tone-${entry.group.color}`}>
              {kind === 'modules' ? <Layers3 size={20} /> : <Repeat2 size={20} />}
            </span>
            <strong>{entry.group.name}</strong>
          </span>
          <span className="muted small">{period(entry.group)}</span>
          {!compact && (
            <span className="planning-entry-description muted small">
              {entry.group.description ||
                (kind === 'modules'
                  ? 'Una parte del proyecto, con su propio avance.'
                  : 'Un objetivo para tu próximo periodo de trabajo.')}
            </span>
          )}
        </button>
        <div className="planning-entry-metrics">
          <Badge color={status === 'done' ? 'green' : status === 'active' ? 'purple' : 'neutral'}>
            {stages.find((s) => s.id === status)?.label}
          </Badge>
          <Progress value={entry.progress} name={entry.group.name} />
        </div>
        <div className="planning-entry-actions">
          <button
            className="btn-icon"
            aria-label={`Editar ${singular} ${entry.group.name}`}
            disabled={busy}
            onClick={() => setEditor({ group: entry.group })}
          >
            <Pencil size={16} />
          </button>
          <button
            className="btn-icon"
            aria-label={`Eliminar ${singular} ${entry.group.name}`}
            disabled={busy || (entry.progress.total > 0 && !canTasks)}
            onClick={() => void remove(entry.group)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </article>
    );
  }
  return (
    <section className="planning-page" aria-label={`Gestión de ${title.toLowerCase()}`}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{project.name}</div>
          <h1>{groupId && current ? current.group.name : title}</h1>
          <p>
            {groupId
              ? `Detalle del ${singular} · avance y pendientes en un solo lugar.`
              : kind === 'modules'
                ? 'Divide tu producto en áreas. Cada módulo tiene un objetivo y su propio avance.'
                : 'Prepara lo que vas a resolver en un día o periodo. Tú decides las fechas.'}
          </p>
        </div>
        {!groupId && (
          <button
            className="btn btn-primary"
            disabled={project.archived || busy}
            onClick={() => setEditor({})}
          >
            <Plus size={18} /> Crear {singular}
          </button>
        )}
      </div>
      <ErrorBox message={error} />
      {error && (
        <button
          className="btn btn-ghost"
          onClick={() => void load().catch((e) => setError(errorMessage(e)))}
        >
          Reintentar
        </button>
      )}
      {!data ? (
        <p role="status">Cargando planificación…</p>
      ) : groupId ? (
        current ? (
          <>
            <div className="planning-detail-actions">
              <button className="btn btn-ghost" onClick={() => navigate(base)}>
                <ArrowLeft size={17} /> Volver a {title.toLowerCase()}
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setEditor({ group: current.group })}
              >
                <Pencil size={16} /> Editar {singular}
              </button>
              <button
                className="btn-icon"
                disabled={busy || (current.progress.total > 0 && !canTasks)}
                aria-label={`Eliminar ${singular} ${current.group.name}`}
                onClick={() => void remove(current.group)}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="planning-detail-summary card">
              <div>
                <Badge color={current.group.color}>
                  {stages.find((s) => s.id === planningStage(kind, current, day))?.label}
                </Badge>
                <p>
                  {current.group.description ||
                    'Agrega una descripción para compartir el objetivo con tu equipo.'}
                </p>
                <span className="muted small">
                  <CalendarRange size={15} /> {period(current.group)}
                </span>
                {kind === 'cycles' &&
                  planningStage(kind, current, day) === 'ended' &&
                  current.progress.total > current.progress.done && (
                    <p className="planning-period-warning">
                      El periodo terminó con {current.progress.total - current.progress.done}{' '}
                      pendientes por resolver. Sus estados se conservan.
                    </p>
                  )}
              </div>
              <Progress value={current.progress} name={current.group.name} />
            </div>
            {canTasks ? (
              <GroupTasks
                key={current.group.id}
                kind={kind}
                entry={current}
                workspace={workspace}
                disabled={project.archived || busy}
                revision={taskRevision}
                onSaved={saved}
                onOpen={onOpenTask}
                onNew={() => onNewTask(kind, current.group.id)}
                onAdd={() => setPicker(current.group)}
              />
            ) : (
              <p className="muted">
                El detalle de pendientes requiere permiso de la vista Pendientes.
              </p>
            )}
          </>
        ) : (
          <Empty
            title={`Este ${singular} ya no está disponible`}
            icon={kind === 'modules' ? <Layers3 /> : <Repeat2 />}
          >
            <button className="btn btn-ghost" onClick={() => navigate(base)}>
              Volver a {title.toLowerCase()}
            </button>
          </Empty>
        )
      ) : (
        <>
          <div className="planning-overview-stats">
            <div>
              <strong>{entries.length}</strong>
              <span>{title.toLowerCase()}</span>
            </div>
            <div>
              <strong>{data.project.percent}%</strong>
              <span>avance del proyecto</span>
            </div>
            <div>
              <strong>{entries.reduce((n, e) => n + e.progress.total - e.progress.done, 0)}</strong>
              <span>pendientes en {title.toLowerCase()}</span>
            </div>
            <div>
              <strong>
                {stages.find((s) => s.id === (kind === 'modules' ? 'progress' : 'active'))?.label}
              </strong>
              <span>
                {
                  entries.filter(
                    (e) =>
                      planningStage(kind, e, day) === (kind === 'modules' ? 'progress' : 'active'),
                  ).length
                }{' '}
                {title.toLowerCase()}
              </span>
            </div>
          </div>
          <div className="planning-manager-toolbar">
            <label className="planning-search">
              <Search size={18} />
              <input
                aria-label={`Buscar ${title.toLowerCase()}`}
                placeholder={`Buscar ${title.toLowerCase()}…`}
                maxLength={200}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button className="btn btn-ghost" onClick={() => setFiltersOpen(true)}>
              <Filter size={17} /> Filtros
              {(stage || sort !== 'name') && (
                <span className="badge tone-purple">
                  {Number(!!stage) + Number(sort !== 'name')}
                </span>
              )}
            </button>
            <LayoutPicker value={layout} onChange={changeLayout} />
          </div>
          <div className="planning-result-caption">
            <span className="muted small">
              {visible.length} de {entries.length} {title.toLowerCase()} ·{' '}
              {layouts.find((l) => l.id === layout)?.label}
            </span>
            {(search || stage || sort !== 'name') && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setSearch('');
                  setStage('');
                  setSort('name');
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
          {!visible.length ? (
            <div className="card">
              <Empty
                icon={kind === 'modules' ? <Layers3 size={32} /> : <Repeat2 size={32} />}
                title={entries.length ? 'No hay coincidencias' : `Tu primer ${singular}`}
              >
                {entries.length
                  ? 'Prueba otra búsqueda o limpia los filtros.'
                  : kind === 'modules'
                    ? 'Organiza una funcionalidad o área del producto y reúne sus pendientes.'
                    : 'Prepara un grupo de pendientes para el periodo que elijas. Las fechas son opcionales.'}
              </Empty>
            </div>
          ) : layout === 'board' ? (
            <div className="planning-stage-board">
              {stages.map((s) => (
                <section className="planning-stage-column" key={s.id} aria-label={s.label}>
                  <h2>
                    {s.label}
                    <span>
                      {visible.filter((e) => planningStage(kind, e, day) === s.id).length}
                    </span>
                  </h2>
                  {visible
                    .filter((e) => planningStage(kind, e, day) === s.id)
                    .map((e) => groupCard(e))}
                  {!visible.some((e) => planningStage(kind, e, day) === s.id) && (
                    <p className="muted small">Sin {title.toLowerCase()} en esta sección.</p>
                  )}
                </section>
              ))}
            </div>
          ) : layout === 'timeline' ? (
            <GroupTimeline entries={visible} onOpen={(id) => navigate(`${base}/${id}`)} />
          ) : (
            <div className={`planning-manager-${layout}`}>
              {visible.map((e) => groupCard(e, layout === 'list'))}
            </div>
          )}
          <p className="muted small planning-explanation">
            {kind === 'modules'
              ? 'Las secciones del tablero reflejan la proporción de pendientes resueltos. Los estados personalizados se gestionan en cada pendiente.'
              : 'La clasificación usa las fechas locales de tu dispositivo. Terminar un periodo no completa sus pendientes; los ciclos pueden coincidir y las fechas son opcionales.'}
          </p>
        </>
      )}
      {filtersOpen && (
        <Modal title={`Filtros de ${title.toLowerCase()}`} onClose={() => setFiltersOpen(false)}>
          <div className="modal-body">
            <Field label={kind === 'modules' ? 'Avance' : 'Periodo'}>
              <select value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">Todos</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ordenar por">
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="name">Nombre</option>
                <option value="date">Fecha inicial</option>
                <option value="progress">Mayor avance</option>
              </select>
            </Field>
            <div className="form-actions">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setStage('');
                  setSort('name');
                }}
              >
                Restablecer
              </button>
              <button className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
                Ver resultados
              </button>
            </div>
          </div>
        </Modal>
      )}
      {editor && (
        <GroupEditor
          kind={kind}
          project={project}
          group={editor.group}
          onClose={() => setEditor(null)}
          onSaved={async (group) => {
            await saved();
            if (!editor.group) navigate(`${base}/${group.id}`);
          }}
        />
      )}
      {picker && (
        <GroupTaskPicker
          kind={kind}
          group={picker}
          workspace={workspace}
          onClose={() => setPicker(null)}
          onSaved={saved}
        />
      )}
    </section>
  );
}

function GroupTimeline({ entries, onOpen }: { entries: Entry[]; onOpen: (id: string) => void }) {
  const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
  const scheduled = entries.filter((e) => e.group.startsOn || e.group.endsOn);
  const dates = scheduled.flatMap((e) =>
    [e.group.startsOn, e.group.endsOn].filter((d): d is string => !!d).map(dayNumber),
  );
  const min = dates.length ? Math.min(...dates) : 0;
  const max = dates.length ? Math.max(...dates) + 1 : 1;
  const span = max - min;
  const marker = dayNumber(today());
  return (
    <div className="planning-timeline card" aria-label="Cronología de agrupaciones">
      {scheduled.length > 0 && (
        <>
          <div className="planning-timeline-axis">
            <span>Periodo</span>
            <div>
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                <span key={fraction}>
                  {new Date((min + (span - 1) * fraction) * 86400000).toLocaleDateString('es', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  })}
                </span>
              ))}
            </div>
          </div>
          {scheduled.map(({ group, progress }) => {
            const start = dayNumber(group.startsOn || group.endsOn!);
            const end = dayNumber(group.endsOn || group.startsOn!) + 1;
            return (
              <div className="planning-timeline-row" key={group.id}>
                <button onClick={() => onOpen(group.id)}>
                  <strong>{group.name}</strong>
                  <small>{period(group)}</small>
                </button>
                <div className="planning-timeline-track">
                  {marker >= min && marker < max && (
                    <span
                      className="planning-today-marker"
                      style={{ left: `${((marker - min) / span) * 100}%` }}
                      aria-label="Hoy"
                    />
                  )}
                  <div
                    className={`planning-timeline-bar tone-${group.color}`}
                    style={{
                      left: `${((start - min) / span) * 100}%`,
                      width: `${((end - start) / span) * 100}%`,
                    }}
                    title={`${group.name}, ${period(group)}, ${progress.percent}% de avance`}
                  >
                    <span>{progress.percent}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
      <div className="planning-unscheduled">
        <h2>
          Sin programar <span className="muted small">{entries.length - scheduled.length}</span>
        </h2>
        {entries
          .filter((e) => !e.group.startsOn && !e.group.endsOn)
          .map(({ group, progress }) => (
            <button className="btn btn-ghost" key={group.id} onClick={() => onOpen(group.id)}>
              <Badge color={group.color}>{group.name}</Badge>
              <span>
                {progress.percent}% · {progress.done}/{progress.total}
              </span>
            </button>
          ))}
        {scheduled.length === entries.length && (
          <p className="muted small">Todas las agrupaciones tienen al menos una fecha.</p>
        )}
      </div>
    </div>
  );
}

function GroupTasks({
  kind,
  entry,
  workspace,
  disabled,
  revision,
  onSaved,
  onOpen,
  onNew,
  onAdd,
}: {
  kind: GroupKind;
  entry: Entry;
  workspace: Workspace;
  disabled: boolean;
  revision: number;
  onSaved: () => Promise<void>;
  onOpen: (id: string) => void;
  onNew: () => void;
  onAdd: () => void;
}) {
  const [result, setResult] = useState<TaskPage | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [layout, setLayout] = useState<Layout>('list');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [actionError, setActionError] = useState('');
  const [filters, setFilters] = useState(false);
  const statuses = workspace.statuses
    .filter((s) => s.projectId === entry.group.projectId)
    .sort((a, b) => a.position - b.position);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      project: entry.group.projectId,
      [kind === 'modules' ? 'module' : 'cycle']: entry.group.id,
      scope: 'all',
      assignee: 'all',
      page: String(page),
      q: query,
      sort: 'priority',
    });
    if (status) params.set('status', status);
    void api<TaskPage>(`/tasks?${params}`, 'GET', undefined, c.signal)
      .then((r) => {
        if (!c.signal.aborted) {
          setResult(r);
          setError('');
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [entry.group.id, entry.group.projectId, kind, page, query, status, revision, reload]);
  useEffect(() => {
    if (
      result &&
      page > 1 &&
      !result.items.length &&
      page > Math.max(1, Math.ceil(result.total / result.pageSize))
    )
      setPage(Math.max(1, Math.ceil(result.total / result.pageSize)));
  }, [result, page]);
  async function mutate(task: TaskItem, statusId?: string) {
    setBusy(true);
    setActionError('');
    try {
      if (statusId)
        await api(`/tasks/${task.id}/status`, 'PUT', { statusId, version: task.version });
      else
        await api(`/${kind}/${entry.group.id}/tasks`, 'POST', {
          tasks: [{ id: task.id, version: task.version }],
          remove: true,
        });
      await onSaved();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
      setReload((r) => r + 1);
    }
  }
  const row = (t: TaskItem) => (
    <article className="planning-detail-task" key={t.id} aria-label={`Pendiente ${t.title}`}>
      <button className="planning-task-open" onClick={() => onOpen(t.id)}>
        <strong>{t.title}</strong>
        <span className="muted small">
          {workspace.users.find((u) => u.id === t.assigneeId)?.name || 'Sin responsable'}
          {estimateLabel(t) ? ` · ${estimateLabel(t)}` : ''}
          {t.dueDate ? ` · ${dateLabel(t.dueDate)}` : ''}
        </span>
      </button>
      <select
        aria-label={`Estado de ${t.title}`}
        value={t.statusId}
        disabled={disabled || busy || loading}
        onChange={(e) => void mutate(t, e.target.value)}
      >
        {statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        className="btn-icon"
        disabled={disabled || busy || loading}
        aria-label={`Quitar ${t.title} del ${kind === 'modules' ? 'módulo' : 'ciclo'}`}
        title="Quitar de la agrupación; conserva el pendiente"
        onClick={() => void mutate(t)}
      >
        <Unlink size={16} />
      </button>
    </article>
  );
  return (
    <section className="planning-detail-work card" aria-label="Pendientes de la agrupación">
      <div className="section-heading">
        <h2>
          Pendientes <span className="muted small">{result?.total ?? '…'}</span>
        </h2>
        <div className="planning-actions">
          <button className="btn btn-ghost" disabled={disabled || busy} onClick={onAdd}>
            <Plus size={16} /> Agregar existentes
          </button>
          <button className="btn btn-primary" disabled={disabled || busy} onClick={onNew}>
            <Plus size={16} /> Nuevo pendiente
          </button>
        </div>
      </div>
      <div className="planning-manager-toolbar">
        <label className="planning-search">
          <Search size={18} />
          <input
            aria-label="Buscar en la agrupación"
            placeholder="Buscar pendientes…"
            maxLength={200}
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </label>
        <button className="btn btn-ghost" onClick={() => setFilters(true)}>
          <Filter size={17} /> Filtros{status && <span className="badge tone-purple">1</span>}
        </button>
        <LayoutPicker value={layout} onChange={setLayout} detail />
      </div>
      <ErrorBox message={error} />
      <ErrorBox message={actionError} />
      {error && (
        <button className="btn btn-ghost" onClick={() => setReload((r) => r + 1)}>
          Reintentar
        </button>
      )}
      {loading || result?.page !== page ? (
        <p role="status">Cargando pendientes…</p>
      ) : !result?.items.length ? (
        <Empty title="No hay pendientes en esta vista" icon={<List size={28} />}>
          {status || query
            ? 'Prueba otros filtros.'
            : 'Agrega pendientes existentes o crea uno para empezar.'}
        </Empty>
      ) : (
        <>
          {layout === 'board' ? (
            <div className="planning-task-board">
              {statuses.map((s) => (
                <section key={s.id} aria-label={`Estado ${s.name}`}>
                  <h3>
                    <Badge color={s.color}>{s.name}</Badge>
                    <span className="muted small">
                      {result.items.filter((t) => t.statusId === s.id).length}
                    </span>
                  </h3>
                  {result.items.filter((t) => t.statusId === s.id).map(row)}
                  {!result.items.some((t) => t.statusId === s.id) && (
                    <p className="muted small">Sin pendientes en esta página.</p>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <div className="planning-detail-list">{result.items.map(row)}</div>
          )}
          <div className="planning-pagination">
            <span className="muted small">
              {result.total} pendientes · página {page} de{' '}
              {Math.max(1, Math.ceil(result.total / result.pageSize))}
              {layout === 'board' && ' · tablero de esta página'}
            </span>
            <button
              className="btn btn-ghost"
              disabled={page === 1 || busy}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <button
              className="btn btn-ghost"
              disabled={page * result.pageSize >= result.total || busy}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
      {filters && (
        <Modal title="Filtros de pendientes de la agrupación" onClose={() => setFilters(false)}>
          <div className="modal-body">
            <Field label="Estado del pendiente">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {statuses.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-actions">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setStatus('');
                  setSearch('');
                  setPage(1);
                }}
              >
                Restablecer
              </button>
              <button className="btn btn-primary" onClick={() => setFilters(false)}>
                Ver resultados
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
