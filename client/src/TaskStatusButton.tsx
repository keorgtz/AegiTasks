import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Badge, Modal } from './components';
import type { TaskItem, Workspace } from './types';
import './styles/task-actions.css';

export type ChangeTaskStatus = (task: TaskItem, statusId: string) => void | Promise<void>;
type Selection = { task: TaskItem; workspace: Workspace; onChange: ChangeTaskStatus };
const StatusContext = createContext<((selection: Selection) => void) | null>(null);

// Keep the picker outside lists so realtime refreshes cannot discard an open choice.
export function TaskStatusProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => {
    const close = () => setSelection(null);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);
  const statuses =
    selection?.workspace.statuses
      .filter((s) => s.projectId === selection.task.projectId)
      .sort((a, b) => a.position - b.position) || [];
  return (
    <StatusContext.Provider value={setSelection}>
      {children}
      {selection && (
        <Modal title="Cambiar estado" onClose={() => setSelection(null)}>
          <div className="modal-body task-status-options">
            <p className="task-status-title">{selection.task.title}</p>
            <p className="muted small">
              {selection.workspace.projects.find((p) => p.id === selection.task.projectId)?.name}
            </p>
            {statuses.map((status) => (
              <button
                key={status.id}
                type="button"
                className="task-status-option"
                aria-pressed={status.id === selection.task.statusId}
                onClick={() => {
                  setSelection(null);
                  if (status.id !== selection.task.statusId)
                    void selection.onChange(selection.task, status.id);
                }}
              >
                <Badge color={status.color}>{status.name}</Badge>
                {status.id === selection.task.statusId && <Check size={17} />}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </StatusContext.Provider>
  );
}

export function TaskStatusButton({
  task,
  workspace,
  onChange,
  disabled = false,
}: Selection & { disabled?: boolean }) {
  const open = useContext(StatusContext);
  const current = workspace.statuses.find((s) => s.id === task.statusId);
  const unavailable =
    disabled ||
    task.archived ||
    !open ||
    !workspace.statuses.some((s) => s.projectId === task.projectId) ||
    !workspace.projects.some((p) => p.id === task.projectId && !p.archived);
  return (
    <button
      type="button"
      className="task-status-button"
      aria-label={`Cambiar estado de ${task.title}`}
      aria-haspopup="dialog"
      disabled={unavailable}
      onClick={() => open?.({ task, workspace, onChange })}
    >
      <Badge color={current?.color}>{current?.name || 'Estado'}</Badge>
      <ChevronDown size={14} />
    </button>
  );
}
