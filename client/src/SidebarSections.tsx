import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

export function SidebarSections({
  label,
  navigation,
  projects,
  createProject,
}: {
  label: string;
  navigation: ReactNode;
  projects: ReactNode;
  createProject?: () => void;
}) {
  const [open, setOpen] = useState<'workspace' | 'projects' | null>('workspace');
  const [page, setPage] = useState(0);
  const [capacity, setCapacity] = useState(5);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setCapacity(Math.max(1, Math.floor((element.clientHeight - 48) / 44))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);
  const items = Children.toArray(open === 'workspace' ? navigation : projects);
  const pages = Math.max(1, Math.ceil(items.length / capacity));
  const current = Math.min(page, pages - 1);
  const toggle = (section: 'workspace' | 'projects') => {
    setOpen(open === section ? null : section);
    setPage(0);
  };
  const content = (
    <div className="sidebar-panel" ref={panel} id={`sidebar-${open}`}>
      <nav aria-label={open === 'workspace' ? 'Navegación principal' : 'Proyectos'}>
        {items.slice(current * capacity, (current + 1) * capacity)}
      </nav>
      {pages > 1 && (
        <div className="sidebar-pages">
          <button
            className="btn-icon"
            aria-label="Opciones anteriores"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <small>
            {current + 1} / {pages}
          </small>
          <button
            className="btn-icon"
            aria-label="Más opciones"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
  return (
    <div className="sidebar-sections">
      <button
        className="sidebar-section-toggle"
        aria-expanded={open === 'workspace'}
        aria-controls="sidebar-workspace"
        onClick={() => toggle('workspace')}
      >
        <span>{label}</span>
        <ChevronDown size={16} />
      </button>
      {open === 'workspace' && content}
      <div className="sidebar-project-heading">
        <button
          className="sidebar-section-toggle"
          aria-expanded={open === 'projects'}
          aria-controls="sidebar-projects"
          onClick={() => toggle('projects')}
        >
          <span>PROYECTOS</span>
          <ChevronDown size={16} />
        </button>
        {createProject && (
          <button className="btn-icon" aria-label="Nuevo proyecto" onClick={createProject}>
            <Plus size={17} />
          </button>
        )}
      </div>
      {open === 'projects' && content}
    </div>
  );
}
