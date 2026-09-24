import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type HTMLAttributes,
} from 'react';
import { X } from 'lucide-react';
export function Brand({ onInstall }: { onInstall?: () => void }) {
  return (
    <div className="brand">
      {onInstall ? (
        <button
          className="brand-install"
          onClick={onInstall}
          aria-label="Instalar AegiTasks"
          title="Instalar AegiTasks"
        >
          <img className="brand-mark" src="/aegitasks-icon-192.png" alt="" width={39} height={39} />
        </button>
      ) : (
        <img className="brand-mark" src="/aegitasks-icon-192.png" alt="" width={39} height={39} />
      )}
      <div>
        <strong>AegiTasks</strong>
        <span>PASTEL PULSE</span>
      </div>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button className="btn-icon" aria-label="Cerrar" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control =
    isValidElement<HTMLAttributes<HTMLElement>>(children) &&
    ['input', 'select', 'textarea'].includes(children.type as string)
      ? cloneElement(children, {
          id,
          'aria-labelledby': `${id}-label`,
          'aria-describedby': hint ? `${id}-hint` : undefined,
        })
      : children;
  return (
    <div className="field">
      <label htmlFor={id}>
        <span id={`${id}-label`}>{label}</span>
        {control}
      </label>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Badge({ children, color = 'neutral' }: { children: ReactNode; color?: string }) {
  return <span className={`badge tone-${color}`}>{children}</span>;
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error-box" role="alert">
      {message}
    </div>
  ) : null;
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
