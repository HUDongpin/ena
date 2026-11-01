"use client";
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
export function Dialog({ title, children, onClose, closeLabel = "Close", className = "" }: { title: string; children: React.ReactNode; onClose: () => void; closeLabel?: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current; dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) { if (previous.closest(".nova-sidebar") && window.matchMedia("(max-width: 700px)").matches) document.querySelector<HTMLElement>(".nova-menu-toggle")?.focus(); else previous.focus(); } };
  }, []);
  return <dialog ref={ref} className={`nova-dialog ${className}`} aria-label={title} onCancel={(event) => { event.preventDefault(); close.current(); }} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close.current(); } }}>
    <button type="button" className="nova-icon-button nova-dialog-close" aria-label={closeLabel} onClick={onClose}><Icon name="close" /></button>{children}
  </dialog>;
}
export function DonationDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="Support Open ENA" onClose={onClose} className="nova-donation"><div lang="en" dir="ltr">
    <Icon name="heart" size={56}/><h2>Support Open ENA</h2>
    <p>Help keep Open ENA free for education and research.<br/>Your donation helps cover our servers and AI token costs.</p>
    <p className="nova-donation-contact">To discuss a donation method, please contact:<br/><a href="mailto:hudongpin@126.com?subject=Open%20ENA%20Donation%20Inquiry">hudongpin@126.com</a></p>
    <p className="nova-muted">Thank you for supporting open research tools.</p>
    <div className="nova-dialog-actions"><button className="nova-button" onClick={onClose}>Maybe later</button><a className="nova-button nova-primary" href="mailto:hudongpin@126.com?subject=Open%20ENA%20Donation%20Inquiry"><Icon name="mail"/>Contact by email</a></div>
  </div></Dialog>;
}
