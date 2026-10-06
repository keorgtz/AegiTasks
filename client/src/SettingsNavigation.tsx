import { useEffect, useId, useState } from 'react';
import {
  ChevronDown,
  Globe2,
  LockKeyhole,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

export function normalizeRoute(route: string) {
  if (route === 'mine') return 'inbox';
  if (route === 'admin') return 'settings/users';
  if (route === 'spaces') return 'settings/workspace';
  if (route === 'settings') return 'settings/organization';
  return route || 'inbox';
}

export function pageForRoute(route: string) {
  if (route.startsWith('notes/')) return 'notes';
  if (route.startsWith('project/'))
    return ['modules', 'cycles'].includes(route.split('/')[2] || '') ? 'projects' : 'tasks';
  if (['inbox', 'archived'].includes(route)) return 'tasks';
  return (
    (
      {
        'settings/organization': 'settings',
        'settings/workspace': 'spaces',
        'settings/users': 'users',
        'settings/account': 'account',
      } as Record<string, string>
    )[route] || route
  );
}

export const settingsSections = [
  {
    id: 'settings/organization',
    name: 'Organización',
    permission: 'settings',
    icon: SlidersHorizontal,
  },
  { id: 'settings/workspace', name: 'Workspace', permission: 'spaces', icon: Globe2 },
  { id: 'settings/users', name: 'Usuarios y roles', permission: 'users', icon: ShieldCheck },
  { id: 'settings/account', name: 'Mi cuenta', permission: 'account', icon: LockKeyhole },
];
export const allowedSettings = (permissions: string[]) =>
  settingsSections.filter(
    (item) => item.permission === 'account' || permissions.includes(item.permission),
  );

export function SettingsDisclosure({
  route,
  permissions,
  navigate,
}: {
  route: string;
  permissions: string[];
  navigate: (route: string) => void;
}) {
  const active = route.startsWith('settings/');
  const menuId = useId();
  const [expanded, setExpanded] = useState(active);
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active, route]);
  return (
    <div className="settings-disclosure">
      <button
        className={`sidebar-link ${active ? 'active' : ''}`}
        aria-expanded={expanded}
        aria-controls={menuId}
        onClick={() => setExpanded((value) => !value)}
      >
        <Settings size={21} />
        <span>Ajustes</span>
        <ChevronDown size={16} className={expanded ? 'settings-chevron-open' : ''} />
      </button>
      <nav
        id={menuId}
        className="settings-submenu"
        aria-label="Submenú de ajustes"
        hidden={!expanded}
      >
        {allowedSettings(permissions).map((item) => (
          <button
            key={item.id}
            className="project-tree-link"
            aria-current={route === item.id ? 'page' : undefined}
            onClick={() => navigate(item.id)}
          >
            <item.icon size={16} />
            {item.name}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function SettingsNavigation({
  route,
  permissions,
  navigate,
}: {
  route: string;
  permissions: string[];
  navigate: (route: string) => void;
}) {
  return (
    <nav className="settings-navigation" aria-label="Secciones de ajustes">
      {allowedSettings(permissions).map((item) => (
        <button
          key={item.id}
          className="btn btn-ghost"
          aria-current={route === item.id ? 'page' : undefined}
          onClick={() => navigate(item.id)}
        >
          <item.icon size={17} />
          {item.name}
        </button>
      ))}
    </nav>
  );
}
