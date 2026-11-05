"use client";
import { useEffect, useRef } from "react";
import type { NovaCopy } from "./copy";
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
export function DonationDialog({ copy, onClose }: { copy: NovaCopy; onClose: () => void }) {
  const text = copy.donation;
  return <Dialog title={text.title} closeLabel={copy.close} onClose={onClose} className="nova-donation"><div>
    <Icon name="heart" size={56}/><h2>{text.title}</h2>
    <p>{text.reason}</p>
    <p className="nova-donation-contact">{text.contact}<br/><a href="mailto:hudongpin@126.com?subject=Open%20ENA%20Donation%20Inquiry">hudongpin@126.com</a></p>
    <p className="nova-muted">{text.thanks}</p>
    <div className="nova-dialog-actions"><button className="nova-button" onClick={onClose}>{text.later}</button><a className="nova-button nova-primary" href="mailto:hudongpin@126.com?subject=Open%20ENA%20Donation%20Inquiry"><Icon name="mail"/>{text.email}</a></div>
  </div></Dialog>;
}
