"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  OPEN_ENA_CODE_COLOR_PRESETS,
  matchOpenEnaCodeColorPreset,
  normalizeOpenEnaCodeColorPair,
  normalizeOpenEnaHexColor,
  openEnaCodeColorFromPlane,
  openEnaCodeColorPair,
  openEnaHexToHsv,
  openEnaHsvToHex,
  shiftOpenEnaHsv,
  type OpenEnaCodeColorPair,
  type OpenEnaCodeColorPickerCopy,
  type OpenEnaHsvColor,
} from "@/lib/open-ena/code-color-presets";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function openEnaPickerHsv(value: string): OpenEnaHsvColor {
  return openEnaHexToHsv(value) ?? { h: 0, s: 0, v: 0 };
}

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
  const [editorHsv, setEditorHsv] = useState(() => {
    const pair = openEnaCodeColorPair(value.primary, value.complementary);
    return {
      primary: openEnaPickerHsv(pair.primary),
      complementary: openEnaPickerHsv(pair.complementary),
    };
  });
  const [activeTarget, setActiveTarget] = useState<keyof OpenEnaCodeColorPair>("primary");
  const normalized = normalizeOpenEnaCodeColorPair(draft);
  const selectedPreset = matchOpenEnaCodeColorPreset(normalized ?? draft);
  const activeHex = normalizeOpenEnaHexColor(draft[activeTarget])
    ?? normalizeOpenEnaHexColor(value[activeTarget])
    ?? "#000000";
  const fallbackHsv = openEnaPickerHsv(activeHex);
  const activeHsv = normalizeOpenEnaHexColor(draft[activeTarget]) ? editorHsv[activeTarget] : fallbackHsv;

  const setActiveHsv = (next: OpenEnaHsvColor, hex = openEnaHsvToHex(next)) => {
    if (!openEnaHsvToHex(next) || !hex) return;
    setEditorHsv((current) => ({ ...current, [activeTarget]: next }));
    setDraft((current) => ({ ...current, [activeTarget]: hex }));
  };

  const updatePlane = (element: HTMLElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const yRatio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const next = { h: activeHsv.h, s: xRatio * 100, v: (1 - yRatio) * 100 };
    setActiveHsv(next, openEnaCodeColorFromPlane(
      activeHsv.h,
      xRatio,
      yRatio,
    ));
  };

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
    const hsv = openEnaHexToHsv(next);
    if (!hsv) return;
    setEditorHsv((current) => {
      if (hsv.v === 0) {
        return { ...current, [field]: { h: current[field].h, s: current[field].s, v: 0 } };
      }
      if (hsv.s === 0) {
        return { ...current, [field]: { h: current[field].h, s: 0, v: hsv.v } };
      }
      return { ...current, [field]: hsv };
    });
  };

  const selectPreset = (preset: Readonly<OpenEnaCodeColorPair>) => {
    setDraft({ ...preset });
    setEditorHsv({
      primary: openEnaPickerHsv(preset.primary),
      complementary: openEnaPickerHsv(preset.complementary),
    });
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

  const handleAxisKeyDown = (axis: "s" | "v", event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const delta = event.key === "Home" ? -activeHsv[axis]
      : event.key === "End" ? 100 - activeHsv[axis]
        : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -step
          : event.key === "ArrowRight" || event.key === "ArrowUp" ? step
            : null;
    if (delta === null) return;
    event.preventDefault();
    const next = shiftOpenEnaHsv(activeHsv, axis === "s" ? { s: delta } : { v: delta });
    if (next) setActiveHsv(next);
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
                  onClick={() => selectPreset(preset)}
                >
                  <span aria-hidden="true" style={{ backgroundColor: preset.primary }} />
                  <span aria-hidden="true" style={{ backgroundColor: preset.complementary }} />
                </button>
              ))}
            </div>
          </section>

          <section className="ena-code-color-custom" aria-labelledby={`${titleId}-custom`}>
            <h3 id={`${titleId}-custom`}>{copy.customColor}</h3>
            <div className="ena-code-color-editor" data-active-target={activeTarget}>
              <div
                className="ena-code-color-plane"
                data-ena-code-color-plane="true"
                role="group"
                aria-label={`${copy[activeTarget]} ${copy.saturationValue}`}
                style={{
                  "--ena-picker-hue": openEnaHsvToHex({ h: activeHsv.h, s: 100, v: 100 }) ?? "#ff0000",
                } as CSSProperties}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updatePlane(event.currentTarget, event.clientX, event.clientY);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    updatePlane(event.currentTarget, event.clientX, event.clientY);
                  }
                }}
              >
                <span
                  className="ena-code-color-plane-picker"
                  aria-hidden="true"
                  style={{ left: `${activeHsv.s}%`, top: `${100 - activeHsv.v}%` }}
                />
                <div
                  className="ena-code-color-plane-axis"
                  data-ena-code-color-axis="saturation"
                  role="slider"
                  tabIndex={0}
                  aria-label={`${copy[activeTarget]} ${copy.saturation}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(activeHsv.s)}
                  aria-valuetext={copy.saturationBrightnessValue(Math.round(activeHsv.s), Math.round(activeHsv.v))}
                  onKeyDown={(event) => handleAxisKeyDown("s", event)}
                />
                <div
                  className="ena-code-color-plane-axis"
                  data-ena-code-color-axis="brightness"
                  role="slider"
                  tabIndex={0}
                  aria-label={`${copy[activeTarget]} ${copy.brightness}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(activeHsv.v)}
                  aria-valuetext={copy.saturationBrightnessValue(Math.round(activeHsv.s), Math.round(activeHsv.v))}
                  aria-orientation="vertical"
                  onKeyDown={(event) => handleAxisKeyDown("v", event)}
                />
              </div>
              <input
                className="ena-code-color-hue"
                data-ena-code-color-hue="true"
                type="range"
                min={0}
                max={360}
                step={1}
                value={Math.round(activeHsv.h)}
                aria-label={`${copy[activeTarget]} ${copy.hue}`}
                aria-orientation="vertical"
                onChange={(event) => {
                  const hue = Number(event.target.value);
                  setActiveHsv({ ...activeHsv, h: hue });
                }}
              />
            </div>
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
