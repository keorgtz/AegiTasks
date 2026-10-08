import { useState, type FormEvent } from 'react';
import { BriefcaseBusiness, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from './api';
import { ErrorBox, Field, Modal } from './components';
import type { Space, TeamRole } from './types';
import './styles/team-roles.css';

export function TeamRoles({
  space,
  roles,
  canManage,
  loading,
  onSaved,
}: {
  space: Space;
  roles: TeamRole[];
  canManage: boolean;
  loading: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<TeamRole | 'new' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function remove(role: TeamRole) {
    if (
      !confirm(
        `¿Eliminar el rol «${role.name}»? Sus miembros conservarán el acceso y quedarán sin rol de equipo.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/spaces/${space.id}/team-roles/${role.id}?version=${role.version}`, 'DELETE');
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
      await onSaved().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card team-roles" aria-labelledby="team-roles-title">
      <div className="section-heading">
        <div>
          <h2 id="team-roles-title">
            <BriefcaseBusiness size={19} /> Roles de equipo
          </h2>
          <p className="muted">
            Define la función de cada miembro en este workspace. Estos roles no cambian los permisos
            de acceso.
          </p>
        </div>
        {canManage && (
          <button
            className="btn btn-ghost"
            disabled={busy || loading}
            onClick={() => setEditor('new')}
          >
            <Plus size={16} /> Crear rol de equipo
          </button>
        )}
      </div>
      <ErrorBox message={error} />
      {loading && roles.length === 0 ? (
        <p role="status" className="muted">
          Cargando roles de equipo…
        </p>
      ) : roles.length === 0 ? (
        <p className="muted">
          Todavía no hay roles de equipo. Por ejemplo: Dirección general, Dirección técnica,
          Gerencia o Soporte técnico.
        </p>
      ) : (
        <ul className="team-role-list">
          {roles.map((role) => (
            <li key={role.id}>
              <div>
                <strong>{role.name}</strong>
                {role.description && <small>{role.description}</small>}
              </div>
              {canManage && (
                <div className="team-role-actions">
                  <button
                    className="btn btn-icon"
                    aria-label={`Editar rol ${role.name}`}
                    disabled={busy}
                    onClick={() => setEditor(role)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="btn btn-icon"
                    aria-label={`Eliminar rol ${role.name}`}
                    disabled={busy}
                    onClick={() => void remove(role)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editor && (
        <TeamRoleEditor
          key={editor === 'new' ? 'new' : editor.id}
          space={space}
          role={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}

function TeamRoleEditor({
  space,
  role,
  onClose,
  onSaved,
}: {
  space: Space;
  role?: TeamRole;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(
        `/spaces/${space.id}/team-roles${role ? `/${role.id}` : ''}`,
        role ? 'PUT' : 'POST',
        { name, description, version: role?.version },
      );
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
      title={role ? 'Editar rol de equipo' : 'Crear rol de equipo'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="modal-body"
        onSubmit={submit}
        data-update-blocked={
          busy || name !== (role?.name || '') || description !== (role?.description || '')
        }
      >
        <ErrorBox message={error} />
        <Field label="Nombre del rol de equipo">
          <input
            required
            autoFocus
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dirección general, Dirección técnica, Gerencia, Soporte técnico…"
          />
        </Field>
        <Field label="Descripción (opcional)">
          <textarea
            rows={3}
            maxLength={400}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Responsabilidades dentro del equipo"
          />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar rol'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
