"use client";

import { useEffect, useRef, useState } from "react";
import {
  cloneDirectionalMask,
  validateDirectionalMask,
} from "@/lib/open-ena/network-config";
import type { OpenEnaDirectionalMask } from "@/lib/open-ena/types";

export type OpenEnaDirectionalMaskPreset = "all" | "none" | "diagonal" | "off-diagonal";

export interface OpenEnaDirectionalMaskEditorCopy {
  triggerLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  closeLabel: string;
  matrixCaption: string;
  groundHeader: string;
  responseHeader: string;
  allLabel: string;
  noneLabel: string;
  diagonalLabel: string;
  offDiagonalLabel: string;
  invalidMaskMessage: string;
  cellLabel: (ground: string, response: string, diagonal: boolean) => string;
  cellAnnouncement: (ground: string, response: string, enabled: boolean) => string;
  bulkAnnouncement: (
    preset: OpenEnaDirectionalMaskPreset,
    enabledCount: number,
    totalCount: number,
  ) => string;
}

interface OpenEnaDirectionalMaskEditorProps {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: OpenEnaDirectionalMask;
  onChange: (value: OpenEnaDirectionalMask) => void;
  copy: OpenEnaDirectionalMaskEditorCopy;
  disabled?: boolean;
}

export function applyDirectionalMaskPreset(
  value: OpenEnaDirectionalMask,
  preset: OpenEnaDirectionalMaskPreset,
): OpenEnaDirectionalMask {
  if (preset !== "all"
    && preset !== "none"
    && preset !== "diagonal"
    && preset !== "off-diagonal") {
    throw new Error("Unsupported directional-mask preset.");
  }
  const mask = cloneDirectionalMask(value);
  return {
    ...mask,
    enabled: mask.codeOrder.map((_, groundIndex) => mask.codeOrder.map((__, responseIndex) => {
      if (preset === "all") return true;
      if (preset === "none") return false;
      return preset === "diagonal"
        ? groundIndex === responseIndex
        : groundIndex !== responseIndex;
    })),
  };
}

function enabledCellCount(mask: OpenEnaDirectionalMask) {
  return mask.enabled.reduce(
    (total, row) => total + row.reduce((rowTotal, enabled) => rowTotal + (enabled ? 1 : 0), 0),
    0,
  );
}

export function OpenEnaDirectionalMaskEditor({
  id,
  open,
  onOpenChange,
  value,
  onChange,
  copy,
  disabled = false,
}: OpenEnaDirectionalMaskEditorProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [announcement, setAnnouncement] = useState("");
  const errors = validateDirectionalMask(value);
  const valid = errors.length === 0;

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      closeRef.current?.focus();
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const applyPreset = (preset: OpenEnaDirectionalMaskPreset) => {
    if (!valid) return;
    const next = applyDirectionalMaskPreset(value, preset);
    onChange(next);
    setAnnouncement(copy.bulkAnnouncement(
      preset,
      enabledCellCount(next),
      next.codeOrder.length * next.codeOrder.length,
    ));
  };

  const toggleCell = (groundIndex: number, responseIndex: number) => {
    if (!valid) return;
    const next = cloneDirectionalMask(value);
    const enabled = !next.enabled[groundIndex][responseIndex];
    next.enabled[groundIndex][responseIndex] = enabled;
    onChange(next);
    setAnnouncement(copy.cellAnnouncement(
      next.codeOrder[groundIndex],
      next.codeOrder[responseIndex],
      enabled,
    ));
  };

  return (
    <div className="ena-directional-mask-editor" data-region-scope="model-codes">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-dialog`}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        {copy.triggerLabel}
      </button>

      {open ? (
        <section
          id={`${id}-dialog`}
          className="ena-directional-mask-sheet"
          role="dialog"
          aria-modal={false}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onOpenChange(false);
            }
          }}
        >
          <header>
            <div>
              <h4 id={`${id}-title`}>{copy.dialogTitle}</h4>
              <p id={`${id}-description`}>{copy.dialogDescription}</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={copy.closeLabel}
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className="ena-directional-mask-presets" role="group" aria-label={copy.matrixCaption}>
            <button type="button" disabled={!valid} onClick={() => applyPreset("all")}>{copy.allLabel}</button>
            <button type="button" disabled={!valid} onClick={() => applyPreset("none")}>{copy.noneLabel}</button>
            <button type="button" disabled={!valid} onClick={() => applyPreset("diagonal")}>{copy.diagonalLabel}</button>
            <button type="button" disabled={!valid} onClick={() => applyPreset("off-diagonal")}>{copy.offDiagonalLabel}</button>
          </div>

          {valid ? (
            <div className="ena-directional-mask-table-wrap">
              <table>
                <caption>{copy.matrixCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{copy.groundHeader}</th>
                    {value.codeOrder.map((response) => (
                      <th scope="col" key={response}>
                        <span>{copy.responseHeader}</span>
                        <span>{response}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {value.codeOrder.map((ground, groundIndex) => (
                    <tr key={ground}>
                      <th scope="row">
                        <span>{copy.groundHeader}</span>
                        <span>{ground}</span>
                      </th>
                      {value.codeOrder.map((response, responseIndex) => {
                        const diagonal = groundIndex === responseIndex;
                        return (
                          <td key={response} data-diagonal={diagonal ? "true" : "false"}>
                            <input
                              type="checkbox"
                              checked={value.enabled[groundIndex][responseIndex]}
                              aria-label={copy.cellLabel(ground, response, diagonal)}
                              onChange={() => toggleCell(groundIndex, responseIndex)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p role="alert">{copy.invalidMaskMessage}</p>}

          <p className="ena-directional-mask-announcement" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>
        </section>
      ) : null}
    </div>
  );
}
