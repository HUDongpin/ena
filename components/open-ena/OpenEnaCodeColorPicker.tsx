"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  OPEN_ENA_CODE_COLOR_PRESETS,
  matchOpenEnaCodeColorPreset,
  normalizeOpenEnaCodeColorPair,
  normalizeOpenEnaHexColor,
  openEnaCodeColorPair,
  type OpenEnaCodeColorPair,
  type OpenEnaCodeColorPickerCopy,
} from "@/lib/open-ena/code-color-presets";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface OpenEnaCodeColorPickerProps {
  code: string;
  value: Readonly<OpenEnaCodeColorPair>;
  copy: Readonly<OpenEnaCodeColorPickerCopy>;
  onCancel: () => void;
  onConfirm: (value: OpenEnaCodeColorPair) => void;
}

export default function OpenEnaCodeColorPicker({
  code,
  value,
  copy,
  onCancel,
  onConfirm,
}: OpenEnaCodeColorPickerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primaryHexRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState(() => openEnaCodeColorPair(value.primary, value.complementary));
  const [activeTarget, setActiveTarget] = useState<keyof OpenEnaCodeColorPair>("primary");
  const normalized = normalizeOpenEnaCodeColorPair(draft);
  const selectedPreset = matchOpenEnaCodeColorPreset(normalized ?? draft);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let fallback = false;
    try {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else fallback = true;
    } catch {
      fallback = true;
    }

    if (fallback) {
      dialog.open = true;
      dialog.dataset.enaDialogFallback = "true";
    } else {
      delete dialog.dataset.enaDialogFallback;
    }
    primaryHexRef.current?.focus();

    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, []);

  const updateField = (field: keyof OpenEnaCodeColorPair, next: string) => {
    setDraft((current) => ({ ...current, [field]: next }));
  };

  const confirm = () => {
    const next = normalizeOpenEnaCodeColorPair(draft);
    if (next) onConfirm(next);
  };

  const handleFallbackKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.dataset.enaDialogFallback !== "true") return;

    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => element.getAttribute("aria-hidden") !== "true" && !element.hidden && element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="ena-code-color-dialog"
      role="dialog"
      aria-modal={true}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={handleFallbackKeyDown}
      onClick={(event) => {
        const dialog = dialogRef.current;
        if (!dialog || event.target !== dialog) return;
        const fallback = dialog.dataset.enaDialogFallback === "true";
        const rect = dialog.getBoundingClientRect();
        const outside = event.clientX < rect.left
          || event.clientX > rect.right
          || event.clientY < rect.top
          || event.clientY > rect.bottom;
        if (fallback || outside) onCancel();
      }}
    >
      <div className="ena-code-color-sheet">
        <h2 id={titleId} className="sr-only">{copy.dialogTitle(code)}</h2>
        <p id={descriptionId} className="sr-only">{`${copy.colorPresets} ${copy.customColor}`}</p>

        <div className="ena-code-color-dialog-grid">
          <section className="ena-code-color-presets" aria-labelledby={`${titleId}-presets`}>
            <h3 id={`${titleId}-presets`}>{copy.colorPresets}</h3>
            <div className="ena-code-color-preset-grid">
              {OPEN_ENA_CODE_COLOR_PRESETS.map((preset, index) => (
                <button
                  key={`${preset.primary}-${preset.complementary}`}
                  type="button"
                  data-ena-code-color-preset={index + 1}
                  aria-label={copy.presetLabel(index + 1, preset.primary, preset.complementary)}
                  aria-pressed={selectedPreset === index}
                  onClick={() => setDraft({ ...preset })}
                >
                  <span aria-hidden="true" style={{ backgroundColor: preset.primary }} />
                  <span aria-hidden="true" style={{ backgroundColor: preset.complementary }} />
                </button>
              ))}
            </div>
          </section>

          <section className="ena-code-color-custom" aria-labelledby={`${titleId}-custom`}>
            <h3 id={`${titleId}-custom`}>{copy.customColor}</h3>
            {(["primary", "complementary"] as const).map((field) => {
              const fieldId = `${titleId}-${field}`;
              const valid = normalizeOpenEnaHexColor(draft[field]) !== null;
              return (
                <div key={field} data-active={activeTarget === field}>
                  <label htmlFor={fieldId}>{copy[field]}</label>
                  <div className="ena-code-color-value-row">
                    <button
                      type="button"
                      aria-label={`${copy.chooseColor(code)}: ${copy[field]}`}
                      aria-pressed={activeTarget === field}
                      onClick={() => setActiveTarget(field)}
                      style={{ backgroundColor: normalizeOpenEnaHexColor(draft[field]) ?? "transparent" }}
                    />
                    <input
                      ref={field === "primary" ? primaryHexRef : undefined}
                      id={fieldId}
                      type="text"
                      data-ena-code-color-hex={field}
                      value={draft[field]}
                      aria-invalid={!valid}
                      aria-describedby={!valid ? errorId : undefined}
                      spellCheck={false}
                      maxLength={7}
                      autoComplete="off"
                      onFocus={() => setActiveTarget(field)}
                      onChange={(event) => updateField(field, event.target.value)}
                    />
                  </div>
                </div>
              );
            })}
            {!normalized ? <p id={errorId} className="ena-code-color-error" role="alert">{copy.invalidHex}</p> : null}
          </section>
        </div>

        <footer className="ena-code-color-actions">
          <button type="button" className="ena-inline-link" onClick={onCancel}>{copy.cancel}</button>
          <button type="button" className="ena-code-color-confirm" disabled={!normalized} onClick={confirm}>{copy.confirm}</button>
        </footer>
      </div>
    </dialog>
  );
}
