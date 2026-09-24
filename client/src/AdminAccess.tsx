import { useEffect, useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { api, errorMessage } from './api';
import { useChanges } from './changes';
import { Badge, ErrorBox, Field } from './components';
import { CatalogEditor } from './Settings';
import { initials, type User } from './types';
type RoleData = {
  pages: string[];
  roles: { name: string; isSystem: boolean }[];
  permissions: { roleName: string; page: string; allowed: boolean }[];
};
export const pageNames: Record<string, string> = {
  tasks: 'Pendientes y bandeja',
  projects: 'Proyectos y organización',
  notes: 'Notas',
  focus: 'Focus Mode',
  spaces: 'Spaces y membresías',
  settings: 'Ajustes',
};
export function AdminAccess() {
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<RoleData | null>(null);
  const [editor, setEditor] = useState<Partial<User> | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useChanges(['access'], () => void load().catch((e) => setError(errorMessage(e))));
  const load = async () => {
    const [u, r] = await Promise.all([api<User[]>('/users'), api<RoleData>('/roles')]);
    setUsers(u);
    setData(r);
  };
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await load();
      setMessage('Configuración guardada.');
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
          <div className="eyebrow">ADMINISTRACIÓN</div>
          <h1>Usuarios y roles</h1>
          <p>Acceso por página. Los espacios personales permanecen privados para su propietario.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditor({})}>
          <Plus size={18} />
          Agregar persona
        </button>
      </div>
      <ErrorBox message={error} />
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      <section className="card">
        {users.map((u) => (
          <div className="settings-row" key={u.id}>
            <div className="avatar">{initials(u.name)}</div>
            <span>
              <strong>{u.name}</strong>
              <small>{u.email}</small>
            </span>
            <Badge color={u.active ? 'green' : 'neutral'}>{u.active ? u.role : 'Inactivo'}</Badge>
            <button
              className="btn-icon"
              aria-label={`Editar persona ${u.name}`}
              onClick={() => setEditor(u)}
            >
              <Pencil size={17} />
            </button>
          </div>
        ))}
      </section>
      <section className="card subsection">
        <div className="section-heading">
          <div>
            <h2>
              <ShieldCheck size={20} /> Roles y acceso a páginas
            </h2>
            <p className="muted">
              Los roles nuevos tienen acceso a todas las páginas operativas. Solo Admin gestiona
              usuarios y roles.
            </p>
          </div>
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/roles', 'POST', { name });
              setName('');
            });
          }}
        >
          <Field label="Nuevo rol">
            <input
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ejemplo: Soporte"
            />
          </Field>
          <button className="btn btn-ghost" disabled={busy}>
            Crear rol
          </button>
        </form>
        <div className="role-grid">
          {data?.roles.map((role) => (
            <div className="role-card" key={role.name}>
              <div className="section-heading">
                <h3>{role.name}</h3>
                {!role.isSystem && (
                  <button
                    className="btn-icon"
                    aria-label={`Eliminar rol ${role.name}`}
                    disabled={busy}
                    onClick={() => {
                      if (confirm('¿Eliminar este rol? No debe estar asignado a ninguna persona.'))
                        void run(async () => {
                          await api(`/roles/${encodeURIComponent(role.name)}`, 'DELETE');
                        });
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {data.pages.map((page) => {
                const checked =
                  role.name === 'Admin' ||
                  data.permissions.some(
                    (p) => p.roleName === role.name && p.page === page && p.allowed,
                  );
                return (
                  <label className="checkbox-field" key={page}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy || role.name === 'Admin'}
                      onChange={() =>
                        void run(async () => {
                          const pages = data.permissions
                            .filter((p) => p.roleName === role.name && p.allowed && p.page !== page)
                            .map((p) => p.page);
                          if (!checked) pages.push(page);
                          await api(`/roles/${encodeURIComponent(role.name)}/permissions`, 'PUT', {
                            pages,
                          });
                        })
                      }
                    />
                    {pageNames[page]}
                  </label>
                );
              })}
              <p className="small muted">
                Usuarios y roles: {role.name === 'Admin' ? 'permitido' : 'reservado a Admin'}
              </p>
            </div>
          ))}
        </div>
      </section>
      {editor && (
        <CatalogEditor
          kind="users"
          value={editor}
          roles={data?.roles.map((r) => r.name)}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </>
  );
}
