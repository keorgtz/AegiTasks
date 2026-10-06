import { CalendarDays, CalendarRange, Columns3, LayoutGrid, List } from 'lucide-react';
import './styles/view-picker.css';

export type Layout = 'gallery' | 'list' | 'board' | 'timeline' | 'calendar';
export const layouts = [
  { id: 'gallery', label: 'Tarjetas', icon: LayoutGrid },
  { id: 'list', label: 'Lista', icon: List },
  { id: 'board', label: 'Tablero', icon: Columns3 },
  { id: 'timeline', label: 'Cronología', icon: CalendarRange },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
] as const;

export function ViewPicker({
  value,
  onChange,
  context = 'groups',
}: {
  value: string;
  onChange: (value: Layout) => void;
  context?: 'tasks' | 'groups' | 'group-tasks';
}) {
  return (
    <div
      className="view-picker planning-layouts"
      role="group"
      aria-label={
        context === 'tasks'
          ? 'Vista de pendientes'
          : context === 'group-tasks'
            ? 'Vista de pendientes de la agrupación'
            : 'Vista de agrupaciones'
      }
    >
      {layouts
        .filter((item) =>
          context === 'groups'
            ? item.id !== 'calendar'
            : context !== 'group-tasks' || ['list', 'board', 'calendar'].includes(item.id),
        )
        .map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className="btn-icon"
            title={label}
            aria-label={context === 'tasks' ? 'Vista de ' + label.toLowerCase() : label}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <Icon size={18} />
          </button>
        ))}
    </div>
  );
}
