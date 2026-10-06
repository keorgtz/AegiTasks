import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Layers3, Pencil, Plus, Repeat2, Trash2 } from 'lucide-react';
import { api, errorMessage } from './api';
import { useChanges } from './changes';
import { Badge, ColorSwatches, ErrorBox, Field, Modal } from './components';
import { estimateKinds, estimateLabel } from './estimates';
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

export type GroupKind = 'modules' | 'cycles';
const groupName = (kind: GroupKind) => (kind === 'modules' ? 'módulo' : 'ciclo');

export function Progress({ value, name }: { value: PlanningProgress; name: string }) {
  return (
    <div>
      <strong>{value.percent}%</strong>{' '}
      <span className="muted small">
        {value.done} de {value.total} resueltos
      </span>
      <progress
        className="planning-progress"
        max={100}
        value={value.percent}
        aria-label={`Avance de ${name}`}
      />
      <div className="planning-estimates">
        {value.estimates.map((e) => (
          <span key={e.kind}>
            {estimateKinds[e.kind]}: {e.completed}/{e.total} {e.kind === 'time' ? 'min' : 'pts'}
            {e.percent == null ? '' : ` · ${e.percent}%`}
          </span>
        ))}
        {value.categories
          .filter((c) => c.total)
          .map((c) => (
            <span key={c.category}>
              {c.category}: {c.done}/{c.total}
            </span>
          ))}
        {value.unestimated > 0 && <span>{value.unestimated} sin estimación</span>}
      </div>
    </div>
  );
}

