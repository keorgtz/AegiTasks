import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import { TaskStatusButton, type ChangeTaskStatus } from './TaskStatusButton';
import { dateLabel, localDate, type TaskItem, type Workspace } from './types';
import './styles/task-views.css';

export function TaskGallery({
  tasks,
  renderTask,
}: {
  tasks: TaskItem[];
  renderTask: (task: TaskItem) => ReactNode;
}) {
  return (
    <div className="task-gallery" role="region" aria-label="Tarjetas de pendientes">
      {tasks.map((task) => (
        <div key={task.id}>{renderTask(task)}</div>
      ))}
    </div>
  );
}

const epoch = (date: string) => Date.parse(date + 'T00:00:00Z');
const day = 86400000;
export function TaskTimeline({
  tasks,
  workspace: w,
  onOpen,
  onChange,
  disabled,
}: {
  tasks: TaskItem[];
  workspace: Workspace;
  onOpen: (id: string) => void;
  onChange: ChangeTaskStatus;
  disabled: boolean;
}) {
  const dated = tasks
    .filter((task) => task.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.title.localeCompare(b.title));
  const undated = tasks.filter((task) => !task.dueDate);
  const today = localDate();
  const dates = dated.map((task) => epoch(task.dueDate!));
  const first = Math.min(epoch(today), ...dates);
  const last = Math.max(epoch(today), ...dates);
  const start = first === last ? first - 3 * day : first;
  const end = first === last ? last + 3 * day : last;
  const position = (date: string) => ((epoch(date) - start) / (end - start)) * 100;
  const isOverdue = (task: TaskItem) =>
    !!task.dueDate &&
    task.dueDate < today &&
    !w.statuses.find((status) => status.id === task.statusId)?.isDone;
  const taskButton = (task: TaskItem) => (
    <div className="task-timeline-card">
      <button
        className="task-timeline-open"
        aria-label={'Abrir pendiente: ' + task.title}
        onClick={() => onOpen(task.id)}
      >
        <strong>{task.title}</strong>
        <span>
          <small>
            {w.projects.find((project) => project.id === task.projectId)?.name} ·{' '}
            {w.users.find((user) => user.id === task.assigneeId)?.name || 'Sin responsable'}
          </small>
        </span>
        {task.dueDate && (
          <span className={'task-timeline-date ' + (isOverdue(task) ? 'is-overdue' : '')}>
            <CalendarDays size={14} />
            {new Date(epoch(task.dueDate)).toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })}
            {isOverdue(task) && ' · Vencido'}
          </span>
        )}
      </button>
      <TaskStatusButton task={task} workspace={w} onChange={onChange} disabled={disabled} />
    </div>
  );
  return (
    <section className="task-timeline" aria-label="Cronología de pendientes">
      <p className="muted small">
        Fechas límite de esta página. Un punto indica el vencimiento; los pendientes sin fecha se
        conservan abajo.
      </p>
      {!!dated.length && (
        <div
          className="task-timeline-scroll"
          tabIndex={0}
          role="region"
          aria-label="Fechas límite en la cronología"
        >
          <div className="task-timeline-axis">
            <span>Pendiente</span>
            <div>
              {Array.from({ length: 5 }, (_, i) => {
                const date = new Date(start + ((end - start) * i) / 4);
                return (
                  <span key={i} style={{ left: i * 25 + '%' }}>
                    {date.toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </span>
                );
              })}
            </div>
          </div>
          {dated.map((task) => (
            <article
              className="task-timeline-row"
              key={task.id}
              aria-label={'Pendiente ' + task.title}
            >
              {taskButton(task)}
              <div className="task-timeline-track">
                <span
                  className="task-timeline-today"
                  style={{ left: position(today) + '%' }}
                  title={'Hoy: ' + today}
                />
                <button
                  className={
                    'task-deadline-marker ' +
                    (task.dueDate! < today &&
                    !w.statuses.find((status) => status.id === task.statusId)?.isDone
                      ? 'is-overdue'
                      : '')
                  }
                  style={{ left: position(task.dueDate!) + '%' }}
                  onClick={() => onOpen(task.id)}
                  aria-label={'Fecha límite de ' + task.title + ': ' + task.dueDate}
                  title={task.dueDate!}
                >
                  <CalendarDays size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!!undated.length && (
        <section className="task-timeline-undated" aria-label="Pendientes sin fecha límite">
          <h3>
            Sin fecha límite <span className="muted">{undated.length}</span>
          </h3>
          {undated.map((task) => (
            <article key={task.id} aria-label={'Pendiente ' + task.title}>
              {taskButton(task)}
              <span className="muted small">Sin fecha</span>
            </article>
          ))}
        </section>
      )}
      {!!dated.length && (
        <p className="muted small">
          <span className="task-today-key" /> Hoy: {dateLabel(today)} · Cada pendiente conserva su
          estado y responsable.
        </p>
      )}
    </section>
  );
}
