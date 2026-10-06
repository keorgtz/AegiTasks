import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { Badge } from './components';
import type { TaskItem, Workspace } from './types';
import type { ChangeTaskStatus } from './TaskStatusButton';
import './styles/task-actions.css';

function DraggableTask({
  task,
  disabled,
  children,
}: {
  task: TaskItem;
  disabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled,
  });
  return (
    <div ref={setNodeRef} className={`task-draggable ${isDragging ? 'is-dragging' : ''}`}>
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="task-drag-handle btn-icon"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Mover ${task.title}`}
        title="Arrastra para cambiar el estado. Con teclado: espacio, flechas y espacio."
      >
        <GripVertical size={17} />
      </button>
      {children}
    </div>
  );
}
function TaskColumn({
  status,
  tasks,
  disabled,
  renderTask,
  activeProject,
}: {
  status: Workspace['statuses'][number];
  tasks: TaskItem[];
  disabled: boolean;
  renderTask: (task: TaskItem) => ReactNode;
  activeProject?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
    data: { status },
    disabled: disabled || (!!activeProject && activeProject !== status.projectId),
  });
  return (
    <section
      ref={setNodeRef}
      className={`board-column task-drop-column ${isOver ? 'is-over' : ''}`}
      aria-label={`Estado ${status.name}`}
      data-status-id={status.id}
    >
      <div className="board-heading">
        <Badge color={status.color}>{status.name}</Badge>
        <span>{tasks.length}</span>
      </div>
      {tasks.map((task) => (
        <DraggableTask key={task.id} task={task} disabled={disabled || task.archived}>
          {renderTask(task)}
        </DraggableTask>
      ))}
      {!tasks.length && <div className="column-empty">Sin pendientes en esta página</div>}
    </section>
  );
}

export function TaskBoard({
  tasks,
  workspace,
  projectId,
  disabled = false,
  onChange,
  renderTask,
}: {
  tasks: TaskItem[];
  workspace: Workspace;
  projectId?: string;
  disabled?: boolean;
  onChange: ChangeTaskStatus;
  renderTask: (task: TaskItem) => ReactNode;
}) {
  const [active, setActive] = useState<TaskItem | null>(null);
  const dragTask = useRef<TaskItem | null>(null);
  const keyboardTarget = useRef<string | null>(null);
  const statuses = workspace.statuses.slice().sort((a, b) => a.position - b.position);
  const keyboardCoordinates: KeyboardCoordinateGetter = (
    event,
    { context, currentCoordinates },
  ) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.code)) return;
    const task = dragTask.current;
    if (!task || !context.collisionRect) return;
    event.preventDefault();
    const columns = statuses.filter((s) => s.projectId === task.projectId);
    const index = columns.findIndex(
      (s) => s.id === (keyboardTarget.current || context.over?.id || task.statusId),
    );
    const next = columns[index + (['ArrowRight', 'ArrowDown'].includes(event.code) ? 1 : -1)];
    const rect =
      next &&
      (context.droppableRects.get(next.id) ||
        context.droppableContainers.get(next.id)?.node.current?.getBoundingClientRect());
    if (!rect) return currentCoordinates;
    keyboardTarget.current = next!.id;
    return {
      x:
        currentCoordinates.x +
        rect.left +
        rect.width / 2 -
        context.collisionRect.left -
        context.collisionRect.width / 2,
      y:
        currentCoordinates.y +
        rect.top +
        Math.min(rect.height / 2, 70) -
        context.collisionRect.top -
        context.collisionRect.height / 2,
    };
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, scrollBehavior: 'auto' }),
  );
  const collision: CollisionDetection = (args) => {
    const task = args.active.data.current?.task as TaskItem | undefined;
    const droppableContainers = args.droppableContainers.filter(
      (container) => container.data.current?.status.projectId === task?.projectId,
    );
    const filtered = { ...args, droppableContainers };
    if (!args.pointerCoordinates && keyboardTarget.current) {
      const column = droppableContainers.find(
        (container) => container.id === keyboardTarget.current,
      );
      return column ? [{ id: column.id }] : [];
    }
    return args.pointerCoordinates ? pointerWithin(filtered) : rectIntersection(filtered);
  };
  return (
    <div className="task-board" data-update-blocked={!!active}>
      <p className="muted small task-board-help">
        Arrastra desde el asa para cambiar el estado. También puedes usar el botón de estado.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Pulsa espacio o Enter para mover. Usa las flechas para elegir un estado; espacio confirma y Escape cancela.',
          },
          announcements: {
            onDragStart: ({ active }) => `Moviendo ${active.data.current?.task.title}.`,
            onDragOver: ({ over }) =>
              over
                ? `Estado ${over.data.current?.status.name}.`
                : 'Fuera de las columnas disponibles.',
            onDragEnd: ({ over }) =>
              over ? `Soltado en ${over.data.current?.status.name}.` : 'Movimiento cancelado.',
            onDragCancel: () => 'Movimiento cancelado.',
          },
        }}
        onDragStart={({ active, activatorEvent }) => {
          const task = active.data.current?.task as TaskItem;
          dragTask.current = task;
          keyboardTarget.current = activatorEvent instanceof KeyboardEvent ? task.statusId : null;
          setActive(task);
        }}
        onDragCancel={() => {
          dragTask.current = null;
          keyboardTarget.current = null;
          setActive(null);
        }}
        onDragEnd={({ over }) => {
          const task = dragTask.current;
          dragTask.current = null;
          keyboardTarget.current = null;
          setActive(null);
          const status = over?.data.current?.status as Workspace['statuses'][number] | undefined;
          if (task && status && task.projectId === status.projectId && task.statusId !== status.id)
            void onChange(task, status.id);
        }}
      >
        <div className="project-boards">
          {workspace.projects
            .filter((p) =>
              projectId ? p.id === projectId : tasks.some((t) => t.projectId === p.id),
            )
            .map((project) => (
              <section
                className="project-board"
                key={project.id}
                aria-label={`Tablero de ${project.name}`}
              >
                <h3 className="project-board-title">
                  {project.name}
                  <Badge color={project.color}>
                    {tasks.filter((t) => t.projectId === project.id).length} en esta página
                  </Badge>
                </h3>
                <div
                  className="board"
                  tabIndex={0}
                  role="region"
                  aria-label={`Columnas de ${project.name}`}
                >
                  {statuses
                    .filter((s) => s.projectId === project.id)
                    .map((status) => (
                      <TaskColumn
                        key={status.id}
                        status={status}
                        tasks={tasks.filter(
                          (t) => t.statusId === status.id && t.projectId === project.id,
                        )}
                        disabled={(disabled && !active) || project.archived}
                        renderTask={renderTask}
                        activeProject={active?.projectId}
                      />
                    ))}
                </div>
              </section>
            ))}
        </div>
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {active && (
              <div className="task-drag-preview">
                <GripVertical size={17} />
                <strong>{active.title}</strong>
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </div>
  );
}
