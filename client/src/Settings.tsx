import { useEffect, useState, type FormEvent } from 'react';
import {
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  LockKeyhole,
  SlidersHorizontal,
  Tags,
} from 'lucide-react';
import { api, errorMessage } from './api';
import { Badge, ErrorBox, Field, Modal } from './components';
import {
  colors,
  colorNames,
  type Folder,
  type Project,
  type Status,
  type Tag,
  type User,
  type Workspace,
} from './types';

type Entity = Partial<Project & Folder & Status & Tag & User>;
type Editor = { kind: 'projects' | 'folders' | 'statuses' | 'tags' | 'users'; value: Entity };
const names = {
  projects: 'proyecto',
  folders: 'carpeta',
  statuses: 'estado',
  tags: 'etiqueta',
  users: 'persona',
};
export function CatalogEditor({
  kind,
  value,
  projectId,
  onClose,
  onSaved,
  roles = ['Admin', 'User'],
}: Editor & {
  projectId?: string;
  roles?: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(value.name || '');
  const [description, setDescription] = useState(value.description || '');
  const [labels, setLabels] = useState(value.labels || '');
  const [color, setColor] = useState(value.color || 'purple');
  const [isDone, setDone] = useState(value.isDone || false);
  const [position, setPosition] = useState(value.position || 0);
  const [archived, setArchived] = useState(value.archived || false);
  const [email, setEmail] = useState(value.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(value.role || 'User');
  const [active, setActive] = useState(value.active ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/${kind}${value.id ? `/${value.id}` : ''}`, value.id ? 'PUT' : 'POST', {
        name,
        description,
        labels,
        color,
        isDone,
        position,
        archived,
        email,
        password: password || null,
        role,
        active,
        projectId: value.projectId || projectId,
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
      title={`${value.id ? 'Editar' : 'Crear'} ${names[kind]}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-body" onSubmit={submit}>
        <ErrorBox message={error} />
        <fieldset disabled={busy}>
          <Field label="Nombre">
            <input
              autoFocus
              required
              maxLength={kind === 'tags' ? 30 : 80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'projects' ? 'Ejemplo: PMS · Hotel' : ''}
            />
          </Field>
          {kind === 'projects' && (
            <>
              <Field
                label="Etiquetas del proyecto (opcional)"
                hint="Separadas por comas, hasta 10. Clasifican el producto; no indican su avance."
              >
                <input
                  maxLength={320}
                  value={labels}
                  onChange={(e) => setLabels(e.target.value)}
                  placeholder="PMS, CRM, POS"
                />
              </Field>
              <Field label="Descripción (opcional)">
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="¿Qué organiza este proyecto?"
                />
              </Field>
              {value.id && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(e) => setArchived(e.target.checked)}
                  />
                  Proyecto archivado
                </label>
              )}
            </>
          )}
          {['projects', 'statuses', 'tags'].includes(kind) && (
            <Field label="Color">
              <div className="color-picker">
                {colors.map((c) => (
                  <button
                    type="button"
                    key={c}
                    aria-label={colorNames[c]}
                    aria-pressed={color === c}
                    className={`color-option tone-${c} ${color === c ? 'selected' : ''}`}
                    onClick={() => setColor(c)}
                  >
                    <span />
                  </button>
                ))}
              </div>
            </Field>
          )}
          {kind === 'statuses' && (
            <>
              <Field label="Posición en el tablero">
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={position}
                  onChange={(e) => setPosition(Number(e.target.value))}
                />
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={(e) => setDone(e.target.checked)}
                />
                Este estado cuenta como resuelto
              </label>
            </>
          )}
          {kind === 'users' && (
            <>
              <Field label="Correo electrónico">
                <input
                  type="email"
                  required
                  maxLength={200}
                  disabled={!!value.id}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field
                label={value.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
                hint="Al menos 12 caracteres. La persona puede cambiarla en Ajustes."
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required={!value.id}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Rol">
                <select value={role} onChange={(e) => setRole(e.target.value as User['role'])}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r === 'Admin' ? 'Admin · gestiona usuarios y roles' : r}
                    </option>
                  ))}
                </select>
              </Field>
              {value.id && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  Cuenta activa
                </label>
              )}
            </>
          )}
          <div className="form-actions">
            {kind === 'projects' && value.id && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    !confirm(
                      `¿Eliminar el proyecto «${value.name}» y TODOS sus pendientes, carpetas y adjuntos? Las notas se conservarán sin el enlace al proyecto. Esta acción no se puede deshacer.`,
                    )
                  )
                    return;
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/projects/${value.id}`, 'DELETE');
                    await onSaved();
                    onClose();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={16} /> Eliminar proyecto
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function Settings({
  workspace: w,
  user,
  reload,
  notify,
  logout,
  initialProject,
  canOrganize = true,
}: {
  workspace: Workspace;
  user: User;
  reload: () => Promise<void>;
  notify: (s: string) => void;
  logout: () => void;
  initialProject: string;
  canOrganize?: boolean;
}) {
  const [tab, setTab] = useState(canOrganize ? 'organization' : 'account');
  const [project, setProject] = useState(
    initialProject || w.projects.find((p) => !p.archived)?.id || '',
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  useEffect(() => {
    if (project && !w.projects.some((p) => p.id === project)) setProject('');
  }, [w.projects, project]);
  const saved = async () => {
    await reload();
    notify('Configuración guardada.');
  };
  async function remove(kind: string, id: string) {
    if (
      !confirm('¿Eliminar este elemento? Solo se puede eliminar si no tiene pendientes asociados.')
    )
      return;
    setError('');
    try {
      await api(`/${kind}/${id}`, 'DELETE');
      await saved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function password(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/password', 'POST', { currentPassword, newPassword });
      notify('Contraseña actualizada. Ingresa nuevamente.');
      logout();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A TU MANERA</div>
          <h1>Ajustes</h1>
          <p>Un espacio simple, con la organización que tu equipo necesita.</p>
        </div>
      </div>
      <div className="tabs">
        {canOrganize && (
          <>
            <button
              className={tab === 'organization' ? 'active' : ''}
              onClick={() => setTab('organization')}
            >
              <SlidersHorizontal size={17} /> Organización
            </button>
          </>
        )}
        <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>
          <LockKeyhole size={17} /> Mi cuenta
        </button>
      </div>
      <ErrorBox message={error} />
      {tab === 'organization' && canOrganize && (
        <div className="settings-grid">
          <section className="card">
            <div className="section-heading">
              <h2>Proyectos y carpetas</h2>
              <button
                className="btn-icon"
                aria-label="Crear proyecto"
                onClick={() => setEditor({ kind: 'projects', value: {} })}
              >
                <Plus size={18} />
              </button>
            </div>
            <Field label="Proyecto a configurar">
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">Selecciona un proyecto</option>
                {w.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.archived ? ' (archivado)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            {project && (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    setEditor({
                      kind: 'projects',
                      value: w.projects.find((p) => p.id === project)!,
                    })
                  }
                >
                  <Pencil size={16} /> Editar proyecto
                </button>
                <div className="section-heading subsection">
                  <h3>Carpetas</h3>
                  <button
                    className="btn-icon"
                    aria-label="Crear carpeta"
                    onClick={() => setEditor({ kind: 'folders', value: {} })}
                  >
                    <FolderPlus size={18} />
                  </button>
                </div>
                {w.folders
                  .filter((f) => f.projectId === project)
                  .map((f) => (
                    <div className="settings-row" key={f.id}>
                      <span>{f.name}</span>
                      <button
                        className="btn-icon"
                        aria-label={`Editar carpeta ${f.name}`}
                        onClick={() => setEditor({ kind: 'folders', value: f })}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn-icon"
                        aria-label={`Eliminar carpeta ${f.name}`}
                        onClick={() => void remove('folders', f.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                {!w.folders.some((f) => f.projectId === project) && (
                  <p className="muted small">Agrupa pendientes por módulo, cliente o área.</p>
                )}
              </>
            )}
          </section>
          <section className="card">
            <div className="section-heading">
              <h2>Estados de los pendientes</h2>
              <button
                className="btn-icon"
                disabled={!project}
                aria-label="Crear estado"
                onClick={() =>
                  setEditor({
                    kind: 'statuses',
                    value: { position: w.statuses.filter((s) => s.projectId === project).length },
                  })
                }
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="muted small">
              Define el recorrido de cada pendiente. Marca los estados que cuentan como resueltos.
            </p>
            {w.statuses
              .filter((s) => s.projectId === project)
              .map((s) => (
                <div className="settings-row" key={s.id}>
                  <span>
                    <Badge color={s.color}>{s.name}</Badge>
                    {s.isDone && <small>Resuelto</small>}
                  </span>
                  <button
                    className="btn-icon"
                    aria-label={`Editar estado ${s.name}`}
                    onClick={() => setEditor({ kind: 'statuses', value: s })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="btn-icon"
                    aria-label={`Eliminar estado ${s.name}`}
                    onClick={() => void remove('statuses', s.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
          </section>
          <section className="card">
            <div className="section-heading">
              <h2>
                <Tags size={19} /> Etiquetas del equipo
              </h2>
              <button
                className="btn-icon"
                aria-label="Crear etiqueta"
                onClick={() => setEditor({ kind: 'tags', value: {} })}
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="muted small">
              Úsalas en cualquier proyecto para identificar bugs, mejoras o tipos de trabajo.
            </p>
            {w.tags.map((t) => (
              <div className="settings-row" key={t.id}>
                <span>
                  <Badge color={t.color}>{t.name}</Badge>
                </span>
                <button
                  className="btn-icon"
                  aria-label={`Editar etiqueta ${t.name}`}
                  onClick={() => setEditor({ kind: 'tags', value: t })}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="btn-icon"
                  aria-label={`Eliminar etiqueta ${t.name}`}
                  onClick={() => void remove('tags', t.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </section>
        </div>
      )}
      {tab === 'account' && (
        <section className="card account-card">
          <h2>{user.name}</h2>
          <p className="muted">{user.email}</p>
          <h3 className="subsection">Cambiar contraseña</h3>
          <form
            onSubmit={password}
            data-update-blocked={!!currentPassword || !!newPassword || busy}
          >
            <fieldset disabled={busy}>
              <Field label="Contraseña actual">
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </Field>
              <Field
                label="Nueva contraseña"
                hint="Al menos 12 caracteres. Se cerrarán tus sesiones abiertas."
              >
                <input
                  required
                  minLength={12}
                  maxLength={128}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNew(e.target.value)}
                />
              </Field>
              <button className="btn btn-primary">
                {busy ? 'Guardando…' : 'Cambiar contraseña'}
              </button>
            </fieldset>
          </form>
        </section>
      )}
      {editor && (
        <CatalogEditor
          {...editor}
          projectId={project}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
    </>
  );
}
