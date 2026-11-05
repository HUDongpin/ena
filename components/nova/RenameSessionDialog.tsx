"use client";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { Dialog } from "./Dialog";

const labels = {
  en: { rename: "Rename session", name: "Session name", save: "Save" },
  "zh-hans": { rename: "重命名会话", name: "会话名称", save: "保存" },
  "zh-hant": { rename: "重新命名對話", name: "對話名稱", save: "儲存" },
  es: { rename: "Cambiar nombre de sesión", name: "Nombre de la sesión", save: "Guardar" },
  fr: { rename: "Renommer la session", name: "Nom de la session", save: "Enregistrer" },
  pt: { rename: "Renomear sessão", name: "Nome da sessão", save: "Salvar" },
  de: { rename: "Sitzung umbenennen", name: "Sitzungsname", save: "Speichern" },
  ar: { rename: "إعادة تسمية الجلسة", name: "اسم الجلسة", save: "حفظ" },
  ko: { rename: "세션 이름 변경", name: "세션 이름", save: "저장" },
  ja: { rename: "セッション名を変更", name: "セッション名", save: "保存" },
  hi: { rename: "सत्र का नाम बदलें", name: "सत्र का नाम", save: "सहेजें" },
  ru: { rename: "Переименовать сеанс", name: "Название сеанса", save: "Сохранить" },
  id: { rename: "Ganti nama sesi", name: "Nama sesi", save: "Simpan" },
  bn: { rename: "সেশনের নাম পরিবর্তন করুন", name: "সেশনের নাম", save: "সংরক্ষণ করুন" },
} satisfies Record<Locale, { rename: string; name: string; save: string }>;

interface Props {
  locale: Locale;
  title: string;
  closeLabel: string;
  busy: boolean;
  ambiguous: boolean;
  error: string;
  retryLabel: string;
  onSave: (title: string) => Promise<boolean>;
  onClose: () => void;
}

export default function RenameSessionDialog({ locale, title, closeLabel, busy, ambiguous, error, retryLabel, onSave, onClose }: Props) {
  const text = labels[locale];
  const [name, setName] = useState(title);
  const [attempted, setAttempted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);

  return <Dialog title={text.rename} closeLabel={closeLabel} onClose={onClose} className="nova-rename-dialog">
    <h2>{text.rename}</h2>
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy || !name.trim()) return;
      setAttempted(true);
      if (await onSave(name.trim())) onClose();
    }}>
      <label htmlFor="nova-session-name">{text.name}</label>
      <input id="nova-session-name" ref={input} dir="auto" value={name} maxLength={120} required
        readOnly={busy || ambiguous} onChange={event => { setName(event.target.value); setAttempted(false); }}/>
      {attempted && error ? <p role="alert">{error}</p> : null}
      <div className="nova-dialog-actions">
        <button type="button" className="nova-button" onClick={onClose}>{closeLabel}</button>
        <button type="submit" className="nova-button nova-primary" disabled={busy || !name.trim()}>{ambiguous ? retryLabel : text.save}</button>
      </div>
    </form>
  </Dialog>;
}
