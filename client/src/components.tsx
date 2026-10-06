import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type HTMLAttributes,
  type ReactElement,
} from 'react';
import { X } from 'lucide-react';
import { colors, colorNames } from './types';

export function ColorSwatches({
  label = 'Color',
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <span id={id}>{label}</span>
      <div className="color-picker" role="group" aria-labelledby={id}>
        {colors.map((color) => (
          <button
            type="button"
            key={color}
            aria-label={colorNames[color]}
            title={colorNames[color]}
            aria-pressed={value === color}
            className={`color-option tone-${color} ${value === color ? 'selected' : ''}`}
            onClick={() => onChange(color)}
          >
            <span />
          </button>
        ))}
      </div>
    </div>
  );
}
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
  open = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  open?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current!;
    if (open) d.showModal();
    else d.close();
    return () => d.close();
  }, [open]);
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
  let linked = false;
  const associate = (node: ReactNode): ReactNode => {
    if (!isValidElement<{ children?: ReactNode }>(node)) return node;
    if (!linked && ['input', 'select', 'textarea'].includes(node.type as string)) {
      linked = true;
      return cloneElement(node as ReactElement<HTMLAttributes<HTMLElement>>, {
        id,
        'aria-labelledby': `${id}-label`,
        'aria-describedby': hint ? `${id}-hint` : undefined,
      });
    }
    return node.props.children
      ? cloneElement(node, undefined, Children.map(node.props.children, associate))
      : node;
  };
  const control = associate(children);
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
