import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Layers3, List, Plus, Repeat2 } from 'lucide-react';
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
  preferenceKey,
  catalogActive,
  ...props
}: ProjectNavigationProps & {
  label: string;
  navigation: ReactNode;
  createProject?: () => void;
  preferenceKey: string;
  catalogActive: boolean;
}) {
  const [open, setOpen] = useState<{ workspace: boolean; projects: boolean }>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
      if (stored && typeof stored.workspace === 'boolean' && typeof stored.projects === 'boolean')
        return stored;
    } catch {
      /* Ignore an invalid local preference. */
    }
    return { workspace: true, projects: true };
  });
  const [expandedId, setExpandedId] = useState(props.activeProjectId);
  const projectIds = props.projects.map((project) => project.id).join(',');
  useEffect(() => {
    setExpandedId(props.activeProjectId);
    if (props.activeProjectId) setOpen((value) => ({ ...value, projects: true }));
  }, [props.activeProjectId, props.activeSection]);
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(open));
    } catch {
      /* Navigation remains available. */
    }
  }, [open, preferenceKey]);
  useEffect(() => {
    if (props.activeProjectId)
      requestAnimationFrame(() =>
        document
          .querySelector('.sidebar .project-tree-link[aria-current="page"]')
          ?.scrollIntoView({ block: 'nearest' }),
      );
  }, [props.activeProjectId, props.activeSection, expandedId, open.projects, projectIds]);
  function toggleProject(project: Project) {
    const opening = expandedId !== project.id;
    setExpandedId(opening ? project.id : '');
    if (opening && project.id !== props.activeProjectId)
      props.navigate('project/' + project.id + (props.canTasks ? '' : '/modules'));
  }
  return (
    <div className="sidebar-sections">
      <section
        className={open.workspace ? 'sidebar-group is-expanded' : 'sidebar-group'}
        aria-label={label}
      >
        <button
          className="sidebar-section-toggle"
          aria-expanded={open.workspace}
          aria-controls="sidebar-workspace"
          onClick={() => setOpen((value) => ({ ...value, workspace: !value.workspace }))}
        >
          <span>{label}</span>
          <ChevronDown size={16} />
        </button>
        <div
          className="sidebar-panel"
          id="sidebar-workspace"
          hidden={!open.workspace}
          tabIndex={0}
          role="region"
          aria-label="Opciones del workspace"
        >
          <nav aria-label="Navegación principal">{navigation}</nav>
        </div>
      </section>
      {(props.canTasks || props.canProjects) && (
        <section
          className={open.projects ? 'sidebar-group is-expanded' : 'sidebar-group'}
          aria-label="Navegación de proyectos"
        >
          <div className="sidebar-project-heading">
            <button
              className={catalogActive ? 'sidebar-section-title active' : 'sidebar-section-title'}
              disabled={!props.canProjects}
              onClick={() => props.navigate('projects')}
            >
              PROYECTOS
            </button>
            <button
              className="btn-icon sidebar-project-toggle"
              aria-label={open.projects ? 'Contraer proyectos' : 'Expandir proyectos'}
              aria-expanded={open.projects}
              aria-controls="sidebar-projects"
              onClick={() => setOpen((value) => ({ ...value, projects: !value.projects }))}
            >
              <ChevronDown size={16} />
            </button>
            {createProject && (
              <button className="btn-icon" aria-label="Nuevo proyecto" onClick={createProject}>
                <Plus size={17} />
              </button>
            )}
          </div>
          <div
            className="sidebar-panel"
            id="sidebar-projects"
            hidden={!open.projects}
            tabIndex={0}
            role="region"
            aria-label="Árbol de proyectos"
          >
            <nav aria-label="Proyectos">
              <ProjectTreeRows
                {...props}
                rows={treeRows(props.projects, expandedId, props.canTasks, props.canProjects)}
                expandedId={expandedId}
                onToggle={toggleProject}
                prefix="sidebar"
              />
            </nav>
            {!props.projects.length && <p className="muted small">No hay proyectos disponibles.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