export function ProjectPlanning({
  project,
  workspace,
  onSaved,
  onShowTasks,
}: {
  project: Project;
  workspace: Workspace;
  onSaved: () => Promise<void>;
  onShowTasks: (kind: GroupKind, id: string) => void;
}) {
  const [data, setData] = useState<ProjectPlanningData | null>(null);
  const [tab, setTab] = useState<'overview' | GroupKind>('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ kind: GroupKind; group?: ProjectGroup } | null>(null);
  const [picker, setPicker] = useState<{ kind: GroupKind; group: ProjectGroup } | null>(null);
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
      }
    },
    [project.id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(errorMessage(e));
    });
    return () => controller.abort();
  }, [load]);
  useChanges(['tasks', 'catalog'], () => void load().catch((e) => setError(errorMessage(e))));
  const saved = async () => {
    await onSaved();
    await load();
  };
  async function remove(kind: GroupKind, group: ProjectGroup) {
    if (
      !confirm(
        `¿Eliminar ${groupName(kind)} «${group.name}»? Sus pendientes se conservan y quedan sin esta agrupación.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/${kind}/${group.id}`, 'DELETE');
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card project-planning">
      <summary className="planning-summary">
        <strong>Planificación y avance</strong>
        <span className="muted small">
          {data
            ? `${data.project.percent}% · ${data.project.done}/${data.project.total} resueltos`
            : 'Cargando…'}
        </span>
      </summary>
      <ErrorBox message={error} />
      {error && (
        <button
          className="btn btn-ghost"
          onClick={() => void load().catch((e) => setError(errorMessage(e)))}
        >
          Reintentar
        </button>
      )}
      <div className="planning-tabs" aria-label="Planificación del proyecto">
        <button aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>
          Resumen del proyecto
        </button>
        <button aria-pressed={tab === 'modules'} onClick={() => setTab('modules')}>
          <Layers3 size={16} /> Módulos
        </button>
        <button aria-pressed={tab === 'cycles'} onClick={() => setTab('cycles')}>
          <Repeat2 size={16} /> Ciclos
        </button>
      </div>
      {data && tab === 'overview' && (
        <>
          <Progress value={data.project} name={project.name} />
          <p className="muted small subsection">
            Proyecto completo: todos los responsables, sin pendientes archivados. El avance usa los
            estados que cuentan como resueltos. Los totales de cada escala se muestran por separado.
          </p>
          <p className="muted small">
            {data.ungrouped.total} pendientes sin módulo · {data.ungrouped.done} resueltos. También
            cuentan en el avance del proyecto.
          </p>
          <button className="btn btn-ghost" onClick={() => onShowTasks('modules', 'none')}>
            Ver pendientes sin módulo
          </button>
        </>
      )}
      {tab !== 'overview' && (
        <>
          <div className="section-heading">
            <p className="muted small">
              {tab === 'modules'
                ? 'Partes del proyecto: módulos, funcionalidades o áreas.'
                : 'Agrupa lo que vas a resolver en un día o periodo. Las fechas son opcionales y pueden coincidir entre ciclos.'}
            </p>
            <button
              className="btn btn-primary"
              disabled={busy || project.archived}
              onClick={() => setEditor({ kind: tab })}
            >
              <Plus size={16} /> Crear {groupName(tab)}
            </button>
          </div>
          {!data ? (
            <p className="muted">Cargando agrupaciones…</p>
          ) : !data[tab].length ? (
            <p className="muted">
              Todavía no hay {tab === 'modules' ? 'módulos' : 'ciclos'}. Puedes crear uno cuando lo
              necesites.
            </p>
          ) : (
            <div className="planning-groups">
              {data[tab].map(({ group, progress }) => (
                <article
                  className="planning-group"
                  key={group.id}
                  aria-label={`${groupName(tab)} ${group.name}`}
                >
                  <div className="section-heading">
                    <h3>
                      <Badge color={group.color}>{group.name}</Badge>
                    </h3>
                    <button
                      className="btn-icon"
                      disabled={busy}
                      aria-label={`Editar ${groupName(tab)} ${group.name}`}
                      onClick={() => setEditor({ kind: tab, group })}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                  {group.description && <p className="muted small">{group.description}</p>}
                  {(group.startsOn || group.endsOn) && (
                    <p className="muted small">
                      {group.startsOn ? dateLabel(group.startsOn) : 'Sin inicio'} →{' '}
                      {group.endsOn ? dateLabel(group.endsOn) : 'Sin fecha final'}
                    </p>
                  )}
                  <Progress value={progress} name={group.name} />
                  <div className="planning-actions">
                    <button className="btn btn-ghost" onClick={() => onShowTasks(tab, group.id)}>
                      Ver pendientes
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={busy || project.archived}
                      onClick={() => setPicker({ kind: tab, group })}
                    >
                      Agregar pendientes
                    </button>
                    <button
                      className="btn-icon"
                      disabled={busy}
                      aria-label={`Eliminar ${groupName(tab)} ${group.name}`}
                      onClick={() => void remove(tab, group)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {editor && (
        <GroupEditor
          project={project}
          {...editor}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {picker && (
        <GroupTaskPicker
          {...picker}
          workspace={workspace}
          onClose={() => setPicker(null)}
          onSaved={saved}
        />
      )}
    </details>
  );
}

export function GroupEditor({
  kind,
  group,
  project,
  onClose,
  onSaved,
}: {
  kind: GroupKind;
  group?: ProjectGroup;
  project: Project;
  onClose: () => void;
  onSaved: (group: ProjectGroup) => Promise<void>;
}) {
  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [color, setColor] = useState(group?.color || project.color);
  const [startsOn, setStartsOn] = useState(group?.startsOn || '');
  const [endsOn, setEndsOn] = useState(group?.endsOn || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<ProjectGroup>(
        `/${kind}${group ? `/${group.id}` : ''}`,
        group ? 'PUT' : 'POST',
        {
          name,
          description,
          color,
          projectId: project.id,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
        },
      );
      await onSaved(result);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${group ? 'Editar' : 'Crear'} ${groupName(kind)}`}
      onClose={() => !busy && onClose()}
    >
      <form className="modal-body" onSubmit={save} data-update-blocked={true}>
        <ErrorBox message={error} />
        <fieldset disabled={busy}>
          <Field label={`Nombre del ${groupName(kind)}`}>
            <input
              autoFocus
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Descripción de la agrupación (opcional)">
            <textarea
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Fecha inicial (opcional)">
              <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </Field>
            <Field label="Fecha final (opcional)">
              <input
                type="date"
                min={startsOn || undefined}
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </Field>
          </div>
          <ColorSwatches label="Color de la agrupación" value={color} onChange={setColor} />
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary">
              {busy ? 'Guardando…' : 'Guardar agrupación'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

export function GroupTaskPicker({
  kind,
  group,
  workspace,
  onClose,
  onSaved,
}: {
  kind: GroupKind;
  group: ProjectGroup;
  workspace: Workspace;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TaskPage | null>(null);
  const [selected, setSelected] = useState<Record<string, TaskItem>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      project: group.projectId,
      scope: 'all',
      assignee: 'all',
      sort: 'newest',
      q: search,
      page: String(page),
    });
    void api<TaskPage>(`/tasks?${params}`, 'GET', undefined, controller.signal)
      .then((r) => {
        setResult(r);
        setError('');
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [group.projectId, search, page]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/${kind}/${group.id}/tasks`, 'POST', {
        tasks: Object.values(selected).map((t) => ({ id: t.id, version: t.version })),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Agregar pendientes al ${groupName(kind)}`}
      wide
      onClose={() => !busy && onClose()}
    >
      <form
        className="modal-body planning-picker-dialog"
        onSubmit={save}
        data-update-blocked={Object.keys(selected).length > 0 || busy}
      >
        <p className="muted small">
          Selecciona pendientes del proyecto para «{group.name}». Si tienen otro {groupName(kind)},
          se trasladan a este. Su {kind === 'modules' ? 'ciclo' : 'módulo'} se conserva.
        </p>
        <ErrorBox message={error} />
        <Field label="Buscar pendientes para agrupar">
          <input
            maxLength={200}
            value={search}
            disabled={busy}
            onChange={(e) => {
              setLoading(true);
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        {loading ? (
          <p role="status">Cargando pendientes…</p>
        ) : (
          <div className="planning-task-picker">
            {result?.items.map((t) => {
              const assigned = (kind === 'modules' ? t.moduleId : t.cycleId) === group.id;
              return (
                <label className="planning-task-option" key={t.id}>
                  <input
                    type="checkbox"
                    disabled={busy || assigned}
                    checked={assigned || !!selected[t.id]}
                    onChange={(e) =>
                      setSelected((previous) => {
                        const next = { ...previous };
                        if (e.target.checked) next[t.id] = t;
                        else delete next[t.id];
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {workspace.statuses.find((s) => s.id === t.statusId)?.name}
                      {estimateLabel(t) ? ` · ${estimateLabel(t)}` : ''}
                      {assigned ? ` · Ya pertenece a este ${groupName(kind)}` : ''}
                    </small>
                  </span>
                </label>
              );
            })}
            {!result?.items.length && <p className="muted">No hay pendientes con esta búsqueda.</p>}
          </div>
        )}
        <div className="planning-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || loading || page === 1}
            onClick={() => {
              setLoading(true);
              setPage(page - 1);
            }}
          >
            Anterior
          </button>
          <span className="muted small">
            Página {page} de {Math.max(1, Math.ceil((result?.total || 0) / 50))}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || loading || page * 50 >= (result?.total || 0)}
            onClick={() => {
              setLoading(true);
              setPage(page + 1);
            }}
          >
            Siguiente
          </button>
        </div>
        <div className="form-actions">
          <small role="status">{Object.keys(selected).length} seleccionados</small>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || loading || !Object.keys(selected).length}
          >
            {busy ? 'Guardando…' : 'Agregar seleccionados'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
