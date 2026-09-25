import { CheckCheck, CircleCheck } from 'lucide-react';
import type { TaskItem, Workspace } from './types';

export function FocusTaskSummary({
  tasks,
  workspace: w,
  active,
  changingTask,
  onComplete,
  onOpen,
}: {
  tasks: TaskItem[];
  workspace: Workspace;
  active: boolean;
  changingTask: string;
  onComplete: (task: TaskItem, statusId: string) => void;
  onOpen: (id: string) => void;
}) {
  const completed = tasks.filter(
    (task) => w.statuses.find((s) => s.id === task.statusId)?.isDone,
  ).length;
  return (
    <section className="focus-session-tasks" aria-label="Pendientes de esta sesión">
      <h2>
        {active ? 'Pendientes de esta sesión' : 'Tu plan de enfoque'}{' '}
        <small>
          {completed}/{tasks.length} completados
        </small>
      </h2>
      <progress
        className="focus-task-progress"
        value={completed}
        max={tasks.length || 1}
        aria-label="Avance de los pendientes"
      />
      <div className="focus-task-summary-list">
        {tasks.map((task) => {
          const status = w.statuses.find((s) => s.id === task.statusId);
          const target = w.statuses.find((s) => s.projectId === task.projectId && s.isDone);
          const project = w.projects.find((p) => p.id === task.projectId);
          const unavailable = task.archived || !project || project.archived;
          return (
            <article className="focus-session-task" key={task.id}>
              <div>
                <button className="focus-task-title" onClick={() => onOpen(task.id)}>
                  {task.title}
                </button>
                <small>
                  {project?.name} · {status?.name}
                  {task.archived ? ' · Archivado' : ''}
                </small>
                {task.description && <p className="focus-task-excerpt">{task.description}</p>}
                {active && !status?.isDone && !target && (
                  <small>
                    Configura un estado resuelto en este proyecto para completar el pendiente.
                  </small>
                )}
                {active && unavailable && (
                  <small>Restaura el pendiente y su proyecto para completarlo.</small>
                )}
              </div>
              {status?.isDone ? (
                <span className="focus-task-completed">
                  <CheckCheck size={18} /> Completado
                </span>
              ) : (
                active && (
                  <button
                    className="btn focus-secondary"
                    aria-label={`Completar ${task.title}`}
                    disabled={!!changingTask || unavailable || !target}
                    onClick={() => {
                      if (target) onComplete(task, target.id);
                    }}
                  >
                    <CircleCheck size={18} />
                    {changingTask === task.id ? 'Guardando…' : 'Completar'}
                  </button>
                )
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
