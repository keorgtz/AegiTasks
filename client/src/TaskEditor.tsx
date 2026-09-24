import { useEffect, useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
} from 'lucide-react';
import { api, errorMessage, getActiveSpace } from './api';
import { useChanges } from './changes';
import { Badge, ErrorBox, Field, Modal } from './components';
import {
  dateLabel,
  priorities,
  type TaskDetail,
  type TaskItem,
  type User,
  type Workspace,
} from './types';

type Draft = {
  title: string;
  description: string;
  projectId: string;
  folderId: string;
  statusId: string;
  assigneeId: string;
  priority: string;
  dueDate: string;
  estimateMinutes: string;
  tagIds: string[];
};
export function TaskEditor({
  id,
  projectId,
  folderId,
  workspace: w,
  user,
  onClose,
  onSaved,
  onDeleted,
  notify,
}: {
  id?: string;
  projectId: string;
  folderId: string;
  workspace: Workspace;
  user: User;
  onClose: () => void;
  onSaved: (task: TaskItem) => void;
  onDeleted: () => void;
  notify: (text: string) => void;
}) {
  const draftKey = `aegitasks-draft-${user.id}-${getActiveSpace()}`;
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    if (!id) {
      try {
        const stored = JSON.parse(localStorage.getItem(draftKey) || 'null') as Draft | null;
        if (stored && w.projects.some((p) => p.id === stored.projectId && !p.archived))
          return stored;
      } catch {
        /* Ignore a corrupt local draft. */
      }
    }
    const p = projectId || w.projects.find((p) => !p.archived)?.id || '';
    return {
      title: '',
      description: '',
      projectId: p,
      folderId,
      statusId: w.statuses.find((s) => s.projectId === p && !s.isDone)?.id || '',
      assigneeId: '',
      priority: '',
      dueDate: '',
      estimateMinutes: '',
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
          statusId: t.statusId,
          assigneeId: t.assigneeId || '',
          priority: t.priority?.toString() || '',
          dueDate: t.dueDate || '',
          estimateMinutes: t.estimateMinutes?.toString() || '',
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
        `¿Eliminar «${detail.item.title}» y sus comentarios y adjuntos? No se puede deshacer. Las notas vinculadas se conservarán.`,
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
  return (
    <Modal title={id ? 'Detalle del pendiente' : '¿Qué encontraste?'} onClose={close} wide>
      <div className="modal-body">
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
            <form onSubmit={save}>
              <fieldset disabled={busy}>
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
                <details className="advanced" open={id ? true : undefined}>
                  <summary>
                    Organización y planificación <span>Opcional</span>
                  </summary>
                  <div className="form-grid">
                    <Field label="Estado">
                      <select
                        value={draft.statusId}
                        onChange={(e) => update('statusId', e.target.value)}
                      >
                        {w.statuses
                          .filter((s) => s.projectId === draft.projectId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Carpeta">
                      <select
                        value={draft.folderId}
                        onChange={(e) => update('folderId', e.target.value)}
                      >
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
                    <Field label="Prioridad">
                      <select
                        value={draft.priority}
                        onChange={(e) => update('priority', e.target.value)}
                      >
                        {priorities.map((p, i) => (
                          <option key={p} value={i || ''}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </Field>
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
                  </div>
                </details>
                <div className="form-actions">
                  <small className="muted">
                    {!id
                      ? 'El texto se conserva como borrador en este dispositivo.'
                      : dirty
                        ? 'Hay cambios sin guardar.'
                        : 'Todos los cambios están guardados.'}
                  </small>
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear pendiente'}
                  </button>
                </div>
              </fieldset>
            </form>
            {detail && (
              <>
                <section className="detail-section">
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
                <section className="detail-section">
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
                <>
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
                </>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
