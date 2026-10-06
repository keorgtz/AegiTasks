import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Layers3, List, Plus, Repeat2 } from 'lucide-react';
import type { Project } from './types';
import './styles/project-tree.css';

const sections = [
  { id: '', name: 'Pendientes', icon: List },
  { id: 'modules', name: 'Módulos', icon: Layers3 },
  { id: 'cycles', name: 'Ciclos', icon: Repeat2 },
] as const;
type ProjectNavigationProps = {
  projects: Project[];
  activeProjectId: string;
  activeSection: string;
  canTasks: boolean;
  canProjects: boolean;
  navigate: (route: string) => void;
};
type TreeRow = { project: Project; section: string | null };
const availableSections = (canTasks: boolean, canProjects: boolean) =>
  sections.filter((s) => (s.id ? canProjects : canTasks));
function treeRows(
  projects: Project[],
  expandedId: string,
  canTasks: boolean,
  canProjects: boolean,
): TreeRow[] {
  return projects.flatMap((project) => [
    { project, section: null },
    ...(project.id === expandedId
      ? availableSections(canTasks, canProjects).map((s) => ({ project, section: s.id }))
      : []),
  ]);
}

function projectPages(rows: TreeRow[], capacity: number): TreeRow[][] {
  const pages: TreeRow[][] = [[]];
  for (const id of new Set(rows.map((row) => row.project.id))) {
    const group = rows.filter((row) => row.project.id === id);
    let current = pages[pages.length - 1]!;
    if (current.length && current.length + group.length > capacity) {
      current = [];
      pages.push(current);
    }
    for (const row of group) {
      if (current.length === capacity) {
        current = [];
        pages.push(current);
      }
      current.push(row);
    }
  }
  return pages;
}

function ProjectTreeRows({
  rows,
  expandedId,
  activeProjectId,
  activeSection,
  onToggle,
  navigate,
  prefix,
}: Omit<ProjectNavigationProps, 'projects' | 'canTasks' | 'canProjects'> & {
  rows: TreeRow[];
  expandedId: string;
  onToggle: (project: Project) => void;
  prefix: string;
}) {
  const ids = [...new Set(rows.map((r) => r.project.id))];
  return (
    <>
      {ids.map((id) => {
        const projectRows = rows.filter((r) => r.project.id === id);
        const project = projectRows[0]!.project;
        const expanded = expandedId === id;
        const children = projectRows.filter((r) => r.section !== null);
        const selected = activeProjectId === id;
        const controls = `${prefix}-project-${id}`;
        return (
          <div className="project-tree-node" key={id}>
            {projectRows.some((r) => r.section === null) && (
              <button
                className={`project-link ${selected ? 'active' : ''}`}
                aria-expanded={expanded}
                aria-controls={controls}
                onClick={() => onToggle(project)}
              >
                <span className={`project-dot tone-${project.color}`} />
                <span>{project.name}</span>
                <ChevronRight size={15} className={expanded ? 'project-chevron-open' : ''} />
              </button>
            )}
            <nav
              className="project-tree-children"
              id={controls}
              hidden={!expanded || !children.length}
              aria-label={selected ? 'Secciones del proyecto' : `Secciones de ${project.name}`}
            >
              {children.map((row) => {
                const section = sections.find((s) => s.id === row.section)!;
                return (
                  <button
                    className="project-tree-link"
                    key={section.id}
                    aria-current={selected && activeSection === section.id ? 'page' : undefined}
                    onClick={() => navigate(`project/${id}${section.id ? `/${section.id}` : ''}`)}
                  >
                    <section.icon size={16} />
                    <span>{section.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        );
      })}
    </>
  );
}

export function ProjectTreeMenu(props: ProjectNavigationProps) {
  const [expandedId, setExpandedId] = useState(props.activeProjectId);
  useEffect(() => setExpandedId(props.activeProjectId), [props.activeProjectId]);
  function toggle(project: Project) {
    const opening = expandedId !== project.id;
    setExpandedId(opening ? project.id : '');
  }
  return (
    <nav className="project-tree-menu" aria-label="Proyectos del espacio">
      <ProjectTreeRows
        {...props}
        rows={treeRows(props.projects, expandedId, props.canTasks, props.canProjects)}
        expandedId={expandedId}
        onToggle={toggle}
        prefix="mobile"
      />
      {!props.projects.length && <p className="muted small">No hay proyectos disponibles.</p>}
    </nav>
  );
}

export function SidebarSections({
  label,
  navigation,
  createProject,
  ...props
}: ProjectNavigationProps & { label: string; navigation: ReactNode; createProject?: () => void }) {
  const [open, setOpen] = useState<'workspace' | 'projects' | null>(
    props.activeProjectId ? 'projects' : 'workspace',
  );
  const [expandedId, setExpandedId] = useState(props.activeProjectId);
  const [page, setPage] = useState(0);
  const [capacity, setCapacity] = useState(5);
  const panel = useRef<HTMLDivElement>(null);
  const projectIds = props.projects.map((p) => p.id).join(',');
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setCapacity(Math.max(1, Math.floor((element.clientHeight - 48) / 44))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    setExpandedId(props.activeProjectId);
    setOpen(props.activeProjectId ? 'projects' : 'workspace');
  }, [props.activeProjectId, props.activeSection]);
  useEffect(() => {
    const pages = projectPages(
      treeRows(props.projects, expandedId, props.canTasks, props.canProjects),
      capacity,
    );
    const index = pages.findIndex((rows) =>
      rows.some(
        (r) =>
          r.project.id === props.activeProjectId &&
          r.section === (expandedId === props.activeProjectId ? props.activeSection : null),
      ),
    );
    setPage(Math.max(0, index));
  }, [
    props.activeProjectId,
    props.activeSection,
    projectIds,
    capacity,
    props.canTasks,
    props.canProjects,
    expandedId,
  ]);
  const rows = treeRows(props.projects, expandedId, props.canTasks, props.canProjects);
  const projectRowPages = projectPages(rows, capacity);
  const items = Children.toArray(navigation);
  const pages = Math.max(
    1,
    open === 'projects' ? projectRowPages.length : Math.ceil(items.length / capacity),
  );
  const current = Math.min(page, pages - 1);
  const toggle = (section: 'workspace' | 'projects') => {
    setOpen(open === section ? null : section);
    setPage(0);
  };
  function toggleProject(project: Project) {
    const opening = expandedId !== project.id;
    setExpandedId(opening ? project.id : '');
    const nextPages = projectPages(
      treeRows(props.projects, opening ? project.id : '', props.canTasks, props.canProjects),
      capacity,
    );
    setPage(
      Math.max(
        0,
        nextPages.findIndex((rows) => rows.some((r) => r.project.id === project.id)),
      ),
    );
    if (opening && project.id !== props.activeProjectId)
      props.navigate(`project/${project.id}${props.canTasks ? '' : '/modules'}`);
  }
  const content = (
    <div className="sidebar-panel" ref={panel} id={`sidebar-${open}`}>
      <nav aria-label={open === 'workspace' ? 'Navegación principal' : 'Proyectos'}>
        {open === 'projects' ? (
          <ProjectTreeRows
            {...props}
            rows={projectRowPages[current] || []}
            expandedId={expandedId}
            onToggle={toggleProject}
            prefix="sidebar"
          />
        ) : (
          items.slice(current * capacity, (current + 1) * capacity)
        )}
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
