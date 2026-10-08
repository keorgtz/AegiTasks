import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  CalendarDays,
  BellRing,
  Clock3,
  FolderKanban,
  GitBranch,
  Layers3,
  SlidersHorizontal,
  Tags,
} from 'lucide-react';
import { Field, Modal } from './components';
import { estimateKinds, fibonacciPoints, linearPoints, estimateCategories } from './estimates';
import { dateLabel, priorities, type Workspace, type EstimateKind } from './types';
import type { Draft } from './TaskEditor';
type Property = 'all' | 'project' | 'tags' | 'priority' | 'due' | 'estimate' | 'organization';
type Props = {
  draft: Draft;
  workspace: Workspace;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  setDraft: Dispatch<SetStateAction<Draft>>;
  setDirty: (value: boolean) => void;
  disabled: boolean;
  busy: boolean;
  dirty: boolean;
  existing: boolean;
  onSave: () => void;
  onParent: () => void;
  onReminders?: () => void;
};
export function TaskEditorFooter({
  draft,
  workspace: w,
  update,
  setDraft,
  setDirty,
  disabled,
  busy,
  dirty,
  existing,
  onSave,
  onParent,
  onReminders,
}: Props) {
  const [property, setProperty] = useState<Property | null>(null);
  const value =
    draft.estimateKind === 'time'
      ? draft.estimateMinutes
      : draft.estimateKind === 'categories'
        ? draft.estimateCategory
        : draft.estimatePoints;
  const estimateLabel =
    draft.estimateKind === 'none'
      ? 'Sin estimación'
      : value !== ''
        ? value +
          (draft.estimateKind === 'time'
            ? ' min'
            : draft.estimateKind === 'categories'
              ? ''
              : ' pts')
        : 'Estimación';
  const projectField = (
    <>
      {' '}
      <Field label="Proyecto">
        <select
          required
          value={draft.projectId}
          onChange={(e) => {
            const p = e.target.value;
            setDraft((d) => ({
              ...d,
              projectId: p,
              folderId: '',
              parentTaskId: '',
              parentTitle: '',
              moduleId: '',
              cycleId: '',
              estimateKind:
                w.projects.find((project) => project.id === p)?.estimateScheme || 'time',
              estimateMinutes: '',
              estimatePoints: '',
              estimateCategory: '',
              statusId: w.statuses.find((s) => s.projectId === p && !s.isDone)?.id || '',
            }));
            setDirty(true);
          }}
        >
          <option value="" disabled>
            Selecciona un proyecto
          </option>
          {w.projects
            .filter((p) => !p.archived || p.id === draft.projectId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? ' (archivado)' : ''}
              </option>
            ))}
        </select>
      </Field>
    </>
  );
  const tagsField = (
    <>
      {' '}
      <div className="field">
        <span>Etiquetas (opcional)</span>
        <div className="tag-picker">
          {w.tags.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`tag-option tone-${t.color} ${draft.tagIds.includes(t.id) ? 'selected' : ''}`}
              aria-pressed={draft.tagIds.includes(t.id)}
              onClick={() =>
                update(
                  'tagIds',
                  draft.tagIds.includes(t.id)
                    ? draft.tagIds.filter((x) => x !== t.id)
                    : [...draft.tagIds, t.id],
                )
              }
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </>
  );
  const organizationFields = (
    <>
      <Field label="Carpeta">
        <select value={draft.folderId} onChange={(e) => update('folderId', e.target.value)}>
          <option value="">Sin carpeta</option>
          {w.folders
            .filter((f) => f.projectId === draft.projectId)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Módulo (opcional)">
        <select value={draft.moduleId} onChange={(e) => update('moduleId', e.target.value)}>
          <option value="">Sin módulo</option>
          {w.modules
            .filter((m) => m.projectId === draft.projectId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Ciclo (opcional)">
        <select value={draft.cycleId} onChange={(e) => update('cycleId', e.target.value)}>
          <option value="">Sin ciclo</option>
          {w.cycles
            .filter((m) => m.projectId === draft.projectId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </Field>
    </>
  );
  const priorityField = (
    <>
      <Field label="Prioridad">
        <select value={draft.priority} onChange={(e) => update('priority', e.target.value)}>
          {priorities.map((p, i) => (
            <option key={p} value={i || ''}>
              {p}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
  const dueField = (
    <>
      <Field label="Fecha límite (opcional)">
        <div className="input-icon">
          <CalendarDays size={18} />
          <input
            type="date"
            value={draft.dueDate}
            onChange={(e) => update('dueDate', e.target.value)}
          />
        </div>
      </Field>
    </>
  );
  const estimateFields = (
    <>
      <Field
        label="Tipo de estimación"
        hint="Opcional. Los puntos representan esfuerzo relativo; no se convierten a horas."
      >
        <select
          value={draft.estimateKind}
          onChange={(e) => {
            setDraft((d) => ({
              ...d,
              estimateKind: e.target.value as EstimateKind,
              estimateMinutes: '',
              estimatePoints: '',
              estimateCategory: '',
            }));
            setDirty(true);
          }}
        >
          {Object.entries(estimateKinds).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {draft.estimateKind === 'time' && (
        <Field label="Estimación en minutos (opcional)">
          <div className="input-icon">
            <Clock3 size={18} />
            <input
              type="number"
              min="1"
              max="600000"
              value={draft.estimateMinutes}
              onChange={(e) => update('estimateMinutes', e.target.value)}
              placeholder="Sin estimación"
            />
          </div>
        </Field>
      )}
      {draft.estimateKind === 'points' && (
        <Field label="Story points (opcional)">
          <input
            type="number"
            min={0}
            max={1000}
            step={1}
            value={draft.estimatePoints}
            onChange={(e) => update('estimatePoints', e.target.value)}
            placeholder="Sin estimación"
          />
        </Field>
      )}
      {['fibonacci', 'linear'].includes(draft.estimateKind) && (
        <Field label="Puntos (opcional)">
          <select
            value={draft.estimatePoints}
            onChange={(e) => update('estimatePoints', e.target.value)}
          >
            <option value="">Sin estimación</option>
            {(draft.estimateKind === 'fibonacci' ? fibonacciPoints : linearPoints).map((n) => (
              <option key={n} value={n}>
                {n} puntos
              </option>
            ))}
          </select>
        </Field>
      )}
      {draft.estimateKind === 'categories' && (
        <Field label="Categoría (opcional)">
          <select
            value={draft.estimateCategory}
            onChange={(e) => update('estimateCategory', e.target.value)}
          >
            <option value="">Sin estimación</option>
            {estimateCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
  return (
    <footer
      className="task-editor-footer"
      aria-label="Propiedades del pendiente"
      data-update-blocked={dirty || busy}
    >
      <fieldset disabled={disabled}>
        <div className="task-property-bar">
          <div className="task-property-direct">
            <Field label="Estado">
              <select value={draft.statusId} onChange={(e) => update('statusId', e.target.value)}>
                {w.statuses
                  .filter((s) => s.projectId === draft.projectId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <div className="task-property-direct">
            <Field label="Responsable">
              <select
                value={draft.assigneeId}
                onChange={(e) => update('assigneeId', e.target.value)}
              >
                <option value="">Sin asignar</option>
                {w.users
                  .filter((u) => u.active || u.id === draft.assigneeId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.active ? '' : ' (inactivo)'}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <button
            type="button"
            className="task-property-chip task-property-secondary"
            onClick={() => setProperty('project')}
            aria-label="Cambiar proyecto"
            title="Proyecto"
          >
            <FolderKanban size={15} />
            <span>{w.projects.find((p) => p.id === draft.projectId)?.name || 'Proyecto'}</span>
          </button>
          <button
            type="button"
            className="task-property-chip task-property-secondary"
            onClick={() => setProperty('priority')}
            aria-label="Cambiar prioridad"
          >
            <SlidersHorizontal size={15} />
            <span>{priorities[Number(draft.priority) || 0]}</span>
          </button>
          <button
            type="button"
            className="task-property-chip task-property-secondary"
            onClick={() => setProperty('tags')}
            aria-label="Elegir etiquetas"
          >
            <Tags size={15} />
            <span>{draft.tagIds.length ? draft.tagIds.length + ' etiquetas' : 'Etiquetas'}</span>
          </button>
          <button
            type="button"
            className="task-property-chip task-property-secondary"
            onClick={() => setProperty('due')}
            aria-label="Cambiar fecha límite"
          >
            <CalendarDays size={15} />
            <span>{draft.dueDate ? dateLabel(draft.dueDate) : 'Fecha límite'}</span>
          </button>
          <button
            type="button"
            className="task-property-chip task-property-secondary"
            onClick={() => setProperty('estimate')}
            aria-label="Cambiar estimación"
          >
            <Clock3 size={15} />
            <span>{estimateLabel}</span>
          </button>
          <button
            type="button"
            className="task-property-chip task-property-secondary"
            onClick={() => setProperty('organization')}
            aria-label="Organizar pendiente"
          >
            <Layers3 size={15} />
            <span>
              {[draft.folderId && 'Carpeta', draft.moduleId && 'Módulo', draft.cycleId && 'Ciclo']
                .filter(Boolean)
                .join(' · ') || 'Organizar'}
            </span>
          </button>
          <button
            type="button"
            className="task-property-chip task-property-more"
            onClick={() => setProperty('all')}
            aria-label="Más propiedades del pendiente"
          >
            <SlidersHorizontal size={15} />
            <span>Más propiedades</span>
          </button>
          <button
            type="button"
            className="task-property-chip"
            onClick={onParent}
            aria-label="Elegir pendiente padre"
            title={draft.parentTitle || 'Agregar padre'}
          >
            <GitBranch size={15} />
            <span>
              {draft.parentTaskId ? draft.parentTitle || 'Padre seleccionado' : 'Agregar padre'}
            </span>
          </button>
          {onReminders && (
            <button
              type="button"
              className="task-property-chip"
              onClick={onReminders}
              aria-label="Recordatorios del pendiente"
            >
              <BellRing size={15} />
              <span>Recordatorios</span>
            </button>
          )}
        </div>
        <div className="task-editor-save">
          <small className="muted">
            {!existing
              ? 'Borrador local'
              : dirty
                ? 'Hay cambios sin guardar.'
                : 'Todos los cambios están guardados.'}
          </small>
          <button type="button" className="btn btn-primary" onClick={onSave}>
            {busy ? 'Guardando…' : existing ? 'Guardar cambios' : 'Crear pendiente'}
          </button>
        </div>
      </fieldset>
      {property && (
        <Modal title="Propiedades del pendiente" onClose={() => setProperty(null)}>
          <div className="modal-body task-property-dialog" data-update-blocked={true}>
            <fieldset disabled={disabled}>
              {(property === 'all' || property === 'project') && projectField}
              {(property === 'all' || property === 'tags') && tagsField}
              {(property === 'all' || property === 'priority') && priorityField}
              {(property === 'all' || property === 'due') && dueField}
              {(property === 'all' || property === 'organization') && organizationFields}
              {(property === 'all' || property === 'estimate') && estimateFields}
              <p className="muted small">Los cambios se guardan con el pendiente.</p>
              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={() => setProperty(null)}>
                  Listo
                </button>
              </div>
            </fieldset>
          </div>
        </Modal>
      )}
    </footer>
  );
}
