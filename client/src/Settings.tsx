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
import { Badge, ColorSwatches, ErrorBox, Field, Modal } from './components';
import { estimateKinds } from './estimates';
import { AccountProfile } from './AccountProfile';
import { PasswordStrength } from './PasswordStrength';
import {
  type Folder,
  type Project,
  type Status,
  type Tag,
  type User,
  type Workspace,
  type EstimateKind,
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
  const [estimateScheme, setEstimateScheme] = useState<EstimateKind>(
    value.estimateScheme || 'time',
  );
  const [color, setColor] = useState(value.color || 'purple');
  const [isDone, setDone] = useState(value.isDone || false);
  const [position, setPosition] = useState(value.position || 0);
  const [archived, setArchived] = useState(value.archived || false);
  const [email, setEmail] = useState(value.email || '');
  const [username, setUsername] = useState(value.username || '');
  const [password, setPassword] = useState('');
  const [changePassword, setChangePassword] = useState(!value.id);
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
        ...(kind === 'projects' ? { estimateScheme } : {}),
        color,
        isDone,
        position,
        archived,
        email,
        ...(kind === 'users' ? { username } : {}),
        password: changePassword ? password : null,
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
              <Field
                label="Estimación predeterminada"
                hint="Sugiere una escala en los nuevos pendientes. Cada pendiente puede cambiarla o quedar sin estimación; los existentes se conservan."
              >
                <select
                  value={estimateScheme}
                  onChange={(e) => setEstimateScheme(e.target.value as EstimateKind)}
                >
                  {Object.entries(estimateKinds).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
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
            <ColorSwatches value={color} onChange={setColor} />
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
              <Field
                label="Nombre de usuario"
                hint="Único, de 3 a 40 caracteres: letras sin acentos, números, puntos, guiones o guiones bajos. Se puede usar para iniciar sesión."
              >
                <input
                  required
                  minLength={3}
                  maxLength={40}
                  pattern={'[a-zA-Z0-9][a-zA-Z0-9._\\-]{2,39}'}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field label="Correo electrónico">
                <input
                  type="email"
                  required
                  maxLength={200}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {value.id && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={changePassword}
                    onChange={(e) => setChangePassword(e.target.checked)}
                  />
                  Cambiar contraseña
                </label>
              )}
              {changePassword && (
                <>
                  <Field
                    label={value.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
                    hint="Puedes dejarla vacía o elegir cualquier longitud. La persona puede cambiarla en Ajustes."
                  >
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  <PasswordStrength password={password} context={[name, username, email]} />
                </>
              )}
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
  spaceName = 'este espacio',
  canOrganize = true,
  mode,
  onUserUpdated,
}: {
  workspace: Workspace;
  user: User;
  reload: () => Promise<void>;
  notify: (s: string) => void;
  logout: () => void;
  initialProject: string;
  spaceName?: string;
  canOrganize?: boolean;
  mode?: 'organization' | 'account';
  onUserUpdated: (user: User) => void;
}) {
  const [selectedTab, setTab] = useState(canOrganize ? 'organization' : 'account');
  const tab = mode || selectedTab;
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
          <div className="eyebrow">
            {mode === 'account' ? 'PREFERENCIAS PERSONALES' : 'ORGANIZACIÓN DEL EQUIPO'}
          </div>
          <h1>{mode === 'account' ? 'Mi cuenta' : 'Ajustes'}</h1>
          <p>
            {mode === 'account'
              ? 'Actualiza tu cuenta y protege el acceso a tu información.'
              : `Configura proyectos y pendientes de ${spaceName}.`}
          </p>
        </div>
      </div>
      {!mode && (
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
      )}
      {tab === 'organization' && !canOrganize && (
        <p className="card">
          Tu rol no tiene permiso para administrar la organización de proyectos.
        </p>
      )}
      <ErrorBox message={error} />
      {tab === 'organization' && canOrganize && (
        <div className="settings-organization">
          <section className="card settings-project-context">
            <div className="settings-panel-heading">
              <span className="settings-panel-icon">
                <SlidersHorizontal size={23} />
              </span>
              <div>
                <h2>Proyecto a configurar</h2>
                <p>Carpetas y estados pertenecen al proyecto que selecciones.</p>
              </div>
            </div>
            <div className="settings-project-picker">
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
              <div className="settings-inline-actions">
                {project && (
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
                )}
                <button
                  className="btn btn-primary"
                  aria-label="Crear proyecto"
                  onClick={() => setEditor({ kind: 'projects', value: {} })}
                >
                  <Plus size={17} /> Nuevo proyecto
                </button>
              </div>
            </div>
          </section>
          <div className="settings-grid settings-catalogs">
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>Carpetas</h2>
                  <p className="muted">Agrupaciones simples dentro del proyecto.</p>
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={!project}
                  aria-label="Crear carpeta"
                  onClick={() => setEditor({ kind: 'folders', value: {} })}
                >
                  <FolderPlus size={17} /> Agregar
                </button>
              </div>
              {project ? (
                w.folders
                  .filter((f) => f.projectId === project)
                  .map((f) => (
                    <div className="settings-row" key={f.id}>
                      <span>{f.name}</span>
                      <button
                        className="btn-icon"
                        aria-label={`Editar carpeta ${f.name}`}
                        onClick={() => setEditor({ kind: 'folders', value: f })}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="btn-icon"
                        aria-label={`Eliminar carpeta ${f.name}`}
                        onClick={() => void remove('folders', f.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
              ) : (
                <p className="settings-empty">
                  Selecciona un proyecto para gestionar sus carpetas.
                </p>
              )}
              {project && !w.folders.some((f) => f.projectId === project) && (
                <p className="settings-empty">
                  Este proyecto todavía no tiene carpetas. Puedes agregar la primera cuando la
                  necesites.
                </p>
              )}
            </section>
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>Estados de los pendientes</h2>
                  <p className="muted">Define su recorrido y qué cuenta como resuelto.</p>
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={!project}
                  aria-label="Crear estado"
                  onClick={() =>
                    setEditor({
                      kind: 'statuses',
                      value: { position: w.statuses.filter((s) => s.projectId === project).length },
                    })
                  }
                >
                  <Plus size={17} /> Agregar
                </button>
              </div>
              {project ? (
                w.statuses
                  .filter((s) => s.projectId === project)
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <div className="settings-row" key={s.id}>
                      <span>
                        <Badge color={s.color}>{s.name}</Badge>
                        {s.isDone && <small>Cuenta como resuelto</small>}
                      </span>
                      <button
                        className="btn-icon"
                        aria-label={`Editar estado ${s.name}`}
                        onClick={() => setEditor({ kind: 'statuses', value: s })}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="btn-icon"
                        aria-label={`Eliminar estado ${s.name}`}
                        onClick={() => void remove('statuses', s.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
              ) : (
                <p className="settings-empty">Selecciona un proyecto para gestionar sus estados.</p>
              )}
            </section>
          </div>
          <section className="card settings-team-labels">
            <div className="section-heading">
              <div>
                <h2>
                  <Tags size={20} /> Etiquetas del equipo
                </h2>
                <p className="muted">Se comparten entre todos los proyectos de {spaceName}.</p>
              </div>
              <button
                className="btn btn-ghost"
                aria-label="Crear etiqueta"
                onClick={() => setEditor({ kind: 'tags', value: {} })}
              >
                <Plus size={17} /> Agregar
              </button>
            </div>
            <div className="settings-label-grid">
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
                    <Pencil size={16} />
                  </button>
                  <button
                    className="btn-icon"
                    aria-label={`Eliminar etiqueta ${t.name}`}
                    onClick={() => void remove('tags', t.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {!w.tags.length && (
              <p className="settings-empty">
                Agrega etiquetas para identificar bugs, mejoras o tipos de trabajo.
              </p>
            )}
          </section>
        </div>
      )}
      {tab === 'account' && (
        <div className="settings-account-grid">
          <AccountProfile user={user} onSaved={onUserUpdated} notify={notify} />
          <section className="card account-card">
            <h2>Seguridad</h2>
            <p className="muted">Cambia tu contraseña para proteger tus sesiones.</p>
            <h3 className="subsection">Cambiar contraseña</h3>
            <form
              onSubmit={password}
              data-update-blocked={!!currentPassword || !!newPassword || busy}
            >
              <fieldset disabled={busy}>
                <Field
                  label="Contraseña actual"
                  hint="Déjala vacía si tu cuenta no tiene contraseña."
                >
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </Field>
                <Field
                  label="Nueva contraseña"
                  hint="Cualquier longitud, incluso vacía. Se cerrarán tus sesiones abiertas."
                >
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNew(e.target.value)}
                  />
                </Field>
                <PasswordStrength
                  password={newPassword}
                  context={[user.name, user.username, user.email]}
                />
                <button className="btn btn-primary">
                  {busy ? 'Guardando…' : 'Cambiar contraseña'}
                </button>
              </fieldset>
            </form>
          </section>
        </div>
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
