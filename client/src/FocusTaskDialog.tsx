import { useEffect, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { api, errorMessage } from './api';
import { useChanges } from './changes';
import { Badge, ErrorBox, Field, Modal } from './components';
import type { TaskItem, TaskPage, Workspace } from './types';

export function FocusTaskDialog({
  initial,
  workspace: w,
  onConfirm,
  onClose,
}: {
  initial: TaskItem[];
  workspace: Workspace;
  onConfirm: (tasks: TaskItem[]) => Promise<void>;
  onClose: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => searchRef.current?.focus(), []);
  const [selected, setSelected] = useState(() => new Map(initial.map((task) => [task.id, task])));
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TaskPage>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useChanges(['tasks', 'catalog'], () => setRevision((r) => r + 1));
  useEffect(() => {
    if (selectionOnly) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        scope: 'open',
        assignee: 'mine-or-unassigned',
        q: query,
        page: String(page),
      });
      if (project) params.set('project', project);
      void api<TaskPage>(`/tasks?${params}`, 'GET', undefined, controller.signal)
        .then((value) => {
          if (controller.signal.aborted) return;
          setResult(value);
          setPage((p) => Math.min(p, Math.max(1, Math.ceil(value.total / 50))));
          setError('');
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setResult({ items: [], total: 0, page: 1, pageSize: 50 });
            setError(errorMessage(e));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, project, page, selectionOnly, revision]);

  const matching = [...selected.values()].filter(
    (task) =>
      (!project || task.projectId === project) &&
      `${task.title} ${task.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const total = selectionOnly ? matching.length : result.total;
  const pages = Math.max(1, Math.ceil(total / 50));
  const currentPage = Math.min(page, pages);
  const items = selectionOnly
    ? matching.slice((currentPage - 1) * 50, currentPage * 50)
    : result.items;
  const waiting = !selectionOnly && loading;
  function toggle(task: TaskItem) {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(task.id)) next.delete(task.id);
      else next.set(task.id, task);
      return next;
    });
  }
  async function confirm() {
    setSaving(true);
    setError('');
    try {
      await onConfirm([...selected.values()]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Elegir pendientes para Focus"
      wide
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <div className="modal-body focus-picker-dialog">
        <p className="muted small">
          Agrega los pendientes propios o sin responsable que quieras realizar. La selección se
          conserva entre búsquedas y páginas, sin límite de cantidad.
        </p>
        <ErrorBox message={error} />
        <fieldset disabled={saving}>
          <div className="form-grid">
            <Field label="Buscar pendientes para enfocar">
              <input
                ref={searchRef}
                maxLength={200}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Título o descripción…"
              />
            </Field>
            <Field label="Proyecto de los pendientes">
              <select
                value={project}
                onChange={(e) => {
                  setProject(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos los proyectos</option>
                {w.projects
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <div className="focus-picker-toolbar">
            <div className="tabs" aria-label="Lista de pendientes">
              <button
                className={!selectionOnly ? 'active' : ''}
                aria-pressed={!selectionOnly}
                onClick={() => {
                  setSelectionOnly(false);
                  setPage(1);
                }}
              >
                Disponibles
              </button>
              <button
                className={selectionOnly ? 'active' : ''}
                aria-pressed={selectionOnly}
                onClick={() => {
                  setSelectionOnly(true);
                  setPage(1);
                }}
              >
                Seleccionados ({selected.size})
              </button>
            </div>
            <button
              className="btn btn-ghost"
              disabled={waiting || !!error || !items.length}
              onClick={() =>
                setSelected((previous) => {
                  const next = new Map(previous);
                  items.forEach((task) => next.set(task.id, task));
                  return next;
                })
              }
            >
              Agregar esta página
            </button>
          </div>
          {waiting && (
            <p role="status" className="muted small">
              Cargando pendientes…
            </p>
          )}
          <div className="focus-task-picker" aria-busy={waiting}>
            {!waiting &&
              items.map((task) => {
                const included = selected.has(task.id);
                const status = w.statuses.find((s) => s.id === task.statusId);
                return (
                  <button
                    key={task.id}
                    className={`focus-picker-item ${included ? 'is-selected' : ''}`}
                    aria-pressed={included}
                    aria-label={`${included ? 'Quitar' : 'Agregar'} ${task.title}`}
                    onClick={() => toggle(task)}
                  >
                    <span className="focus-picker-symbol" aria-hidden="true">
                      {included ? <Check size={19} /> : <Plus size={19} />}
                    </span>
                    <span className="focus-picker-text">
                      <strong>{task.title}</strong>
                      <small>{w.projects.find((p) => p.id === task.projectId)?.name}</small>
                      {task.description && (
                        <span className="focus-task-excerpt">{task.description}</span>
                      )}
                    </span>
                    <Badge color={status?.color}>{status?.name || 'Pendiente'}</Badge>
                  </button>
                );
              })}
            {!waiting && !items.length && (
              <p className="muted small">
                {selectionOnly
                  ? 'No hay seleccionados que coincidan.'
                  : 'No hay pendientes abiertos propios o sin responsable que coincidan.'}
              </p>
            )}
          </div>
          {pages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-ghost"
                disabled={waiting || currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </button>
              <span>
                {currentPage} / {pages}
              </span>
              <button
                className="btn btn-ghost"
                disabled={waiting || currentPage === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
          <div className="focus-picker-footer">
            <span role="status">{selected.size} seleccionados</span>
            <button
              className="btn btn-ghost"
              disabled={!selected.size}
              onClick={() => setSelected(new Map())}
            >
              <X size={16} /> Limpiar selección
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => void confirm()}>
              {saving ? 'Guardando…' : 'Confirmar selección'}
            </button>
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
