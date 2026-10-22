"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal focus, Escape handling and phone-safe scrolling for admin forms. */
export function AdminDialog({ open, title, onClose, children, canDismiss = true }: { open: boolean; title: string; onClose: () => void; children: ReactNode; canDismiss?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  return <dialog ref={dialog} className="admin-dialog" aria-labelledby={titleId} onClose={onClose} onCancel={event => { if (!canDismiss) event.preventDefault(); }} onClick={event => { if (canDismiss && event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="admin-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" disabled={!canDismiss} onClick={() => dialog.current?.close()} aria-label="Close dialog"><X size={20} /></button></div>
    <div className="admin-dialog-body">{children}</div>
  </dialog>;
}
