import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Modal } from './components';
import { localDate, type TaskItem, type Workspace } from './types';
import { TaskStatusButton, type ChangeTaskStatus } from './TaskStatusButton';
import './styles/task-calendar.css';

const iso = (date: Date) => date.toISOString().slice(0, 10);
export const currentMonth = () => localDate().slice(0, 7);
export function calendarRange(month: string) {
  const year = Number(month.slice(0, 4)),
    number = Number(month.slice(5, 7));
  return { dueFrom: `${month}-01`, dueTo: iso(new Date(Date.UTC(year, number, 0))) };
}
export function addCalendarFilter(params: URLSearchParams, month: string, undated: boolean) {
  if (undated) params.set('withoutDueDate', 'true');
  else {
    const range = calendarRange(month);
    params.set('dueFrom', range.dueFrom);
    params.set('dueTo', range.dueTo);
  }
}
export function TaskCalendar({
  tasks,
  workspace,
  month,
  undated,
  onMonth,
  onUndated,
  onOpen,
  onChange,
  disabled = false,
  total,
}: {
  tasks: TaskItem[];
  workspace: Workspace;
  month: string;
  undated: boolean;
  onMonth: (month: string) => void;
  onUndated: (value: boolean) => void;
  onOpen: (id: string) => void;
  onChange: ChangeTaskStatus;
  disabled?: boolean;
  total: number;
}) {
  const [selected, setSelected] = useState(() =>
    localDate().startsWith(month) ? localDate() : month + '-01',
  );
  const [detailDay, setDetailDay] = useState('');
  useEffect(() => {
    setSelected(localDate().startsWith(month) ? localDate() : month + '-01');
    setDetailDay('');
  }, [month]);
  const year = Number(month.slice(0, 4)),
    number = Number(month.slice(5, 7));
  const first = new Date(Date.UTC(year, number - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const dates = Array.from({ length: 42 }, (_, index) =>
    iso(new Date(Date.UTC(year, number - 1, 1 - offset + index))),
  );
  const title = first.toLocaleDateString('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const dateTitle = (date: string) =>
    new Date(date + 'T12:00:00Z').toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const dayTasks = (date: string) => tasks.filter((task) => task.dueDate === date);
  function move(amount: number) {
    onMonth(iso(new Date(Date.UTC(year, number - 1 + amount, 1))).slice(0, 7));
  }
  const taskRows = (items: TaskItem[]) => (
    <div className="calendar-task-list">
      {items.map((task) => (
        <article key={task.id} className="calendar-task" aria-label={'Pendiente ' + task.title}>
          <button
            className="calendar-task-open"
            aria-label={'Abrir pendiente: ' + task.title}
            onClick={() => onOpen(task.id)}
          >
            <strong>{task.title}</strong>
            <small>
              {workspace.projects.find((p) => p.id === task.projectId)?.name} ·{' '}
              {workspace.users.find((u) => u.id === task.assigneeId)?.name || 'Sin responsable'}
            </small>
          </button>
          <TaskStatusButton
            task={task}
            workspace={workspace}
            onChange={onChange}
            disabled={disabled}
          />
        </article>
      ))}
      {!items.length && <p className="muted small">Sin pendientes en esta página.</p>}
    </div>
  );
  return (
    <section className="task-calendar" aria-label="Calendario de pendientes">
      <div className="calendar-toolbar">
        <div className="calendar-month-controls">
          <button
            className="btn-icon"
            aria-label="Mes anterior"
            disabled={disabled || undated || month <= '1900-01'}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <label className="calendar-month-label">
            <span className="sr-only">Mes del calendario</span>
            <input
              type="month"
              aria-label="Mes del calendario"
              value={month}
              disabled={disabled || undated}
              min="1900-01"
              max="9998-12"
              onChange={(e) => {
                if (e.target.validity.valid && /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                  onMonth(e.target.value);
              }}
            />
          </label>
          <button
            className="btn-icon"
            aria-label="Mes siguiente"
            disabled={disabled || undated || month >= '9998-12'}
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => {
              setSelected(localDate());
              onMonth(currentMonth());
              onUndated(false);
            }}
          >
            Hoy
          </button>
        </div>
        <button
          className="btn btn-ghost"
          aria-pressed={undated}
          disabled={disabled}
          onClick={() => onUndated(!undated)}
        >
          <CalendarDays size={16} /> {undated ? 'Ver calendario' : 'Sin fecha límite'}
        </button>
      </div>
      <p className="muted small calendar-caption">
        {total} pendientes {undated ? 'sin fecha límite' : `en ${title}`} con estos filtros. Si hay
        más de 50, usa la paginación.
      </p>
      {undated ? (
        taskRows(tasks)
      ) : (
        <>
          <div className="calendar-grid" role="group" aria-label={title}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
              <div className="calendar-weekday" key={day}>
                {day}
              </div>
            ))}
            {dates.map((date) => {
              const inMonth = date.startsWith(month);
              const items = dayTasks(date);
              return (
                <div
                  key={date}
                  className={`calendar-day ${!inMonth ? 'outside-month' : ''} ${date === localDate() ? 'is-today' : ''} ${selected === date ? 'is-selected' : ''}`}
                >
                  <button
                    className="calendar-day-number"
                    aria-label={`${dateTitle(date)}: ${items.length} pendientes en esta página`}
                    aria-pressed={selected === date}
                    aria-current={date === localDate() ? 'date' : undefined}
                    disabled={!inMonth}
                    onClick={() => setSelected(date)}
                  >
                    <span>{Number(date.slice(-2))}</span>
                    <span className="calendar-day-count">{items.length || ''}</span>
                  </button>
                  <div className="calendar-day-preview">
                    {items.slice(0, 3).map((task) => (
                      <article key={task.id} className="calendar-event">
                        <button
                          aria-label={'Abrir pendiente: ' + task.title}
                          title={task.title}
                          onClick={() => onOpen(task.id)}
                        >
                          {task.title}
                        </button>
                        <TaskStatusButton
                          task={task}
                          workspace={workspace}
                          onChange={onChange}
                          disabled={disabled}
                        />
                      </article>
                    ))}
                    {items.length > 3 && (
                      <button className="calendar-more" onClick={() => setDetailDay(date)}>
                        Ver los {items.length} pendientes
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="calendar-agenda">
            <h3>{dateTitle(selected)}</h3>
            {taskRows(dayTasks(selected))}
          </div>
        </>
      )}
      {detailDay && (
        <Modal title={dateTitle(detailDay)} onClose={() => setDetailDay('')}>
          <div className="modal-body">{taskRows(dayTasks(detailDay))}</div>
        </Modal>
      )}
    </section>
  );
}
