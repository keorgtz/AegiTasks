import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Copy, Globe2, LockKeyhole, Pencil, Plus, UserPlus, UserRound, Users } from 'lucide-react';
import { api, errorMessage, setActiveSpace } from './api';
import { emitChanges, useChanges } from './changes';
import { Brand, ErrorBox, Field } from './components';
import type { Space, SpaceMember, SpaceSession, TeamRole, User } from './types';
import { SpaceEditor, SpaceMemberDialog } from './SpaceDialogs';
import { TeamRoles } from './TeamRoles';

export function SpaceGate({
  user,
  children,
}: {
  user: User;
  children: (
    session: SpaceSession,
    active: Space,
    switchSpace: (id: string) => void,
    reload: () => Promise<void>,
  ) => ReactNode;
}) {
  const [session, setSession] = useState<SpaceSession | null>(null);
  const [activeId, setActiveId] = useState('');
  const [error, setError] = useState('');
  const current = useRef('');
  const reload = useCallback(async () => {
    const result = await api<SpaceSession>('/spaces');
    const saved =
      new URLSearchParams(location.search).get('space') ||
      localStorage.getItem(`aegitasks-space-${user.id}`);
    const id =
      result.spaces.find((s) => s.id === (current.current || saved))?.id ||
      result.spaces[0]?.id ||
      '';
    current.current = id;
    setSession(result);
    setActiveSpace(id);
    setActiveId(id);
    setError('');
  }, [user.id]);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (document.visibilityState === 'visible')
        void reload().catch((e) => {
          if (alive) setError(errorMessage(e));
        });
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);
  useChanges(['access'], () => void reload().catch((e) => setError(errorMessage(e))));
  useEffect(() => {
    if (!activeId) return;
    const events = new EventSource(`/api/events?space=${encodeURIComponent(activeId)}`);
    events.addEventListener('ready', () => emitChanges(['all']));
    events.addEventListener('change', (event) =>
      emitChanges(JSON.parse((event as MessageEvent).data)),
    );
    events.onerror = () => {
      // A revoked/expired session may reject the handshake before an event can be sent.
      if (navigator.onLine) void reload().catch((e) => setError(errorMessage(e)));
    };
    events.addEventListener('revoked', (event) => {
      events.close();
      if ((event as MessageEvent).data === '401')
        window.dispatchEvent(new Event('session-expired'));
      else void reload().catch((e) => setError(errorMessage(e)));
    });
    return () => events.close();
  }, [activeId, reload]);
  const switchSpace = (id: string) => {
    if (id === activeId) return;
    if (
      document.querySelector('[data-unsaved-note="true"]') &&
      !confirm('Hay una nota con cambios sin guardar. ¿Cambiar de espacio y descartar el borrador?')
    )
      return;
    if (document.querySelector('dialog[open]')) {
      alert('Cierra el formulario antes de cambiar de espacio.');
      return;
    }
    current.current = id;
    setActiveSpace(id);
    setActiveId(id);
    localStorage.setItem(`aegitasks-space-${user.id}`, id);
    const nextRoute =
      location.hash === '#chat' || location.hash.startsWith('#chat/') ? location.hash : '#inbox';
    history.replaceState(null, '', `${location.pathname}${nextRoute}`);
  };
  const active = session?.spaces.find((s) => s.id === activeId);
  if (!session || !active)
    return (
      <div className="auth-page">
        <Brand />
        <ErrorBox message={error} />
        {error ? (
          <button
            className="btn btn-ghost"
            onClick={() => void reload().catch((e) => setError(errorMessage(e)))}
          >
            Reintentar
          </button>
        ) : (
          <p>Preparando tus espacios…</p>
        )}
      </div>
    );
  return children(session, active, switchSpace, reload);
}

