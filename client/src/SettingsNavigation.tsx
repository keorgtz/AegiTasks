import { useEffect, useId, useState } from 'react';
import {
  ChevronDown,
  Bell,
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
  if (route === 'account') return 'settings/account';
  return route || 'inbox';
}

export function pageForRoute(route: string) {
  if (route.startsWith('reminders/')) return 'reminders';
  if (route.startsWith('chat/')) return 'chat';
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
        'settings/notifications': 'account',
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
    description: 'Proyectos, carpetas, estados y etiquetas.',
    group: 'Equipo',
  },
  {
    id: 'settings/workspace',
    name: 'Workspace',
    permission: 'spaces',
    icon: Globe2,
    description: 'Espacios, miembros e invitaciones.',
    group: 'Equipo',
  },
  {
    id: 'settings/users',
    name: 'Usuarios y roles',
    permission: 'users',
    icon: ShieldCheck,
    description: 'Cuentas y acceso a las páginas.',
    group: 'Administración',
  },
  {
    id: 'settings/account',
    name: 'Mi cuenta',
    permission: 'account',
    icon: LockKeyhole,
    description: 'Tu identidad y seguridad.',
    group: 'Personales',
  },
  {
    id: 'settings/notifications',
    name: 'Notificaciones',
    permission: 'account',
    icon: Bell,
    description: 'Avisos en esta computadora o teléfono.',
    group: 'Personales',
  },
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
  const sections = allowedSettings(permissions);
  const groups = ['Personales', 'Equipo', 'Administración'];
  return (
    <nav className="settings-navigation" aria-label="Secciones de ajustes">
      <label className="settings-mobile-picker">
        Sección de ajustes
        <select
          aria-label="Sección de ajustes"
          value={route}
          onChange={(e) => navigate(e.target.value)}
        >
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {sections
                .filter((item) => item.group === group)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="settings-desktop-sections">
        {groups
          .filter((group) => sections.some((item) => item.group === group))
          .map((group) => (
            <div key={group} className="settings-nav-group">
              <p>{group}</p>
              {sections
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    key={item.id}
                    className="settings-section-link"
                    aria-label={item.name}
                    aria-current={route === item.id ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <item.icon size={17} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
            </div>
          ))}
      </div>
    </nav>
  );
}
