import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from './api';
import { ErrorBox, Field } from './components';
import type { User } from './types';

export function AccountProfile({
  user,
  onSaved,
  notify,
}: {
  user: User;
  onSaved: (user: User) => void;
  notify: (message: string) => void;
}) {
  const [baseline, setBaseline] = useState(user);
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const dirty =
    name !== baseline.name || username !== baseline.username || email !== baseline.email;
  const identityChanged =
    username.trim().toLowerCase() !== baseline.username ||
    email.trim().toLowerCase() !== baseline.email;
  useEffect(() => {
    if (!identityChanged) setPassword('');
  }, [identityChanged]);
  useEffect(() => {
    if (dirty || busy) return;
    setBaseline(user);
    setName(user.name);
    setUsername(user.username);
    setEmail(user.email);
  }, [user, dirty, busy]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await api<User>('/auth/profile', 'PUT', {
        name,
        username,
        email,
        currentPassword,
        original: { name: baseline.name, username: baseline.username, email: baseline.email },
      });
      setBaseline(updated);
      setName(updated.name);
      setUsername(updated.username);
      setEmail(updated.email);
      setPassword('');
      setConflict(false);
      onSaved(updated);
      notify('Datos de tu cuenta actualizados.');
    } catch (e) {
      setError(errorMessage(e));
      setConflict(e instanceof ApiError && e.status === 409);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (!confirm('¿Recargar tus datos actuales y descartar los cambios de este formulario?'))
      return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<User>('/auth/me');
      setBaseline(updated);
      setName(updated.name);
      setUsername(updated.username);
      setEmail(updated.email);
      setPassword('');
      setConflict(false);
      onSaved(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card settings-identity">
      <h2>Datos de tu cuenta</h2>
      <p className="muted">Personaliza cómo te ve el equipo y tus datos para iniciar sesión.</p>
      <ErrorBox message={error} />
      <form onSubmit={submit} data-update-blocked={dirty || !!currentPassword || busy}>
        <fieldset disabled={busy}>
          <Field label="Nombre visible">
            <input
              required
              maxLength={80}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Nombre de usuario"
            hint="Único, de 3 a 40 caracteres: letras sin acentos, números, puntos, guiones o guiones bajos."
          >
            <input
              required
              minLength={3}
              maxLength={40}
              pattern={'[a-zA-Z0-9][a-zA-Z0-9._\\-]{2,39}'}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Correo electrónico">
            <input
              required
              type="email"
              maxLength={200}
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {identityChanged && (
            <Field
              label="Confirmar contraseña actual"
              hint="Confirma tu clave para cambiar el usuario o correo. Déjala vacía si tu cuenta no tiene contraseña."
            >
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <p className="settings-account-role">
            Rol: <strong>{user.role === 'Admin' ? 'Administrador' : user.role}</strong>
          </p>
          <div className="settings-inline-actions">
            <button className="btn btn-primary" disabled={!dirty || busy || conflict}>
              {busy ? 'Guardando…' : 'Guardar datos'}
            </button>
            {conflict && (
              <button className="btn btn-ghost" type="button" onClick={() => void reload()}>
                Recargar datos
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
