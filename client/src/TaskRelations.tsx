import { useEffect, useState } from 'react';
import { GitBranch, Link2, Plus, Search, Unlink } from 'lucide-react';
import { api, errorMessage } from './api';
import { useChanges } from './changes';
import { Badge, ErrorBox, Modal } from './components';
import type { TaskDetail, TaskItem, TaskPage, Workspace } from './types';
import { TaskStatusButton } from './TaskStatusButton';

export function TaskRelationPicker({
  projectId,
  excludeId,
  relation,
  onSelect,
  onClose,
}: {
  projectId: string;
  excludeId?: string;
  relation: 'parent' | 'child';
  onSelect: (task: TaskItem | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TaskPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      project: projectId,
      relation,
      q: query,
      page: String(page),
    });
    if (excludeId) params.set('exclude', excludeId);
    void api<TaskPage>(`/tasks/parent-options?${params}`, 'GET', undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, excludeId, relation, page, query]);
  async function select(task: TaskItem | null) {
    setBusy(true);
    setError('');
    try {
      await onSelect(task);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={relation === 'parent' ? 'Elegir pendiente padre' : 'Vincular subpendiente existente'}
      onClose={() => !busy && onClose()}
    >
      <div className="modal-body task-relation-picker" data-update-blocked={busy}>
        <p className="muted small">
          {relation === 'parent'
            ? 'Elige un pendiente de este proyecto. Sus descendientes no pueden ser su padre.'
            : 'Los responsables, estados y estimaciones se conservan. Si ya tiene padre, se traslada a este.'}
        </p>
        <label className="planning-search">
          <Search size={17} />
          <input
            aria-label="Buscar pendiente para relacionar"
            placeholder="Buscar pendiente…"
            maxLength={200}
            value={search}
            disabled={busy}
            onChange={(e) => {
              setLoading(true);
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <ErrorBox message={error} />
        {relation === 'parent' && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void select(null)}
          >
            <Unlink size={16} /> Sin padre
          </button>
        )}
        <div className="task-relation-options">
          {loading || search !== query || result?.page !== page ? (
            <p role="status">Cargando pendientes…</p>
          ) : (
            result.items.map((task) => (
              <button
                type="button"
                className="task-relation-option"
                key={task.id}
                disabled={busy}
                onClick={() => void select(task)}
                aria-label={`Seleccionar ${task.title}`}
              >
                <GitBranch size={17} />
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    #{task.id.slice(0, 8)}
                    {task.parentTaskId ? ' · Ya tiene padre' : ''}
                  </small>
                </span>
              </button>
            ))
          )}
          {!loading && !result?.items.length && (
            <p className="muted">No hay pendientes disponibles con esta búsqueda.</p>
          )}
        </div>
        <div className="planning-pagination">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading || busy || page === 1}
            onClick={() => {
              setLoading(true);
              setPage(page - 1);
            }}
          >
            Anterior
          </button>
          <small>
            Página {page} de {Math.max(1, Math.ceil((result?.total || 0) / 50))}
          </small>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading || busy || page * 50 >= (result?.total || 0)}
            onClick={() => {
              setLoading(true);
              setPage(page + 1);
            }}
          >
            Siguiente
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function TaskRelations({
  detail,
  workspace,
  disabled,
  onOpen,
  onCreate,
  onChanged,
}: {
  detail: TaskDetail;
  workspace: Workspace;
  disabled: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onChanged: () => Promise<void>;
}) {
  const [result, setResult] = useState<TaskPage | null>(null);
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [picker, setPicker] = useState(false);
  useChanges(['tasks'], () => setRevision((value) => value + 1));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void api<TaskPage>(
      `/tasks/${detail.item.id}/children?page=${page}&archived=${archived}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setError('');
          if (!value.items.length && page > 1) setPage(Math.max(1, Math.ceil(value.total / 50)));
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    detail.item.id,
    detail.children.total,
    detail.children.done,
    detail.children.archived,
    page,
    archived,
    revision,
  ]);
  async function mutate(task: TaskItem, statusId?: string) {
    setBusy(true);
    setActionError('');
    try {
      await api(
        `/tasks/${task.id}/${statusId ? 'status' : 'parent'}`,
        'PUT',
        statusId
          ? { statusId, version: task.version }
          : { parentTaskId: null, version: task.version },
      );
      await onChanged();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }
  return (
    <section className="task-relations" aria-label="Subpendientes">
      <div className="section-heading">
        <h3>
          <GitBranch size={17} /> Subpendientes{' '}
          <span className="muted small">
            {detail.children.done}/{detail.children.total}
          </span>
        </h3>
        <div className="task-child-actions">
          <button
            className="btn btn-ghost"
            type="button"
            disabled={disabled || busy}
            onClick={() => setPicker(true)}
          >
            <Link2 size={15} /> Vincular existente
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={disabled || busy}
            onClick={onCreate}
          >
            <Plus size={15} /> Crear hijo
          </button>
        </div>
      </div>
      <p className="muted small">
        Cada hijo tiene su responsable y estado. Completar hijos no cambia automáticamente el estado
        del padre.
      </p>
      {detail.parent && (
        <button
          className="btn btn-ghost task-parent-link"
          type="button"
          onClick={() => onOpen(detail.parent!.id)}
        >
          <GitBranch size={15} /> Padre: {detail.parent.title}
          {detail.parent.archived && <Badge>Archivado</Badge>}
        </button>
      )}
      {!!detail.children.archived && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setPage(1);
            }}
          />{' '}
          Mostrar {detail.children.archived} hijos archivados
        </label>
      )}
      <ErrorBox message={error} />
      <ErrorBox message={actionError} />
      {loading ? (
        <p className="muted small" role="status">
          Cargando subpendientes…
        </p>
      ) : (
        result?.items.map((task) => (
          <article
            key={task.id}
            className="task-child-row"
            aria-label={`Subpendiente ${task.title}`}
          >
            <button type="button" onClick={() => onOpen(task.id)}>
              <strong>{task.title}</strong>
              <small>
                {workspace.users.find((u) => u.id === task.assigneeId)?.name || 'Sin responsable'}
                {task.archived ? ' · Archivado' : ''}
              </small>
            </button>
            <TaskStatusButton
              task={task}
              workspace={workspace}
              disabled={disabled || busy}
              onChange={mutate}
            />
            <button
              type="button"
              className="btn-icon"
              aria-label={`Retirar ${task.title} del padre`}
              disabled={disabled || busy || task.archived}
              onClick={() => void mutate(task)}
            >
              <Unlink size={15} />
            </button>
          </article>
        ))
      )}
      {!loading && !result?.items.length && (
        <p className="muted small">Divídelo en pasos o vincula pendientes del proyecto.</p>
      )}
      {!!result && result.total > 50 && (
        <div className="planning-pagination">
          <button
            className="btn btn-ghost"
            type="button"
            disabled={loading || page === 1}
            onClick={() => {
              setLoading(true);
              setPage(page - 1);
            }}
          >
            Anterior
          </button>
          <small>
            Página {page} de {Math.ceil(result.total / 50)}
          </small>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={loading || page * 50 >= result.total}
            onClick={() => {
              setLoading(true);
              setPage(page + 1);
            }}
          >
            Siguiente
          </button>
        </div>
      )}
      {picker && (
        <TaskRelationPicker
          projectId={detail.item.projectId}
          excludeId={detail.item.id}
          relation="child"
          onClose={() => setPicker(false)}
          onSelect={async (task) => {
            if (!task) return;
            await api(`/tasks/${task.id}/parent`, 'PUT', {
              parentTaskId: detail.item.id,
              version: task.version,
            });
            await onChanged();
            setRevision((value) => value + 1);
            setPicker(false);
          }}
        />
      )}
    </section>
  );
}
