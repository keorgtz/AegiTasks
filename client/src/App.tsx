import { useCallback, useEffect, useState, lazy, Suspense, type FormEvent } from 'react';
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
  FolderTree,
  Inbox,
  LayoutGrid,
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
  MoreHorizontal,
  SlidersHorizontal,
} from 'lucide-react';
import { api, ApiError, errorMessage, setActiveSpace } from './api';
import { useChanges } from './changes';
import { ProjectTreeMenu, SidebarSections } from './SidebarSections';
import { Badge, Brand, Empty, ErrorBox, Field, Modal } from './components';
import { CatalogEditor, Settings } from './Settings';
import { TaskEditor } from './TaskEditor';
import { TaskFilters, type TaskFilterValues } from './TaskFilters';
import { ProjectPlanning } from './ProjectPlanning';
import { PlanningPage } from './PlanningPage';
import { estimateLabel } from './estimates';
import { ViewPicker, layouts, type Layout } from './ViewPicker';
import { TaskGallery, TaskTimeline } from './TaskViews';
import {
  SettingsDisclosure,
  SettingsNavigation,
  normalizeRoute,
  pageForRoute,
  settingsSections,
} from './SettingsNavigation';
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
      onLogin(await api<User>('/auth/login', 'POST', { identifier: email, password }));
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
          <form onSubmit={submit} data-update-blocked={!!email || !!password || busy}>
            <fieldset disabled={busy}>
              <Field label="Correo o nombre de usuario">
                <input
                  type="text"
                  required
                  maxLength={200}
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@equipo.com o tu usuario"
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
  const [projectMenu, setProjectMenu] = useState(false);
  const routePage = pageForRoute;
  const [w, setWorkspace] = useState<Workspace | null>(null);
  const [route, setRoute] = useState(() => normalizeRoute(location.hash.slice(1)));
  useEffect(() => {
    const raw = location.hash.slice(1);
    const normalized = normalizeRoute(raw);
    if (raw && raw !== normalized) history.replaceState(null, '', '#' + normalized);
  }, []);
  const [folder, setFolder] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [cycleFilter, setCycleFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsProject, setSettingsProject] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [priority, setPriority] = useState('');
  const [scope, setScope] = useState('open');
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const assignee = assigneeFilter ?? (route === 'inbox' ? 'mine-or-unassigned' : 'all');
  const [sort, setSort] = useState('priority');
  const viewKey =
    'aegitasks-task-view-' +
    user.id +
    '-' +
    space.id +
    '-' +
    (route.startsWith('project/') ? route.split('/').slice(0, 2).join('/') : route);
  const readView = (key: string): Layout => {
    try {
      const stored = localStorage.getItem(key);
      return layouts.some((layout) => layout.id === stored) ? (stored as Layout) : 'list';
    } catch {
      return 'list';
    }
  };
  const [view, setView] = useState<Layout>(() => readView(viewKey));
  useEffect(() => setView(readView(viewKey)), [viewKey]);
  const chooseView = (value: Layout) => {
    setView(value);
    try {
      localStorage.setItem(viewKey, value);
    } catch {
      /* The view remains available. */
    }
  };
  const summaryKey = 'aegitasks-inbox-summary-' + user.id + '-' + space.id;
  const [summaryVisibility, setSummaryVisibility] = useState<{ banner: boolean; metrics: boolean }>(
    () => {
      try {
        const stored = JSON.parse(localStorage.getItem(summaryKey) || 'null');
        if (stored && typeof stored.banner === 'boolean' && typeof stored.metrics === 'boolean')
          return stored;
      } catch {
        /* Ignore an invalid preference. */
      }
      return { banner: true, metrics: true };
    },
  );
  const toggleSummary = (part: 'banner' | 'metrics') =>
    setSummaryVisibility((previous) => {
      const next = { ...previous, [part]: !previous[part] };
      try {
        localStorage.setItem(summaryKey, JSON.stringify(next));
      } catch {
        /* Controls remain available. */
      }
      return next;
    });
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
  const [parentTask, setParentTask] = useState<TaskItem | null>(null);
  const [projectModal, setProjectModal] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const projectId = route.startsWith('project/') ? route.split('/')[1] || '' : '';
  const planningKind = ['modules', 'cycles'].includes(route.split('/')[2] || '')
    ? (route.split('/')[2] as 'modules' | 'cycles')
    : null;
  const planningGroupId = planningKind ? route.split('/')[3] || '' : '';
  const taskProjectId = projectId || projectFilter;
  const project = w?.projects.find((p) => p.id === projectId);
  useEffect(() => {
    if (w && projectId && !w.projects.some((p) => p.id === projectId))
      location.hash = permissions.includes('projects') ? 'projects' : 'inbox';
  }, [w, projectId, permissions]);
  useEffect(() => {
    if (w && projectFilter && !w.projects.some((p) => p.id === projectFilter)) {
      setProjectFilter('');
      setFolder('');
      setModuleFilter('');
      setCycleFilter('');
      setStatus('');
      setPage(1);
      setFiltersOpen(false);
    }
  }, [w, projectFilter]);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    if (
      w &&
      moduleFilter &&
      moduleFilter !== 'none' &&
      !w.modules.some((m) => m.id === moduleFilter)
    )
      setModuleFilter('');
    if (w && cycleFilter && cycleFilter !== 'none' && !w.cycles.some((m) => m.id === cycleFilter))
      setCycleFilter('');
  }, [w, moduleFilter, cycleFilter]);
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
      const normalized = normalizeRoute(location.hash.slice(1));
      if (location.hash.slice(1) !== normalized) history.replaceState(null, '', '#' + normalized);
      setRoute(normalized);
      setAssigneeFilter(null);
      setProjectFilter('');
      setFiltersOpen(false);
      setFolder('');
      setModuleFilter('');
      setCycleFilter('');
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
      !(['inbox', 'archived'].includes(route) || (route.startsWith('project/') && !planningKind))
    )
      return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      scope: route === 'archived' ? 'archived' : scope,
      sort,
      page: String(page),
      assignee,
    });
    if (taskProjectId) params.set('project', taskProjectId);
    if (folder) params.set('folder', folder);
    if (moduleFilter) params.set('module', moduleFilter);
    if (cycleFilter) params.set('cycle', cycleFilter);
    if (status) params.set('status', status);
    if (tag) params.set('tag', tag);
    if (priority) params.set('priority', priority);
    if (query) params.set('q', query);
    Promise.all([
      api<TaskPage>(`/tasks?${params}`, 'GET', undefined, controller.signal),
      api<Summary>(
        `/tasks/summary?assignee=${encodeURIComponent(assignee)}`,
        'GET',
        undefined,
        controller.signal,
      ),
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
    taskProjectId,
    folder,
    moduleFilter,
    cycleFilter,
    status,
    tag,
    priority,
    query,
    scope,
    assignee,
    sort,
    page,
    route,
    revision,
    online,
    permissions,
    planningKind,
  ]);
  const navigate = (to: string) => {
    setMoreMenu(false);
    setProjectMenu(false);
    setFiltersOpen(false);
    setProjectFilter('');
    setAssigneeFilter(null);
    if (to === 'settings' && projectId) setSettingsProject(projectId);
    location.hash = normalizeRoute(to);
    setPage(1);
    setFolder('');
    setModuleFilter('');
    setCycleFilter('');
    setStatus('');
    setSearch('');
    setQuery('');
    setTag('');
    setPriority('');
    setScope('open');
  };
  const closeTask = () => {
    setEditor(null);
    setParentTask(null);
    const url = new URL(location.href);
    url.searchParams.delete('task');
    history.replaceState(null, '', url);
  };
  const openTask = (id: string) => {
    setParentTask(null);
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
  const applyFilters = (values: TaskFilterValues) => {
    setProjectFilter(projectId ? '' : values.project);
    setFolder(values.folder);
    setModuleFilter(values.module);
    setCycleFilter(values.cycle);
    setStatus(values.status);
    setAssigneeFilter(values.assignee);
    setTag(values.tag);
    setPriority(values.priority);
    setScope(values.scope);
    setSort(values.sort);
    setPage(1);
    setFiltersOpen(false);
  };
  const filterCount = [
    !projectId && projectFilter,
    folder,
    moduleFilter,
    cycleFilter,
    status,
    tag,
    priority,
    route !== 'archived' && scope !== 'open',
    assignee !== (route === 'inbox' ? 'mine-or-unassigned' : 'all'),
    sort !== 'priority',
  ].filter(Boolean).length;
  const nav = [
    { id: 'inbox', name: 'Bandeja', icon: Inbox },
    { id: 'notes', name: 'Notas', icon: FileText },
    { id: 'focus', name: 'Focus', icon: Timer },
  ];
  const navigation = (mobile = false) => (
    <>
      {nav
        .filter(
          (n) =>
            permissions.includes(routePage(n.id)) &&
            (!mobile || ['inbox', 'notes', 'focus'].includes(n.id)),
        )
        .map((n) => (
          <button
            key={n.id}
            className={`${mobile ? 'nav-item' : 'sidebar-link'} ${route === n.id || (n.id === 'notes' && route.startsWith('notes/')) ? 'active' : ''}`}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={21} />
            <span>{n.name}</span>
            {!mobile && n.id === 'inbox' && <span className="nav-count">{summary.open}</span>}
          </button>
        ))}
      {!mobile && (
        <SettingsDisclosure route={route} permissions={permissions} navigate={navigate} />
      )}
    </>
  );
  const title = project?.name || (route === 'archived' ? 'Archivados' : 'Tu bandeja');
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Ir al contenido
      </a>
      <aside className="sidebar">
        <Brand onInstall={() => setInstallHelp(true)} />
        <SidebarSections
          label={space.isPersonal ? 'MI ESPACIO' : 'WORKSPACE COMPARTIDO'}
          navigation={navigation()}
          preferenceKey={'aegitasks-sidebar-' + user.id + '-' + space.id}
          catalogActive={route === 'projects'}
          createProject={permissions.includes('projects') ? () => setProjectModal(true) : undefined}
          projects={
            w?.projects.filter(
              (p) =>
                !p.archived && (permissions.includes('tasks') || permissions.includes('projects')),
            ) || []
          }
          activeProjectId={projectId}
          activeSection={planningKind || ''}
          canTasks={permissions.includes('tasks')}
          canProjects={permissions.includes('projects')}
          navigate={navigate}
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
        <div className="header-context">
          <SpaceSelector spaces={spaceSession.spaces} active={space} onChange={switchSpace} />
          <div className="breadcrumb">
            <ChevronRight size={15} />
            <strong>
              {nav.find((n) => n.id === (route.startsWith('notes/') ? 'notes' : route))?.name ||
                (route === 'account'
                  ? 'Mi cuenta'
                  : route === 'projects'
                    ? 'Proyectos'
                    : settingsSections.find((item) => item.id === route)?.name || title)}
            </strong>
          </div>
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
            {project && (permissions.includes('tasks') || permissions.includes('projects')) && (
              <button
                className="btn btn-ghost project-navigation-mobile"
                aria-label="Explorar proyecto"
                onClick={() => setProjectMenu(true)}
              >
                <FolderTree size={17} /> Explorar proyecto
              </button>
            )}
            {routePage(route) !== 'account' && !permissions.includes(routePage(route)) ? (
              <section className="card">
                <Empty icon={<ShieldCheck size={32} />} title="Página sin acceso">
                  Tu rol no tiene permiso para esta página.
                </Empty>
                <button className="btn btn-ghost" onClick={() => navigate('account')}>
                  Mi cuenta
                </button>
              </section>
            ) : route === 'notes' || route.startsWith('notes/') ? (
              <Suspense fallback={<p>Cargando notas…</p>}>
                <NotesPage
                  editorId={route.startsWith('notes/') ? route.slice(6) : null}
                  onSavedRoute={(id) => {
                    history.replaceState(null, '', `#notes/${id}`);
                    setRoute(`notes/${id}`);
                  }}
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
            ) : route.startsWith('settings/') || route === 'account' ? (
              <>
                {route !== 'account' && (
                  <SettingsNavigation route={route} permissions={permissions} navigate={navigate} />
                )}
                {route === 'settings/workspace' ? (
                  <SpacesPage
                    user={user}
                    active={space}
                    session={spaceSession}
                    reload={reloadSpaces}
                    switchSpace={switchSpace}
                  />
                ) : route === 'settings/users' ? (
                  <AdminAccess />
                ) : (
                  <Settings
                    key={route}
                    workspace={w}
                    user={user}
                    reload={reload}
                    notify={notify}
                    logout={logout}
                    initialProject={settingsProject}
                    canOrganize={permissions.includes('projects')}
                    mode={routePage(route) === 'account' ? 'account' : 'organization'}
                  />
                )}
                <section className="card mobile-tools">
                  <h2>La app, siempre a mano</h2>
                  {permissions.includes('tasks') && (
                    <button className="btn btn-ghost" onClick={() => navigate('archived')}>
                      <Archive size={17} /> Ver archivados
                    </button>
                  )}
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
                      <article key={p.id} className="card project-card">
                        <button
                          className="project-card-button"
                          onClick={() =>
                            navigate(
                              `project/${p.id}${permissions.includes('tasks') ? '' : '/modules'}`,
                            )
                          }
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
                            {p.description ||
                              'Todo lo que necesita este proyecto, en un solo lugar.'}
                          </p>
                          <div className="project-card-foot">
                            <span>
                              {w.folders.filter((f) => f.projectId === p.id).length} carpetas
                            </span>
                            <ArrowRight size={19} />
                          </div>
                        </button>
                        <div className="project-card-section-links">
                          <button
                            className="btn btn-ghost"
                            onClick={() => navigate(`project/${p.id}/modules`)}
                          >
                            Módulos · {w.modules.filter((m) => m.projectId === p.id).length}
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => navigate(`project/${p.id}/cycles`)}
                          >
                            Ciclos · {w.cycles.filter((c) => c.projectId === p.id).length}
                          </button>
                        </div>
                      </article>
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
            ) : planningKind && project ? (
              <PlanningPage
                key={`${project.id}-${planningKind}`}
                project={project}
                kind={planningKind}
                groupId={planningGroupId}
                workspace={w}
                userId={user.id}
                canTasks={permissions.includes('tasks')}
                taskRevision={revision}
                navigate={navigate}
                onSaved={reload}
                onOpenTask={openTask}
                onNewTask={(kind, id) => {
                  setModuleFilter(kind === 'modules' ? id : '');
                  setCycleFilter(kind === 'cycles' ? id : '');
                  setFolder('');
                  setEditor('new');
                }}
              />
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
                        (route === 'archived'
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
                    <div
                      className="inbox-summary-controls"
                      role="group"
                      aria-label="Visibilidad del resumen de la bandeja"
                    >
                      <button
                        className="btn btn-ghost"
                        aria-expanded={summaryVisibility.banner}
                        aria-controls="inbox-welcome"
                        onClick={() => toggleSummary('banner')}
                      >
                        {summaryVisibility.banner ? 'Ocultar bienvenida' : 'Mostrar bienvenida'}
                      </button>
                      <button
                        className="btn btn-ghost"
                        aria-expanded={summaryVisibility.metrics}
                        aria-controls="inbox-metrics"
                        onClick={() => toggleSummary('metrics')}
                      >
                        {summaryVisibility.metrics ? 'Ocultar indicadores' : 'Mostrar indicadores'}
                      </button>
                    </div>
                    {summaryVisibility.banner && (
                      <section className="hero" id="inbox-welcome">
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
                              {Math.round(
                                (summary.done / (summary.open + summary.done || 1)) * 100,
                              )}
                              <small>%</small>
                            </strong>
                            <span>resueltos</span>
                          </div>
                        </div>
                      </section>
                    )}
                    {summaryVisibility.metrics && (
                      <div className="stats-grid" id="inbox-metrics">
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
                    )}
                  </>
                )}
                {project && permissions.includes('projects') && (
                  <ProjectPlanning
                    key={project.id}
                    project={project}
                    workspace={w}
                    onSaved={reload}
                    onShowTasks={(kind, id) => {
                      setModuleFilter(kind === 'modules' ? id : '');
                      setCycleFilter(kind === 'cycles' ? id : '');
                      setFolder('');
                      setStatus('');
                      setTag('');
                      setPriority('');
                      setSearch('');
                      setQuery('');
                      setAssigneeFilter('all');
                      setScope('all');
                      setPage(1);
                      document
                        .querySelector('.work-section')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  />
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
                        {route === 'inbox' && assignee === 'mine-or-unassigned'
                          ? 'Tus pendientes y los que puedes tomar'
                          : 'Pendientes'}{' '}
                        <span className="count">{result.total}</span>
                      </h2>
                      <p className="muted small">
                        {view === 'timeline'
                          ? 'Cronología de las fechas límite de esta página.'
                          : sort === 'priority'
                            ? 'Lo más importante aparece primero.'
                            : sort === 'due'
                              ? 'Ordenados por fecha límite.'
                              : 'Los reportes más recientes aparecen primero.'}
                      </p>
                    </div>
                    <ViewPicker value={view} onChange={chooseView} context="tasks" />
                  </div>
                  <div className="task-search-bar">
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
                    <button
                      className="btn btn-ghost"
                      aria-label="Abrir filtros"
                      aria-haspopup="dialog"
                      onClick={() => setFiltersOpen(true)}
                    >
                      <SlidersHorizontal size={18} /> Filtros
                      {filterCount > 0 && (
                        <span
                          className="task-filter-count"
                          aria-label={`${filterCount} filtros activos`}
                        >
                          {filterCount}
                        </span>
                      )}
                    </button>
                  </div>
                  {filtersOpen && (
                    <TaskFilters
                      initial={{
                        project: taskProjectId,
                        folder,
                        module: moduleFilter,
                        cycle: cycleFilter,
                        status,
                        assignee,
                        tag,
                        priority,
                        scope,
                        sort,
                      }}
                      workspace={w}
                      route={route}
                      projectId={projectId}
                      onClose={() => setFiltersOpen(false)}
                      onApply={applyFilters}
                    />
                  )}
                  {loading && (
                    <div className="loading-line" role="status">
                      Actualizando pendientes…
                    </div>
                  )}
                  {!result.items.length && !loading ? (
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
                  ) : view === 'gallery' ? (
                    <TaskGallery
                      tasks={result.items}
                      renderTask={(task) => (
                        <TaskCard task={task} w={w} board onOpen={() => openTask(task.id)} />
                      )}
                    />
                  ) : view === 'timeline' ? (
                    <TaskTimeline tasks={result.items} workspace={w} onOpen={openTask} />
                  ) : view === 'board' ? (
                    <div className="project-boards">
                      {w.projects
                        .filter((p) =>
                          taskProjectId
                            ? p.id === taskProjectId
                            : result.items.some((t) => t.projectId === p.id),
                        )
                        .map((p) => (
                          <section
                            className="project-board"
                            key={p.id}
                            aria-label={`Tablero de ${p.name}`}
                          >
                            <h3 className="project-board-title">
                              {p.name}
                              <Badge color={p.color}>
                                {result.items.filter((t) => t.projectId === p.id).length} en esta
                                página
                              </Badge>
                            </h3>
                            <div
                              className="board"
                              tabIndex={0}
                              role="region"
                              aria-label={`Columnas de ${p.name}`}
                            >
                              {w.statuses
                                .filter((s) => s.projectId === p.id)
                                .map((s) => (
                                  <section className="board-column" key={s.id}>
                                    <div className="board-heading">
                                      <Badge color={s.color}>{s.name}</Badge>
                                      <span>
                                        {
                                          result.items.filter(
                                            (t) => t.projectId === p.id && t.statusId === s.id,
                                          ).length
                                        }
                                      </span>
                                    </div>
                                    {result.items
                                      .filter((t) => t.projectId === p.id && t.statusId === s.id)
                                      .map((t) => (
                                        <TaskCard
                                          key={t.id}
                                          task={t}
                                          w={w}
                                          board
                                          onOpen={() => openTask(t.id)}
                                        />
                                      ))}
                                    {!result.items.some(
                                      (t) => t.projectId === p.id && t.statusId === s.id,
                                    ) && (
                                      <div className="column-empty">
                                        Sin pendientes en esta página
                                      </div>
                                    )}
                                  </section>
                                ))}
                            </div>
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
                        · Todas las vistas muestran esta página
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
                key={`${editor}-${parentTask?.id || ''}`}
                id={editor === 'new' ? undefined : editor}
                projectId={parentTask?.projectId || taskProjectId}
                parentTask={parentTask}
                onNavigate={openTask}
                onCreateChild={(task) => {
                  setParentTask(task);
                  setEditor('new');
                  const url = new URL(location.href);
                  url.searchParams.delete('task');
                  history.replaceState(null, '', url);
                }}
                folderId={folder}
                moduleId={
                  planningKind === 'modules'
                    ? planningGroupId
                    : moduleFilter === 'none'
                      ? ''
                      : moduleFilter
                }
                cycleId={
                  planningKind === 'cycles'
                    ? planningGroupId
                    : cycleFilter === 'none'
                      ? ''
                      : cycleFilter
                }
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
            {permissions.includes('projects') && (
              <button className="sidebar-link" onClick={() => navigate('projects')}>
                <FolderKanban size={19} /> Proyectos
              </button>
            )}
            {(permissions.includes('tasks') || permissions.includes('projects')) && (
              <button
                className="sidebar-link"
                onClick={() => {
                  setMoreMenu(false);
                  setProjectMenu(true);
                }}
              >
                <FolderTree size={19} /> Explorar proyectos
              </button>
            )}
          </div>
        </Modal>
      )}
      {projectMenu && w && (
        <Modal title="Explorar proyectos" onClose={() => setProjectMenu(false)}>
          <div className="modal-body">
            <ProjectTreeMenu
              projects={w.projects.filter(
                (p) =>
                  !p.archived &&
                  (permissions.includes('tasks') || permissions.includes('projects')),
              )}
              activeProjectId={projectId}
              activeSection={planningKind || ''}
              canTasks={permissions.includes('tasks')}
              canProjects={permissions.includes('projects')}
              navigate={navigate}
            />
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
          {t.moduleId && <Badge>{w.modules.find((m) => m.id === t.moduleId)?.name}</Badge>}
          {t.cycleId && <Badge>{w.cycles.find((m) => m.id === t.cycleId)?.name}</Badge>}
          {t.parentTaskId && <Badge>Subpendiente</Badge>}
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
        {estimateLabel(t) && (
          <small>
            <Clock3 size={12} />
            {estimateLabel(t)}
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
