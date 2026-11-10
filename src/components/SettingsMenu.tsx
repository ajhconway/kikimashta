import { useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import './SettingsMenu.css';

/** Native modal semantics keep form controls and keyboard focus inside Settings. (#241) */
export function SettingsMenu({ children, onOpenChange }: { children: ReactNode; onOpenChange?: (open: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const dialogId = useId();
  const [open, setOpen] = useState(false);

  function show() {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    setOpen(true); onOpenChange?.(true);
    closeButton.current?.focus();
  }
  function close() { dialog.current?.close(); }
  function closed() {
    setOpen(false); onOpenChange?.(false);
    trigger.current?.focus();
  }
  function backdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  }

  return <>
    <button ref={trigger} type="button" className="settings-trigger" aria-label="Settings" aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} onClick={show}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M9.5 3h5l.6 2.2 1.2.7 2.2-.6L21 9.7l-1.6 1.6v1.4l1.6 1.6-2.5 4.4-2.2-.6-1.2.7-.6 2.2h-5l-.6-2.2-1.2-.7-2.2.6L3 14.3l1.6-1.6v-1.4L3 9.7l2.5-4.4 2.2.6 1.2-.7L9.5 3Z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    </button>
    <dialog ref={dialog} id={dialogId} className="settings-dialog" aria-labelledby={titleId} onClose={closed} onCancel={event => { event.preventDefault(); close(); }} onClick={backdrop}>
      <div className="settings-dialog-header">
        <h2 id={titleId}>Settings</h2>
        <button ref={closeButton} type="button" className="settings-close" aria-label="Close settings" onClick={close}><span aria-hidden="true">×</span></button>
      </div>
      <div className="settings-dialog-content">{children}</div>
    </dialog>
  </>;
}
