import { useState } from 'react';
import { Field, Modal } from './components';
import { priorities, type Workspace } from './types';
import './styles/task-filters.css';

export type TaskFilterValues = {
  project: string;
  folder: string;
  status: string;
  assignee: string;
  tag: string;
  priority: string;
  scope: string;
  sort: string;
};

export function TaskFilters({
  initial,
  workspace: w,
  route,
  projectId,
  onApply,
  onClose,
}: {
  initial: TaskFilterValues;
  workspace: Workspace;
  route: string;
  projectId: string;
  onApply: (values: TaskFilterValues) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState(initial);
  const change = (key: keyof TaskFilterValues, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  return (
    <Modal title="Filtrar pendientes" onClose={onClose}>
      <form
        className="modal-body task-filter-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(values);
        }}
      >
        <p className="muted small">
          Ajusta lo que quieres ver. La búsqueda se conserva al aplicar o restablecer filtros.
        </p>
        <div className="form-grid">
          <Field label="Filtrar por proyecto">
            <select
              value={values.project}
              disabled={!!projectId}
              onChange={(e) =>
                setValues((previous) => ({
                  ...previous,
                  project: e.target.value,
                  folder: '',
                  status: '',
                }))
              }
            >
              <option value="">Todos los proyectos</option>
              {w.projects
                .filter((p) => route === 'archived' || !p.archived || p.id === values.project)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.archived ? ' (archivado)' : ''}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Filtrar por carpeta">
            <select
              value={values.folder}
              disabled={!values.project}
              onChange={(e) => change('folder', e.target.value)}
            >
              <option value="">
                {values.project ? 'Todas las carpetas' : 'Selecciona un proyecto'}
              </option>
              {w.folders
                .filter((f) => f.projectId === values.project)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Filtrar por estado">
            <select
              value={values.status}
              disabled={!values.project}
              onChange={(e) => change('status', e.target.value)}
            >
              <option value="">
                {values.project ? 'Todos los estados' : 'Selecciona un proyecto'}
              </option>
              {w.statuses
                .filter((s) => s.projectId === values.project)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          {route !== 'mine' && (
            <Field label="Filtrar por responsable">
              <select value={values.assignee} onChange={(e) => change('assignee', e.target.value)}>
                <option value="mine-or-unassigned">Míos y sin responsable</option>
                <option value="mine">Solo míos</option>
                <option value="unassigned">Sin responsable</option>
                <option value="all">Todos los responsables</option>
                {w.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.active ? '' : ' (inactivo)'}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Filtrar por etiqueta">
            <select value={values.tag} onChange={(e) => change('tag', e.target.value)}>
              <option value="">Todas las etiquetas</option>
              {w.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Filtrar por prioridad">
            <select value={values.priority} onChange={(e) => change('priority', e.target.value)}>
              <option value="">Toda prioridad</option>
              {priorities.map((p, i) => (
                <option key={p} value={i}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          {route !== 'mine' && route !== 'archived' && (
            <Field label="Mostrar pendientes">
              <select value={values.scope} onChange={(e) => change('scope', e.target.value)}>
                <option value="open">Por resolver</option>
                <option value="all">Todos</option>
                <option value="done">Resueltos</option>
                <option value="urgent">Alta prioridad</option>
                <option value="overdue">Fuera de fecha</option>
                <option value="reported">Reportados por mí</option>
              </select>
            </Field>
          )}
          <Field label="Ordenar pendientes">
            <select value={values.sort} onChange={(e) => change('sort', e.target.value)}>
              <option value="priority">Por prioridad</option>
              <option value="due">Por fecha límite</option>
              <option value="newest">Más recientes</option>
            </select>
          </Field>
        </div>
        <div className="task-filter-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setValues({
                project: projectId,
                folder: '',
                status: '',
                assignee:
                  route === 'inbox' ? 'mine-or-unassigned' : route === 'mine' ? 'mine' : 'all',
                tag: '',
                priority: '',
                scope: 'open',
                sort: 'priority',
              })
            }
          >
            Restablecer
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary">Aplicar filtros</button>
        </div>
      </form>
    </Modal>
  );
}