export function SpaceSelector({
  spaces,
  active,
  onChange,
}: {
  spaces: Space[];
  active: Space;
  onChange: (id: string) => void;
}) {
  return (
    <label className="space-selector">
      {active.isPersonal ? <LockKeyhole size={17} /> : <Users size={17} />}
      <select
        aria-label="Espacio activo"
        value={active.id}
        onChange={(e) => onChange(e.target.value)}
      >
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.isPersonal ? `${s.name} · solo tú` : s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SpacesPage({
  user,
  active,
  session,
  reload,
  switchSpace,
}: {
  user: User;
  active: Space;
  session: SpaceSession;
  reload: () => Promise<void>;
  switchSpace: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [teamRoles, setTeamRoles] = useState<TeamRole[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const memberRequest = useRef(0);
  const [editor, setEditor] = useState<'edit' | 'member' | null>(null);
  const [message, setMessage] = useState('');
  const canEdit = active.ownerId === user.id || (!active.isPersonal && user.role === 'Admin');
  const loadMembers = async (signal?: AbortSignal) => {
    const request = ++memberRequest.current;
    setMembersLoading(true);
    try {
      const [result, roles] = await Promise.all([
        api<SpaceMember[]>(`/spaces/${active.id}/members`, 'GET', undefined, signal),
        active.isPersonal
          ? Promise.resolve([])
          : api<TeamRole[]>(`/spaces/${active.id}/team-roles`, 'GET', undefined, signal),
      ]);
      if (!signal?.aborted && request === memberRequest.current) {
        setMembers(result);
        setTeamRoles(roles);
      }
    } finally {
      if (!signal?.aborted && request === memberRequest.current) setMembersLoading(false);
    }
  };
  useChanges(['access'], () => void loadMembers().catch((e) => setError(errorMessage(e))));
  useEffect(() => {
    const controller = new AbortController();
    setInvite('');
    setMessage('');
    setMembers([]);
    setTeamRoles([]);
    void loadMembers(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(errorMessage(e));
    });
    return () => controller.abort();
  }, [active.id]);
  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api<Space>('/spaces', 'POST', { name });
      setName('');
      await reload();
    });
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api<Space>('/spaces/join', 'POST', { code: code.trim() });
      setCode('');
      await reload();
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LO TUYO Y LO COMPARTIDO</div>
          <h1>Spaces</h1>
          <p>
            Tu espacio personal es privado. En un workspace, el contenido pertenece al equipo que se
            une.
          </p>
        </div>
      </div>
      <ErrorBox message={error} />
      <div className="section-heading">
        <div>
          <h2>Mis espacios</h2>
          <p className="muted">
            Elige dónde trabajar. Solo el espacio personal mantiene tus notas y pendientes privados.
          </p>
        </div>
      </div>
      <div className="project-grid">
        {session.spaces.map((s) => (
          <button
            key={s.id}
            className={`card project-card ${s.id === active.id ? 'space-selected' : ''}`}
            onClick={() => switchSpace(s.id)}
          >
            <div className="project-symbol tone-purple">
              {s.isPersonal ? <LockKeyhole /> : <Globe2 />}
            </div>
            <h2>{s.name}</h2>
            <p>
              {s.isPersonal
                ? 'Tus notas, tus pendientes. Solo tú puedes acceder.'
                : 'Proyectos, notas y conocimiento compartido con sus miembros.'}
            </p>
            <small>{s.id === active.id ? 'Espacio actual' : 'Abrir espacio'}</small>
          </button>
        ))}
      </div>
      <div className="settings-grid subsection">
        <section className="card">
          <h2>
            <Plus size={19} /> Crear workspace
          </h2>
          <form onSubmit={create} data-update-blocked={!!name || busy}>
            <Field label="Nombre del workspace">
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Equipo de desarrollo"
              />
            </Field>
            <button className="btn btn-primary" disabled={busy}>
              Crear workspace
            </button>
          </form>
        </section>
        <section className="card">
          <h2>Unirme a un workspace</h2>
          <form onSubmit={join} data-update-blocked={!!code || busy}>
            <Field label="Código de invitación">
              <input
                required
                value={code}
                maxLength={100}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Pega el código que compartió el propietario"
              />
            </Field>
            <button className="btn btn-ghost" disabled={busy}>
              Unirme
            </button>
          </form>
        </section>
      </div>
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      {!active.isPersonal && (
        <TeamRoles
          key={active.id}
          space={active}
          roles={teamRoles}
          canManage={canEdit}
          loading={membersLoading}
          onSaved={loadMembers}
        />
      )}
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>{active.name}</h2>
            <p className="muted">
              {active.isPersonal ? 'Espacio personal · solo tú' : 'Miembros de este workspace'}
            </p>
          </div>
          {canEdit && (
            <button className="btn btn-ghost" disabled={busy} onClick={() => setEditor('edit')}>
              <Pencil size={16} /> Editar espacio
            </button>
          )}
        </div>
        {!active.isPersonal && (active.ownerId === user.id || user.role === 'Admin') && (
          <div className="form-actions">
            {user.role === 'Admin' && (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => setEditor('member')}
              >
                <UserPlus size={16} /> Agregar usuario
              </button>
            )}
            {active.ownerId === user.id && (
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await api<{ code: string }>(`/spaces/${active.id}/invite`, 'POST');
                    setInvite(r.code);
                  })
                }
              >
                Generar invitación
              </button>
            )}
          </div>
        )}
        {!active.isPersonal && active.ownerId === user.id && (
          <div className="form-actions">
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`/spaces/${active.id}/invite`, 'DELETE');
                  setInvite('');
                  alert('Invitaciones revocadas. Los miembros actuales conservan su acceso.');
                })
              }
            >
              Revocar invitaciones
            </button>
          </div>
        )}
        {invite && (
          <div className="invite-box">
            <p>Válida por 7 días. Generar otra invalida la anterior.</p>
            <code>{invite}</code>
            <button
              className="btn btn-ghost"
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(invite);
                })
              }
            >
              <Copy size={15} /> Copiar código
            </button>
            <button
              className="btn btn-ghost"
              onClick={() =>
                void run(async () => {
                  await api(`/spaces/${active.id}/invite`, 'DELETE');
                  setInvite('');
                })
              }
            >
              Revocar
            </button>
          </div>
        )}
        {membersLoading && members.length === 0 && (
          <p role="status" className="muted">
            Cargando miembros…
          </p>
        )}
        {members.map((m) => (
          <div className="settings-row workspace-member-row" key={m.id}>
            <UserRound size={18} />
            <span>
              <strong>{m.name}</strong>
              <small>
                {m.id === active.ownerId ? 'Propietario' : 'Miembro'} · {m.email}
              </small>
            </span>
            {!active.isPersonal &&
              (canEdit ? (
                <select
                  className="member-team-role"
                  aria-label={`Rol de equipo de ${m.name}`}
                  value={m.teamRole?.id || ''}
                  disabled={busy || membersLoading}
                  onChange={(event) => {
                    const teamRoleId = event.target.value || null;
                    void run(async () => {
                      try {
                        await api(`/spaces/${active.id}/members/${m.id}/team-role`, 'PUT', {
                          teamRoleId,
                          version: m.teamRoleVersion,
                        });
                      } finally {
                        await loadMembers();
                      }
                      setMessage(`Rol de equipo de ${m.name} actualizado.`);
                    });
                  }}
                >
                  <option value="">Sin rol de equipo</option>
                  {teamRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="member-role-label">{m.teamRole?.name || 'Sin rol de equipo'}</span>
              ))}
            {m.id !== active.ownerId &&
              (active.ownerId === user.id || user.role === 'Admin' || m.id === user.id) && (
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        m.id === user.id
                          ? '¿Salir de este workspace? Sus datos se conservarán para el equipo.'
                          : '¿Quitar a esta persona del workspace?',
                      )
                    )
                      void run(async () => {
                        await api(`/spaces/${active.id}/members/${m.id}`, 'DELETE');
                        await reload();
                        if (m.id !== user.id) await loadMembers();
                      });
                  }}
                >
                  {m.id === user.id ? 'Salir' : 'Quitar'}
                </button>
              )}
            {!active.isPersonal && active.ownerId === user.id && m.id !== user.id && m.active && (
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  if (confirm(`¿Transferir la propiedad a ${m.name}?`))
                    void run(async () => {
                      await api(`/spaces/${active.id}/owner`, 'POST', { userId: m.id });
                      await reload();
                      await loadMembers();
                    });
                }}
              >
                Hacer propietario
              </button>
            )}
          </div>
        ))}
      </section>
      {editor === 'edit' && (
        <SpaceEditor
          space={active}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await reload();
            setMessage('Espacio actualizado.');
          }}
        />
      )}
      {editor === 'member' && (
        <SpaceMemberDialog
          space={active}
          members={members}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await reload();
            await loadMembers();
            setMessage('Usuario agregado al workspace.');
          }}
        />
      )}
    </>
  );
}
