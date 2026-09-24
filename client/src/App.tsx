import { useCallback, useEffect, useState, lazy, Suspense, type FormEvent } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  Archive,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock3,
  Folder,
  FolderKanban,
  Inbox,
  LayoutGrid,
  List,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  WifiOff,
  X,
  FileText,
  Timer,
  Globe2,
  MoreHorizontal,
} from 'lucide-react';
import { api, ApiError, errorMessage, setActiveSpace } from './api';
import { useChanges } from './changes';
import { SidebarSections } from './SidebarSections';
import { Badge, Brand, Empty, ErrorBox, Field, Modal } from './components';
import { CatalogEditor, Settings } from './Settings';
import { TaskEditor } from './TaskEditor';
import { SpaceGate, SpaceSelector, SpacesPage } from './Spaces';
const NotesPage = lazy(() => import('./Notes').then((m) => ({ default: m.NotesPage })));
import { FocusPage } from './Focus';
import { AdminAccess } from './AdminAccess';
import {
  dateLabel,
  initials,
  localDate,
  priorities,
  priorityColors,
  type Summary,
  type TaskItem,
  type TaskPage,
  type User,
  type Workspace,
  type Space,
  type SpaceSession,
} from './types';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light');
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('aegitasks-theme', next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'dark' ? '#101118' : '#f5f6fb');
  };
  const checkSession = useCallback(async () => {
    setLoading(true);
    setAuthError('');
    try {
      setUser(await api<User>('/auth/me'));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setAuthError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void checkSession();
    const expired = () => {
      setUser(null);
      setAuthError(
        'Tu sesión terminó. Ingresa nuevamente; tus borradores siguen en este dispositivo.',
      );
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [checkSession]);
  const logout = async () => {
    try {
      await api('/auth/logout', 'POST');
      if (user)
        Object.keys(localStorage)
          .filter((k) => k.startsWith(`aegitasks-draft-${user.id}`))
          .forEach((k) => localStorage.removeItem(k));
      setActiveSpace('');
      setUser(null);
    } catch (e) {
      setAuthError(errorMessage(e));
    }
  };
  if (loading)
    return (
      <div className="auth-page">
        <Brand />
        <p className="muted">Preparando tu espacio…</p>
      </div>
    );
  return user ? (
    <SpaceGate user={user}>
      {(session, active, switchSpace, reloadSpaces) => (
        <WorkspaceApp
          key={active.id}
          spaceSession={session}
          space={active}
          switchSpace={switchSpace}
          reloadSpaces={reloadSpaces}
          user={user}
          logout={() => void logout()}
          theme={theme}
          toggleTheme={toggleTheme}
          globalError={authError}
        />
      )}
    </SpaceGate>
  ) : (
    <Login
      onLogin={setUser}
      error={authError}
      retry={() => void checkSession()}
      theme={theme}
      toggleTheme={toggleTheme}
    />
  );
}
function Login({
  onLogin,
  error: initialError,
  retry,
  theme,
  toggleTheme,
}: {
  onLogin: (u: User) => void;
  error: string;
  retry: () => void;
  theme: string;
  toggleTheme: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api<User>('/auth/login', 'POST', { email, password }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <button className="btn-icon auth-theme" onClick={toggleTheme} aria-label="Cambiar tema">
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="auth-layout">
        <section className="auth-story">
          <Brand />
          <div className="eyebrow">MENOS RUIDO. MÁS CLARIDAD.</div>
          <h1>
            Un pendiente.
            <br />
            Un paso adelante<span>.</span>
          </h1>
          <p>
            Lo que tu equipo encuentra, en un solo lugar. Reporta, organiza y resuelve sin
            complicaciones.
          </p>
          <div className="auth-steps">
            <div>
              <span>
                <Inbox size={21} />
              </span>
              <strong>Captura la idea</strong>
              <small>Un bug, una mejora o algo por hacer.</small>
            </div>
            <div>
              <span>
                <FolderKanban size={21} />
              </span>
              <strong>Dale su lugar</strong>
              <small>Cada proyecto, con su propio espacio.</small>
            </div>
            <div>
              <span>
                <CheckCheck size={21} />
              </span>
              <strong>Hazlo avanzar</strong>
              <small>Una cosa a la vez, a tu ritmo.</small>
            </div>
          </div>
          <small className="auth-caption">AEGIPULSE · UN ESPACIO PARA TU EQUIPO</small>
        </section>
        <section className="card login-card">
          <div className="login-icon">
            <ShieldCheck size={28} />
          </div>
          <h2>Qué bueno tenerte aquí</h2>
          <p className="muted">Ingresa a tu espacio de trabajo.</p>
          <ErrorBox message={error || initialError} />
          {initialError && (
            <button className="btn btn-ghost" onClick={retry}>
              <RefreshCw size={16} /> Reintentar conexión
            </button>
          )}
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              <Field label="Correo electrónico">
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@equipo.com"
                />
              </Field>
              <Field label="Contraseña">
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                />
              </Field>
              <button className="btn btn-primary btn-block">
                {busy ? 'Ingresando…' : 'Entrar a mi espacio'}
                <ArrowRight size={18} />
              </button>
            </fieldset>
          </form>
          <p className="login-help">
            ¿Es tu primera vez? Pide al administrador que cree tu cuenta. Si olvidaste tu
            contraseña, él puede restablecerla.
          </p>
        </section>
      </div>
    </div>
  );
}
function WorkspaceApp({
  user,
  logout,
  theme,
  toggleTheme,
  globalError,
  spaceSession,
  space,
  switchSpace,
  reloadSpaces,
}: {
  user: User;
  logout: () => void;
  theme: string;
  toggleTheme: () => void;
  globalError: string;
  spaceSession: SpaceSession;
  space: Space;
  switchSpace: (id: string) => void;
  reloadSpaces: () => Promise<void>;
}) {
  const permissions = spaceSession.permissions;
  const [moreMenu, setMoreMenu] = useState(false);
  const routePage = (r: string) =>
    r.startsWith('project/')
      ? 'tasks'
      : ['inbox', 'mine', 'archived'].includes(r)
        ? 'tasks'
        : r === 'admin'
          ? 'users'
          : r;
  const [w, setWorkspace] = useState<Workspace | null>(null);
  const [route, setRoute] = useState(location.hash.slice(1) || 'inbox');
  const [folder, setFolder] = useState('');
  const [settingsProject, setSettingsProject] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [priority, setPriority] = useState('');
  const [scope, setScope] = useState('open');
  const [sort, setSort] = useState('priority');
  const [view, setView] = useState('list');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TaskPage>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [summary, setSummary] = useState<Summary>({ open: 0, urgent: 0, overdue: 0, done: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState('');
  const [editor, setEditor] = useState<string | null>(
    new URLSearchParams(location.search).get('task'),
  );
  const [projectModal, setProjectModal] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (navigator.onLine && 'serviceWorker' in navigator)
          void navigator.serviceWorker
            .getRegistration()
            .then((r) => r?.update())
            .catch(() => {});
      },
      60 * 60 * 1000,
    );
    return () => clearInterval(timer);
  }, []);
  const projectId = route.startsWith('project/') ? route.split('/')[1] || '' : '';
  const project = w?.projects.find((p) => p.id === projectId);
  useEffect(() => {
    if (w && projectId && !w.projects.some((p) => p.id === projectId))
      location.hash = permissions.includes('projects') ? 'projects' : 'inbox';
  }, [w, projectId, permissions]);
  const notify = (message: string) => setToast(message);
  const reload = useCallback(async () => {
    const workspace = await api<Workspace>('/workspace');
    setWorkspace(workspace);
    setRevision((r) => r + 1);
  }, []);
  useEffect(() => {
    void reload().catch((e) => {
      setError(errorMessage(e));
      setLoading(false);
    });
  }, [reload]);
  useEffect(() => {
    const onHash = (event: HashChangeEvent) => {
      if (
        document.querySelector('[data-unsaved-note="true"]') &&
        !confirm('Hay una nota con cambios sin guardar. ¿Salir y descartar el borrador?')
      ) {
        history.replaceState(null, '', event.oldURL);
        return;
      }
      setRoute(location.hash.slice(1) || 'inbox');
      if (!location.hash.startsWith('#project/')) setView('list');
      setFolder('');
      setStatus('');
      setPage(1);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('beforeinstallprompt', prompt);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('beforeinstallprompt', prompt);
    };
  }, []);
  useChanges(['catalog'], () => void reload().catch((e) => setError(errorMessage(e))));
  useChanges(['tasks'], () => setRevision((r) => r + 1));
  useEffect(() => {
    if (
      !w ||
      !permissions.includes('tasks') ||
      !(['inbox', 'mine', 'archived'].includes(route) || route.startsWith('project/'))
    )
      return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      scope: route === 'mine' ? 'mine' : route === 'archived' ? 'archived' : scope,
      sort,
      page: String(page),
    });
    if (projectId) params.set('project', projectId);
    if (folder) params.set('folder', folder);
    if (status) params.set('status', status);
    if (tag) params.set('tag', tag);
    if (priority) params.set('priority', priority);
    if (query) params.set('q', query);
    Promise.all([
      api<TaskPage>(`/tasks?${params}`, 'GET', undefined, controller.signal),
      api<Summary>('/tasks/summary', 'GET', undefined, controller.signal),
    ])
      .then(([tasks, counts]) => {
        setResult(tasks);
        setSummary(counts);
        setError('');
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    w,
    projectId,
    folder,
    status,
    tag,
    priority,
    query,
    scope,
    sort,
    page,
    route,
    revision,
    online,
    permissions,
  ]);
  const navigate = (to: string) => {
    setMoreMenu(false);
    if (to === 'settings' && projectId) setSettingsProject(projectId);
    location.hash = to;
    setPage(1);
    setFolder('');
    setStatus('');
    setSearch('');
    setQuery('');
    setTag('');
    setPriority('');
    setScope('open');
  };
  const closeTask = () => {
    setEditor(null);
    const url = new URL(location.href);
    url.searchParams.delete('task');
    history.replaceState(null, '', url);
  };
  const openTask = (id: string) => {
    setEditor(id);
    const url = new URL(location.href);
    url.searchParams.set('task', id);
    history.replaceState(null, '', url);
  };
  async function installApp() {
    if (install) {
      await install.prompt();
      await install.userChoice;
      setInstall(null);
    } else setInstallHelp(true);
  }
  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const clearFilters = () => {
    setSearch('');
    setQuery('');
    setFolder('');
    setStatus('');
    setTag('');
    setPriority('');
    setScope('open');
    setPage(1);
  };
  const nav = [
    { id: 'inbox', name: 'Bandeja', icon: Inbox },
    { id: 'mine', name: 'Mis pendientes', icon: UserRound },
    { id: 'projects', name: 'Proyectos', icon: FolderKanban },
    { id: 'notes', name: 'Notas', icon: FileText },
    { id: 'focus', name: 'Focus', icon: Timer },
    { id: 'spaces', name: 'Spaces', icon: Globe2 },
    { id: 'settings', name: 'Ajustes', icon: SettingsIcon },
    { id: 'admin', name: 'Usuarios y roles', icon: ShieldCheck },
  ];
  const navigation = (mobile = false) =>
    nav
      .filter(
        (n) =>
          permissions.includes(routePage(n.id)) &&
          (!mobile || ['inbox', 'notes', 'focus', 'spaces'].includes(n.id)),
      )
      .map((n) => (
        <button
          key={n.id}
          className={`${mobile ? 'nav-item' : 'sidebar-link'} ${route === n.id || (n.id === 'projects' && !!projectId) ? 'active' : ''}`}
          onClick={() => navigate(n.id)}
        >
          <n.icon size={21} />
          <span>{n.name}</span>
          {!mobile && n.id === 'inbox' && <span className="nav-count">{summary.open}</span>}
        </button>
      ));
  const title =
    project?.name ||
    (route === 'mine' ? 'Mis pendientes' : route === 'archived' ? 'Archivados' : 'Tu bandeja');
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Ir al contenido
      </a>
      <aside className="sidebar">
        <Brand onInstall={() => setInstallHelp(true)} />
        <SpaceSelector spaces={spaceSession.spaces} active={space} onChange={switchSpace} />
        <SidebarSections
          label={space.isPersonal ? 'MI ESPACIO' : 'WORKSPACE COMPARTIDO'}
          navigation={navigation()}
          createProject={permissions.includes('projects') ? () => setProjectModal(true) : undefined}
          projects={w?.projects
            .filter((p) => !p.archived && permissions.includes('tasks'))
            .map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`project/${p.id}`)}
                className={`project-link ${projectId === p.id ? 'active' : ''}`}
              >
                <span className={`project-dot tone-${p.color}`} />
                <span>{p.name}</span>
                <ChevronRight size={14} />
              </button>
            ))}
        />
        <div className="sidebar-bottom">
          {permissions.includes('tasks') && (
            <button
              className={`sidebar-link ${route === 'archived' ? 'active' : ''}`}
              onClick={() => navigate('archived')}
            >
              <Archive size={19} /> Archivados
            </button>
          )}
          {needRefresh && (
            <button
              className="sidebar-link update-link"
              onClick={() => {
                if (confirm('¿Actualizar la aplicación? Guarda primero los cambios abiertos.'))
                  void updateServiceWorker(true);
              }}
            >
              <RefreshCw size={19} /> Actualización disponible
            </button>
          )}
          <div className="sidebar-note">
            <Sparkles size={18} />
            <p>
              Una cosa a la vez.
              <br />
              <strong>Cada avance cuenta.</strong>
            </p>
          </div>
          <div className="profile">
            <div className="avatar">{initials(user.name)}</div>
            <span>
              <strong>{user.name}</strong>
              <small>{user.role === 'Admin' ? 'Administrador' : user.role}</small>
            </span>
            <button className="btn-icon" onClick={logout} aria-label="Cerrar sesión">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <header className="app-header">
        <div className="mobile-brand">
          <Brand onInstall={() => setInstallHelp(true)} />
        </div>
        <div className="breadcrumb">
          <span>{space.isPersonal ? 'Personal' : space.name}</span>
          <ChevronRight size={15} />
          <strong>
            {nav.find((n) => n.id === route)?.name || (route === 'account' ? 'Mi cuenta' : title)}
          </strong>
        </div>
        <div className="header-actions">
          <span className="today-label">
            {new Date().toLocaleDateString('es-MX', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
          <button
            className="btn-icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button className="avatar" onClick={() => navigate('account')} aria-label="Mi cuenta">
            {initials(user.name)}
          </button>
        </div>
      </header>
      <main id="main-content" className="app-content">
        <div className="mobile-space">
          <SpaceSelector spaces={spaceSession.spaces} active={space} onChange={switchSpace} />
        </div>
        <ErrorBox message={globalError} />
        {!online && (
          <div className="offline-banner">
            <WifiOff size={19} />
            <span>
              Sin conexión. Puedes escribir un reporte y guardarlo cuando vuelvas a conectarte.
            </span>
          </div>
        )}
        <ErrorBox message={error} />
        {error && (
          <button
            className="btn btn-ghost"
            onClick={() => void reload().catch((e) => setError(errorMessage(e)))}
          >
            <RefreshCw size={16} /> Reintentar
          </button>
        )}
        {!w ? (
          <div className="card">
            <p className="muted">
              {error
                ? 'No se pudo cargar el espacio de trabajo.'
                : 'Cargando proyectos y pendientes…'}
            </p>
          </div>
        ) : (
          <>
            {route !== 'account' && !permissions.includes(routePage(route)) ? (
              <section className="card">
                <Empty icon={<ShieldCheck size={32} />} title="Página sin acceso">
                  Tu rol no tiene permiso para esta página.
                </Empty>
                <button className="btn btn-ghost" onClick={() => navigate('account')}>
                  Mi cuenta
                </button>
              </section>
            ) : route === 'notes' ? (
              <Suspense fallback={<p>Cargando notas…</p>}>
                <NotesPage
                  space={space}
                  workspace={w}
                  canTasks={permissions.includes('tasks')}
                  openTask={openTask}
                />
              </Suspense>
            ) : route === 'focus' ? (
              <FocusPage
                space={space}
                workspace={w}
                canTasks={permissions.includes('tasks')}
                openTask={openTask}
              />
            ) : route === 'spaces' ? (
              <SpacesPage
                user={user}
                active={space}
                session={spaceSession}
                reload={reloadSpaces}
                switchSpace={switchSpace}
              />
            ) : route === 'admin' ? (
              <AdminAccess />
            ) : route === 'settings' || route === 'account' ? (
              <>
                <Settings
                  key={route}
                  workspace={w}
                  user={user}
                  reload={reload}
                  notify={notify}
                  logout={logout}
                  initialProject={settingsProject}
                  canOrganize={route !== 'account' && permissions.includes('projects')}
                />
                <section className="card mobile-tools">
                  <h2>La app, siempre a mano</h2>
                  {needRefresh && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => void updateServiceWorker(true)}
                    >
                      <RefreshCw size={17} /> Actualizar aplicación
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => navigate('archived')}>
                    <Archive size={17} /> Ver archivados
                  </button>
                  <button className="btn btn-ghost" onClick={logout}>
                    <LogOut size={17} /> Cerrar sesión
                  </button>
                </section>
              </>
            ) : route === 'projects' ? (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">CADA COSA EN SU LUGAR</div>
                    <h1>Tus proyectos</h1>
                    <p>Un espacio para cada producto. La misma claridad en todos.</p>
                  </div>
                  {permissions.includes('projects') && (
                    <button className="btn btn-primary" onClick={() => setProjectModal(true)}>
                      <Plus size={19} /> Nuevo proyecto
                    </button>
                  )}
                </div>
                <div className="project-grid">
                  {w.projects
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <button
                        key={p.id}
                        className="card project-card"
                        onClick={() => navigate(`project/${p.id}`)}
                      >
                        <div className={`project-symbol tone-${p.color}`}>
                          <FolderKanban size={26} />
                        </div>
                        <h2>{p.name}</h2>
                        <div className="project-labels">
                          {p.labels
                            ?.split(',')
                            .filter(Boolean)
                            .map((label) => (
                              <Badge key={label} color={p.color}>
                                {label.trim()}
                              </Badge>
                            ))}
                        </div>
                        <p>
                          {p.description || 'Todo lo que necesita este proyecto, en un solo lugar.'}
                        </p>
                        <div className="project-card-foot">
                          <span>
                            {w.folders.filter((f) => f.projectId === p.id).length} carpetas
                          </span>
                          <ArrowRight size={19} />
                        </div>
                      </button>
                    ))}
                </div>
                {!w.projects.some((p) => !p.archived) && (
                  <section className="card">
                    <Empty icon={<FolderKanban size={36} />} title="El primer paso: un proyecto">
                      {permissions.includes('projects')
                        ? 'Crea un proyecto para tu PMS, POS o CRM y empieza a reunir los pendientes.'
                        : 'Una persona con permiso de Proyectos puede crear la estructura del espacio.'}
                    </Empty>
                  </section>
                )}
              </>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {project ? 'ESPACIO DEL PROYECTO' : 'TU EQUIPO, EN SINTONÍA'}
                    </div>
                    <h1>
                      {title}
                      <span className="heading-dot">.</span>
                    </h1>
                    <p>
                      {project?.description ||
                        (route === 'mine'
                          ? 'Lo que está en tus manos, con el siguiente paso siempre claro.'
                          : route === 'archived'
                            ? 'El trabajo que guardaste. Puedes restaurarlo cuando lo necesites.'
                            : 'Todo lo que encuentra tu equipo. Un siguiente paso a la vez.')}
                    </p>
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={!w.projects.some((p) => !p.archived)}
                    onClick={() => setEditor('new')}
                  >
                    <Plus size={20} /> Nuevo pendiente
                  </button>
                </div>
                {route === 'inbox' && (
                  <>
                    <section className="hero">
                      <div>
                        <div className="hero-label">
                          <Sparkles size={15} /> UN POCO MÁS CERCA
                        </div>
                        <h2>
                          Hola, {user.name.split(' ')[0]}.<br />
                          Hagamos espacio para avanzar.
                        </h2>
                        <p>
                          {summary.urgent
                            ? `Hay ${summary.urgent} pendientes de prioridad alta o urgente. Empieza por lo que más importa.`
                            : 'Las buenas ideas y los pequeños hallazgos también merecen su lugar.'}
                        </p>
                      </div>
                      <div className="hero-ring">
                        <svg viewBox="0 0 120 120" aria-hidden="true">
                          <circle cx="60" cy="60" r="50" />
                          <circle
                            cx="60"
                            cy="60"
                            r="50"
                            strokeDasharray={`${(summary.done / (summary.open + summary.done || 1)) * 314} 314`}
                          />
                        </svg>
                        <div>
                          <strong>
                            {Math.round((summary.done / (summary.open + summary.done || 1)) * 100)}
                            <small>%</small>
                          </strong>
                          <span>resueltos</span>
                        </div>
                      </div>
                    </section>
                    <div className="stats-grid">
                      {[
                        {
                          key: 'open',
                          label: 'Por resolver',
                          value: summary.open,
                          icon: Inbox,
                          color: 'purple',
                          note: 'Cada uno, un siguiente paso',
                        },
                        {
                          key: 'urgent',
                          label: 'Alta prioridad',
                          value: summary.urgent,
                          icon: Bell,
                          color: 'orange',
                          note: 'Lo que merece atención',
                        },
                        {
                          key: 'overdue',
                          label: 'Fuera de fecha',
                          value: summary.overdue,
                          icon: Clock3,
                          color: 'red',
                          note: 'Es momento de revisarlos',
                        },
                        {
                          key: 'done',
                          label: 'Resueltos',
                          value: summary.done,
                          icon: CircleCheck,
                          color: 'green',
                          note: 'Avances que cuentan',
                        },
                      ].map((s) => (
                        <button
                          key={s.key}
                          className="card stat-card"
                          onClick={() => filter(() => setScope(s.key))}
                        >
                          <span className={`stat-icon tone-${s.color}`}>
                            <s.icon size={20} />
                          </span>
                          <span className="stat-label">{s.label}</span>
                          <strong>{s.value}</strong>
                          <small>{s.note}</small>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {project && (
                  <div className="folder-tabs">
                    <button
                      className={!folder ? 'active' : ''}
                      onClick={() => filter(() => setFolder(''))}
                    >
                      <LayoutGrid size={16} /> Todo el proyecto
                    </button>
                    {w.folders
                      .filter((f) => f.projectId === projectId)
                      .map((f) => (
                        <button
                          key={f.id}
                          className={folder === f.id ? 'active' : ''}
                          onClick={() => filter(() => setFolder(f.id))}
                        >
                          <Folder size={16} />
                          {f.name}
                        </button>
                      ))}
                    {permissions.includes('projects') && (
                      <button onClick={() => navigate('settings')}>
                        <SettingsIcon size={16} /> Organizar
                      </button>
                    )}
                  </div>
                )}
                <section className="work-section">
                  <div className="section-heading">
                    <div>
                      <h2>
                        {route === 'inbox' ? 'Los pendientes del equipo' : 'Pendientes'}{' '}
                        <span className="count">{result.total}</span>
                      </h2>
                      <p className="muted small">
                        {sort === 'priority'
                          ? 'Lo más importante aparece primero.'
                          : sort === 'due'
                            ? 'Ordenados por fecha límite.'
                            : 'Los reportes más recientes aparecen primero.'}
                      </p>
                    </div>
                    <div className="view-switch">
                      <button
                        className={view === 'list' ? 'active' : ''}
                        aria-label="Vista de lista"
                        onClick={() => setView('list')}
                      >
                        <List size={17} />
                        <span>Lista</span>
                      </button>
                      <button
                        className={view === 'board' ? 'active' : ''}
                        aria-label="Vista de tablero"
                        onClick={() => {
                          setView('board');
                          setScope('all');
                          setPage(1);
                        }}
                      >
                        <LayoutGrid size={17} />
                        <span>Tablero</span>
                      </button>
                    </div>
                  </div>
                  <div className="filter-bar">
                    <div className="search-field">
                      <Search size={18} />
                      <input
                        aria-label="Buscar pendientes"
                        placeholder="Buscar un pendiente…"
                        value={search}
                        maxLength={200}
                        onChange={(e) => filter(() => setSearch(e.target.value))}
                      />
                      {search && (
                        <button
                          aria-label="Limpiar búsqueda"
                          onClick={() => filter(() => setSearch(''))}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    {!projectId && (
                      <select
                        aria-label="Filtrar por proyecto"
                        value=""
                        onChange={(e) => navigate(`project/${e.target.value}`)}
                      >
                        <option value="">Todos los proyectos</option>
                        {w.projects
                          .filter((p) => !p.archived)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    )}
                    {projectId && (
                      <select
                        aria-label="Filtrar por estado"
                        value={status}
                        onChange={(e) => filter(() => setStatus(e.target.value))}
                      >
                        <option value="">Todos los estados</option>
                        {w.statuses
                          .filter((s) => s.projectId === projectId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    )}
                    <select
                      aria-label="Filtrar por etiqueta"
                      value={tag}
                      onChange={(e) => filter(() => setTag(e.target.value))}
                    >
                      <option value="">Todas las etiquetas</option>
                      {w.tags.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filtrar por prioridad"
                      value={priority}
                      onChange={(e) => filter(() => setPriority(e.target.value))}
                    >
                      <option value="">Toda prioridad</option>
                      {priorities.map((p, i) => (
                        <option key={p} value={i}>
                          {p}
                        </option>
                      ))}
                    </select>
                    {route !== 'mine' && route !== 'archived' && (
                      <select
                        aria-label="Mostrar pendientes"
                        value={scope}
                        onChange={(e) => filter(() => setScope(e.target.value))}
                      >
                        <option value="open">Por resolver</option>
                        <option value="all">Todos</option>
                        <option value="done">Resueltos</option>
                        <option value="urgent">Alta prioridad</option>
                        <option value="overdue">Fuera de fecha</option>
                        <option value="reported">Reportados por mí</option>
                      </select>
                    )}
                    <select
                      aria-label="Ordenar pendientes"
                      value={sort}
                      onChange={(e) => filter(() => setSort(e.target.value))}
                    >
                      <option value="priority">Por prioridad</option>
                      <option value="due">Por fecha límite</option>
                      <option value="newest">Más recientes</option>
                    </select>
                    <button
                      className="btn-icon"
                      aria-label="Limpiar filtros"
                      onClick={clearFilters}
                    >
                      <RefreshCw size={17} />
                    </button>
                  </div>
                  {loading && (
                    <div className="loading-line" role="status">
                      Actualizando pendientes…
                    </div>
                  )}
                  {view === 'board' && !projectId ? (
                    <div className="card">
                      <Empty
                        icon={<LayoutGrid size={32} />}
                        title="Cada proyecto tiene su propio recorrido"
                      >
                        Selecciona un proyecto en el filtro para ver su tablero con los estados
                        personalizados.
                      </Empty>
                    </div>
                  ) : !result.items.length && !loading ? (
                    <div className="card">
                      <Empty
                        icon={<CheckCheck size={36} />}
                        title={
                          w.projects.some((p) => !p.archived)
                            ? 'Todo despejado por aquí'
                            : 'Empecemos por tu primer proyecto'
                        }
                      >
                        {w.projects.some((p) => !p.archived)
                          ? 'No hay pendientes con estos filtros. Puedes cambiar la búsqueda o registrar un nuevo hallazgo.'
                          : permissions.includes('projects')
                            ? 'Ve a Proyectos y crea el espacio para tu primer producto.'
                            : 'Pide a alguien con permiso de Proyectos que cree uno en este espacio.'}
                      </Empty>
                    </div>
                  ) : view === 'board' ? (
                    <div className="board">
                      {w.statuses
                        .filter((s) => s.projectId === projectId)
                        .map((s) => (
                          <section className="board-column" key={s.id}>
                            <div className="board-heading">
                              <Badge color={s.color}>{s.name}</Badge>
                              <span>{result.items.filter((t) => t.statusId === s.id).length}</span>
                            </div>
                            {result.items
                              .filter((t) => t.statusId === s.id)
                              .map((t) => (
                                <TaskCard
                                  key={t.id}
                                  task={t}
                                  w={w}
                                  board
                                  onOpen={() => openTask(t.id)}
                                />
                              ))}
                            {!result.items.some((t) => t.statusId === s.id) && (
                              <div className="column-empty">Sin pendientes en esta página</div>
                            )}
                          </section>
                        ))}
                    </div>
                  ) : (
                    <div className="task-list">
                      {result.items.map((t) => (
                        <TaskCard key={t.id} task={t} w={w} onOpen={() => openTask(t.id)} />
                      ))}
                    </div>
                  )}
                  {result.total > 50 && (
                    <div className="pagination">
                      <span>
                        {(page - 1) * 50 + 1}–{Math.min(page * 50, result.total)} de {result.total}{' '}
                        · El tablero muestra esta página
                      </span>
                      <button
                        className="btn btn-ghost"
                        disabled={page === 1 || loading}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Anterior
                      </button>
                      <button
                        className="btn btn-ghost"
                        disabled={page * 50 >= result.total || loading}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                  <div className="list-footer">
                    <span>
                      <ShieldCheck size={14} /> Un espacio compartido, siempre en sintonía
                    </span>
                    <span>Se actualiza cuando tu equipo hace cambios</span>
                  </div>
                </section>
              </>
            )}
            {editor && (
              <TaskEditor
                key={editor}
                id={editor === 'new' ? undefined : editor}
                projectId={projectId}
                folderId={folder}
                workspace={w}
                user={user}
                onClose={closeTask}
                onDeleted={() => {
                  closeTask();
                  setRevision((r) => r + 1);
                }}
                onSaved={(t) => {
                  setRevision((r) => r + 1);
                  if (editor === 'new') openTask(t.id);
                }}
                notify={notify}
              />
            )}
            {projectModal && (
              <CatalogEditor
                kind="projects"
                value={{}}
                onClose={() => setProjectModal(false)}
                onSaved={async () => {
                  await reload();
                  notify('Proyecto creado. Ya puedes agregar pendientes.');
                }}
              />
            )}
          </>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Navegación móvil">
        {navigation(true)}
        <button className="nav-item" onClick={() => setMoreMenu(true)}>
          <MoreHorizontal size={21} />
          <span>Más</span>
        </button>
      </nav>
      {moreMenu && (
        <Modal title="Más opciones" onClose={() => setMoreMenu(false)}>
          <div className="modal-body mobile-menu">
            {navigation()}
            <button className="sidebar-link" onClick={() => navigate('account')}>
              Mi cuenta
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {installHelp && (
        <Modal title="Instala AegiTasks" onClose={() => setInstallHelp(false)}>
          <div className="modal-body">
            {install && (
              <button
                className="btn btn-primary"
                onClick={() => void installApp().catch((e) => setError(errorMessage(e)))}
              >
                <ArrowDownToLine size={18} /> Instalar ahora
              </button>
            )}
            <p>
              En Chrome o Edge, abre el menú del navegador y elige{' '}
              <strong>Instalar aplicación</strong>.
            </p>
            <p className="subsection">
              En iPhone o iPad, abre la app en Safari, toca <strong>Compartir</strong> y luego{' '}
              <strong>Agregar a inicio</strong>.
            </p>
            <p className="muted subsection">
              La instalación requiere HTTPS o localhost. Si ya está instalada, puedes abrirla desde
              tus aplicaciones.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function TaskCard({
  task: t,
  w,
  board,
  onOpen,
}: {
  task: TaskItem;
  w: Workspace;
  board?: boolean;
  onOpen: () => void;
}) {
  const status = w.statuses.find((s) => s.id === t.statusId);
  const project = w.projects.find((p) => p.id === t.projectId);
  const assignee = w.users.find((u) => u.id === t.assigneeId);
  const overdue = t.dueDate && t.dueDate < localDate() && !status?.isDone;
  return (
    <button
      className={`task-card ${board ? 'board-task' : ''} ${status?.isDone ? 'task-done' : ''}`}
      onClick={onOpen}
      aria-label={`Abrir pendiente: ${t.title}`}
    >
      <span className={`task-state ${status?.isDone ? 'done' : ''}`}>
        {status?.isDone ? <CircleCheck size={23} /> : <Circle size={23} />}
      </span>
      <div className="task-main">
        <div className="task-context">
          <span className={`project-dot tone-${project?.color || 'purple'}`} />
          {project?.name}
          {t.folderId && (
            <>
              <ChevronRight size={12} />
              {w.folders.find((f) => f.id === t.folderId)?.name}
            </>
          )}
          <span className="task-id">#{t.id.slice(0, 6)}</span>
        </div>
        <h3>{t.title}</h3>
        <div className="task-tags">
          {t.tags.map((tag) => (
            <Badge key={tag.id} color={tag.color}>
              {tag.name}
            </Badge>
          ))}
          {board && (
            <Badge color={priorityColors[t.priority || 0]}>{priorities[t.priority || 0]}</Badge>
          )}
        </div>
      </div>
      <div className="task-status">
        <Badge color={status?.color}>{status?.name}</Badge>
      </div>
      <div className="task-priority">
        <Badge color={priorityColors[t.priority || 0]}>{priorities[t.priority || 0]}</Badge>
      </div>
      <div className={`task-date ${overdue ? 'overdue' : ''}`}>
        <span>
          <CalendarDays size={14} />
          {t.dueDate ? dateLabel(t.dueDate) : 'Sin fecha'}
          {overdue && ' · Vencido'}
        </span>
        {t.estimateMinutes && (
          <small>
            <Clock3 size={12} />
            {t.estimateMinutes} min
          </small>
        )}
      </div>
      <div className="task-assignee" title={assignee?.name || 'Sin asignar'}>
        {assignee ? (
          <span className="avatar small-avatar">{initials(assignee.name)}</span>
        ) : (
          <UserRound size={19} />
        )}
        <span className="sr-only">{assignee?.name || 'Sin asignar'}</span>
      </div>
    </button>
  );
}
