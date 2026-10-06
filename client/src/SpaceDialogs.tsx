import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from './api';
import { ErrorBox, Field, Modal } from './components';
import type { Space, User } from './types';

export function SpaceEditor({
  space,
  onClose,
  onSaved,
}: {
  space: Space;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(space.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/spaces/${space.id}`, 'PUT', { name: name.trim() });
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Editar espacio" onClose={() => !busy && onClose()}>
      <form
        className="modal-body"
        onSubmit={save}
        data-update-blocked={name !== space.name || busy}
      >
        <ErrorBox message={error} />
        <fieldset disabled={busy}>
          <Field label="Nombre del espacio">
            <input
              autoFocus
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <p className="muted small">
            {space.isPersonal
              ? 'Este espacio sigue siendo privado y solo tú puedes acceder.'
              : 'El nuevo nombre se muestra a todos los integrantes del workspace.'}
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={!name.trim()}>
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

export function SpaceMemberDialog({
  space,
  members,
  onClose,
  onSaved,
}: {
  space: Space;
  members: User[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void api<User[]>('/users', 'GET', undefined, controller.signal)
      .then(setUsers)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  const candidates = users.filter(
    (u) => u.active && u.id !== space.ownerId && !members.some((m) => m.id === u.id),
  );
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!candidates.some((u) => u.id === selected)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/spaces/${space.id}/members`, 'POST', { userId: selected });
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Agregar usuario al workspace" onClose={() => !busy && onClose()}>
      <form className="modal-body" onSubmit={add} data-update-blocked={!!selected || busy}>
        <p className="muted">
          La persona tendrá acceso a los proyectos, pendientes y notas de «{space.name}» al
          agregarla.
        </p>
        <ErrorBox message={error} />
        {error && !users.length && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => setAttempt(attempt + 1)}
          >
            Reintentar
          </button>
        )}
        <fieldset disabled={busy || loading}>
          <Field label="Usuario existente">
            <select
              required
              autoFocus
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">{loading ? 'Cargando usuarios…' : 'Selecciona una persona'}</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.username} · {u.email}
                </option>
              ))}
            </select>
          </Field>
          {!loading && !error && !candidates.length && (
            <p role="status" className="muted small">
              Todos los usuarios activos ya pertenecen a este workspace.
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              disabled={!candidates.some((u) => u.id === selected)}
            >
              {busy ? 'Agregando…' : 'Agregar usuario'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
