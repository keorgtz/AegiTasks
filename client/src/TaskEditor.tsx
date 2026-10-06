import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowUpRight,
  FileText,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
} from 'lucide-react';
import { api, errorMessage, getActiveSpace } from './api';
import { useChanges } from './changes';
import './styles/task-editor.css';
import { Badge, ErrorBox, Field, Modal } from './components';
import { TaskEditorFooter } from './TaskEditorFooter';
import { TaskRelations, TaskRelationPicker } from './TaskRelations';
import {
  dateLabel,
  type TaskDetail,
  type TaskItem,
  type User,
  type Workspace,
  type EstimateKind,
} from './types';

const detailTabs = [
  { id: 'general', label: 'Detalle general', icon: FileText },
  { id: 'evidence', label: 'Evidencias', icon: Paperclip },
  { id: 'activity', label: 'Conversación y actividad', icon: MessageSquare },
] as const;
type DetailTab = (typeof detailTabs)[number]['id'];

export type Draft = {
  title: string;
  description: string;
  projectId: string;
  folderId: string;
  moduleId: string;
  cycleId: string;
  parentTaskId: string;
  parentTitle: string;
  statusId: string;
  assigneeId: string;
  priority: string;
  dueDate: string;
  estimateMinutes: string;
  estimateKind: EstimateKind;
  estimatePoints: string;
  estimateCategory: string;
  tagIds: string[];
};
export function TaskEditor({
  id,
  projectId,
  folderId,
  moduleId = '',
  cycleId = '',
  parentTask,
  workspace: w,
  user,
  onClose,
  onSaved,
  onDeleted,
  notify,
  onNavigate,
  onCreateChild,
}: {
  id?: string;
  projectId: string;
  folderId: string;
  moduleId?: string;
  cycleId?: string;
  parentTask?: TaskItem | null;
  workspace: Workspace;
  user: User;
  onClose: () => void;
  onSaved: (task: TaskItem) => void;
  onDeleted: () => void;
  notify: (text: string) => void;
  onNavigate: (id: string) => void;
  onCreateChild: (parent: TaskItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>('general');
  const tabsId = useId();
  const formId = useId();
  const [parentPicker, setParentPicker] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const selectTab = (tab: DetailTab) => {
    setActiveTab(tab);
    body.current?.scrollTo({ top: 0 });
  };
  const draftKey = `aegitasks-draft-${user.id}-${getActiveSpace()}${parentTask ? `-child-${parentTask.id}` : ''}`;
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    if (!id) {
      try {
        const stored = JSON.parse(localStorage.getItem(draftKey) || 'null') as Draft | null;
        if (stored && w.projects.some((p) => p.id === stored.projectId && !p.archived))
          return {
            ...stored,
            moduleId: stored.moduleId || '',
            cycleId: stored.cycleId || '',
            parentTaskId: stored.parentTaskId || '',
            parentTitle: stored.parentTitle || '',
            estimateKind: stored.estimateKind || 'time',
            estimatePoints: stored.estimatePoints || '',
            estimateCategory: stored.estimateCategory || '',
          };
      } catch {
        /* Ignore a corrupt local draft. */
      }
    }
    const p = parentTask?.projectId || projectId || w.projects.find((p) => !p.archived)?.id || '';
    return {
      title: '',
      description: '',
      projectId: p,
      folderId: parentTask?.folderId || folderId,
      moduleId: parentTask?.moduleId || moduleId,
      cycleId: parentTask?.cycleId || cycleId,
      parentTaskId: parentTask?.id || '',
      parentTitle: parentTask?.title || '',
      statusId: w.statuses.find((s) => s.projectId === p && !s.isDone)?.id || '',
      assigneeId: '',
      priority: '',
      dueDate: '',
      estimateMinutes: '',
      estimateKind: w.projects.find((project) => project.id === p)?.estimateScheme || 'time',
      estimatePoints: '',
      estimateCategory: '',
      tagIds: [],
    };
  });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [remoteChange, setRemoteChange] = useState(false);
  useChanges(['tasks'], () => {
    if (!id || !detail) return;
    void api<TaskDetail>(`/tasks/${id}`)
      .then((latest) => {
        setRemoteChange(latest.item.version !== detail.item.version);
        setDetail((previous) => (previous ? { ...latest, item: previous.item } : latest));
      })
      .catch(() => setRemoteChange(true));
  });
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };
  useEffect(() => {
    if (!id && dirty) {
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        /* Saving to the server is still available. */
      }
    }
  }, [draft, dirty, draftKey, id]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    api<TaskDetail>(`/tasks/${id}`, 'GET', undefined, controller.signal)
      .then((d) => {
        setDetail(d);
        const t = d.item;
        setDraft({
          title: t.title,
          description: t.description,
          projectId: t.projectId,
          folderId: t.folderId || '',
          moduleId: t.moduleId || '',
          cycleId: t.cycleId || '',
          parentTaskId: t.parentTaskId || '',
          parentTitle: d.parent?.title || '',
          statusId: t.statusId,
          assigneeId: t.assigneeId || '',
          priority: t.priority?.toString() || '',
          dueDate: t.dueDate || '',
          estimateMinutes: t.estimateMinutes?.toString() || '',
          estimateKind: t.estimateKind || 'time',
          estimatePoints: t.estimatePoints?.toString() || '',
          estimateCategory: t.estimateCategory || '',
          tagIds: t.tags.map((t) => t.id),
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [id]);
  const close = () => {
    if (busy) return;
    if (
      id &&
      (dirty || comment.trim()) &&
      !confirm('Hay cambios sin guardar. ¿Cerrar el pendiente?')
    )
      return;
    onClose();
  };
  async function refreshActivity() {
    const latest = await api<TaskDetail>(`/tasks/${id}`);
    // Do not advance the edit version while the user is editing an older snapshot.
    setDetail((previous) => (previous ? { ...latest, item: previous.item } : latest));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const task = await api<TaskItem>(id ? `/tasks/${id}` : '/tasks', id ? 'PUT' : 'POST', {
        ...draft,
        folderId: draft.folderId || null,
        assigneeId: draft.assigneeId || null,
        priority: draft.priority ? Number(draft.priority) : null,
        dueDate: draft.dueDate || null,
        estimateMinutes: draft.estimateMinutes ? Number(draft.estimateMinutes) : null,
        planning: {
          moduleId: draft.moduleId || null,
          cycleId: draft.cycleId || null,
          estimateKind: draft.estimateKind,
          estimatePoints: draft.estimatePoints !== '' ? Number(draft.estimatePoints) : null,
          estimateCategory: draft.estimateCategory || null,
        },
        hierarchy: { parentTaskId: draft.parentTaskId || null },
        version: detail?.item.version,
      });
      setDirty(false);
      setRemoteChange(false);
      if (!id) localStorage.removeItem(draftKey);
      notify(id ? 'Cambios guardados.' : 'Pendiente creado. Ya puedes adjuntar evidencias.');
      onSaved(task);
      if (id) setDetail(await api<TaskDetail>(`/tasks/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function addComment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/tasks/${id}/comments`, 'POST', { body: comment });
      setComment('');
      await refreshActivity();
      notify('Comentario publicado.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      await api(`/tasks/${id}/attachments`, 'POST', form);
      await refreshActivity();
      notify('Evidencia adjuntada.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (dirty || comment.trim()) {
      setError('Guarda los cambios y publica el comentario antes de archivar o restaurar.');
      return;
    }
    if (
      !detail ||
      !confirm(
        detail.item.archived
          ? '¿Restaurar este pendiente?'
          : '¿Archivar este pendiente? Podrás recuperarlo desde Archivados.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const t = await api<TaskItem>(`/tasks/${id}/archive`, 'POST', {
        archived: !detail.item.archived,
        version: detail.item.version,
      });
      notify(t.archived ? 'Pendiente archivado.' : 'Pendiente restaurado.');
      onSaved(t);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !detail ||
      !confirm(
        `¿Eliminar «${detail.item.title}» y sus comentarios y adjuntos? No se puede deshacer. Las notas y subpendientes se conservarán; los hijos quedan sin padre.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/tasks/${id}?version=${encodeURIComponent(detail.item.version)}`, 'DELETE');
      notify('Pendiente eliminado.');
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const canLeave = () =>
    !busy &&
    (!(dirty || comment.trim()) || confirm('Hay cambios sin guardar. ¿Salir de este pendiente?'));
  const openRelated = (taskId: string) => {
    if (canLeave()) onNavigate(taskId);
  };
  const createChild = () => {
    if (detail && canLeave()) onCreateChild(detail.item);
  };
  return (
    <Modal title={id ? 'Detalle del pendiente' : '¿Qué encontraste?'} onClose={close} wide>
      {id && (
        <div className="tabs task-detail-tabs" role="tablist" aria-label="Secciones del pendiente">
          {detailTabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${tabsId}-${tab.id}-tab`}
              aria-controls={`${tabsId}-${tab.id}-panel`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(e) => {
                const next =
                  e.key === 'ArrowRight'
                    ? (index + 1) % detailTabs.length
                    : e.key === 'ArrowLeft'
                      ? (index + detailTabs.length - 1) % detailTabs.length
                      : e.key === 'Home'
                        ? 0
                        : e.key === 'End'
                          ? detailTabs.length - 1
                          : null;
                if (next === null) return;
                e.preventDefault();
                const nextTab = detailTabs[next]!;
                selectTab(nextTab.id);
                document.getElementById(`${tabsId}-${nextTab.id}-tab`)?.focus();
              }}
            >
              <tab.icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="modal-body task-detail-body" ref={body}>
        <ErrorBox message={error} />
        {remoteChange && (
          <p className="small" role="status">
            Este pendiente cambió o fue eliminado en otra sesión. Tu borrador se conserva; vuelve a
            abrirlo para consultar la versión actual.
          </p>
        )}
        {id && !detail ? (
          <p className="muted">
            {error
              ? 'Cierra y vuelve a abrir el pendiente para reintentar.'
              : 'Cargando pendiente…'}
          </p>
        ) : (
          <>
            {!id && (
              <p className="form-intro">
                Cuéntalo con tus palabras. No necesitas saber cómo resolverlo.
              </p>
            )}
            <section
              className="task-detail-panel"
              role={id ? 'tabpanel' : undefined}
              id={`${tabsId}-general-panel`}
              aria-labelledby={id ? `${tabsId}-general-tab` : undefined}
              tabIndex={id ? 0 : undefined}
              hidden={!!id && activeTab !== 'general'}
            >
              {detail && (
                <div className="detail-meta">
                  <Badge color="purple">#{detail.item.id.slice(0, 8).toUpperCase()}</Badge>
                  <span>
                    Creado por {w.users.find((u) => u.id === detail.item.createdById)?.name} ·{' '}
                    {dateLabel(detail.item.createdAt)}
                  </span>
                  {detail.item.archived && <Badge>Archivado</Badge>}
                </div>
              )}
              <form id={formId} onSubmit={save}>
                <fieldset disabled={busy}>
                  <Field
                    label="Título"
                    hint="Ejemplo: La pantalla se queda en blanco al guardar una reserva."
                  >
                    <input
                      autoFocus={!id}
                      required
                      maxLength={200}
                      value={draft.title}
                      onChange={(e) => update('title', e.target.value)}
                      placeholder="Describe el pendiente en una frase"
                    />
                  </Field>
                  <Field label="Descripción (opcional)">
                    <textarea
                      rows={4}
                      maxLength={12000}
                      value={draft.description}
                      onChange={(e) => update('description', e.target.value)}
                      placeholder="¿Qué estabas haciendo? ¿Qué pasó y qué esperabas que pasara?"
                    />
                  </Field>
                </fieldset>
              </form>
              {detail && (
                <TaskRelations
                  detail={detail}
                  workspace={w}
                  disabled={
                    busy ||
                    !!detail.item.archived ||
                    !!w.projects.find((p) => p.id === detail.item.projectId)?.archived
                  }
                  onOpen={openRelated}
                  onCreate={createChild}
                  onChanged={refreshActivity}
                />
              )}
              {detail && (
                <div className="task-management-actions">
                  <button
                    className="btn btn-ghost archive-action"
                    disabled={busy}
                    onClick={() => void archive()}
                  >
                    <Archive size={17} />
                    {detail.item.archived ? 'Restaurar pendiente' : 'Archivar pendiente'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    <Trash2 size={16} /> Eliminar pendiente
                  </button>
                </div>
              )}
            </section>
            {detail && (
              <>
                <section
                  className="detail-section task-detail-panel"
                  role="tabpanel"
                  id={`${tabsId}-evidence-panel`}
                  aria-labelledby={`${tabsId}-evidence-tab`}
                  tabIndex={0}
                  hidden={activeTab !== 'evidence'}
                >
                  <div className="section-heading">
                    <h3>
                      <Paperclip size={18} /> Evidencias
                    </h3>
                    <label className={`btn btn-ghost upload ${busy ? 'disabled' : ''}`}>
                      Adjuntar archivo
                      <input
                        type="file"
                        aria-label="Adjuntar evidencia"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void upload(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <p className="muted small">
                    Capturas PNG, JPG, WebP o PDF. Hasta 10 MB por archivo.
                  </p>
                  {!detail.attachments.length && (
                    <p className="task-evidence-empty">
                      Todavía no hay evidencias. Adjunta una captura o un documento para explicar el
                      pendiente.
                    </p>
                  )}
                  <div className="attachment-list">
                    {detail.attachments.map((a) => (
                      <a
                        href={`/api/attachments/${a.id}?space=${getActiveSpace()}`}
                        key={a.id}
                        className="attachment"
                      >
                        <Paperclip size={17} />
                        <span>
                          {a.name}
                          <small>{(a.size / 1024).toFixed(0)} KB</small>
                        </span>
                        <ArrowUpRight size={16} />
                      </a>
                    ))}
                  </div>
                </section>
                <section
                  className="detail-section task-detail-panel"
                  role="tabpanel"
                  id={`${tabsId}-activity-panel`}
                  aria-labelledby={`${tabsId}-activity-tab`}
                  tabIndex={0}
                  hidden={activeTab !== 'activity'}
                >
                  <h3>
                    <MessageSquare size={18} /> Conversación y actividad
                  </h3>
                  <div className="activity-list">
                    {detail.activities.map((a) => (
                      <article key={a.id} className={`activity ${a.kind}`}>
                        <div className="activity-dot" />
                        <div>
                          <div className="activity-by">
                            <strong>
                              {w.users.find((u) => u.id === a.userId)?.name || 'Usuario'}
                            </strong>
                            <time>
                              {new Date(a.createdAt).toLocaleString('es-MX', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </time>
                          </div>
                          <p>{a.body}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                  <form onSubmit={addComment} className="comment-form">
                    <Field label="Agregar comentario">
                      <textarea
                        rows={2}
                        disabled={busy}
                        required
                        maxLength={4000}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Comparte más detalles o una actualización…"
                      />
                    </Field>
                    <button className="btn btn-ghost" disabled={busy || !comment.trim()}>
                      <Send size={16} /> Comentar
                    </button>
                  </form>
                </section>
              </>
            )}
          </>
        )}
      </div>

      <TaskEditorFooter
        draft={draft}
        workspace={w}
        update={update}
        setDraft={setDraft}
        setDirty={setDirty}
        disabled={busy || (!!id && !detail)}
        busy={busy}
        dirty={dirty}
        existing={!!id}
        onParent={() => setParentPicker(true)}
        onSave={() => {
          const form = document.getElementById(formId) as HTMLFormElement;
          if (!form.checkValidity()) {
            selectTab('general');
            requestAnimationFrame(() => form.reportValidity());
          } else form.requestSubmit();
        }}
      />
      {parentPicker && (
        <TaskRelationPicker
          projectId={draft.projectId}
          excludeId={detail?.item.projectId === draft.projectId ? id : undefined}
          relation="parent"
          onClose={() => setParentPicker(false)}
          onSelect={(task) => {
            setDraft((d) => ({
              ...d,
              parentTaskId: task?.id || '',
              parentTitle: task?.title || '',
            }));
            setDirty(true);
            setParentPicker(false);
          }}
        />
      )}
    </Modal>
  );
}
