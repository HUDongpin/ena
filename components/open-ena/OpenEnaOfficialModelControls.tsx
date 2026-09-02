"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";

export interface OpenEnaOfficialFieldPathEditorProps {
  label: string;
  selectedFields: readonly string[];
  options: readonly string[];
  disabled?: boolean;
  onChange: (fields: string[]) => void;
}

export function OpenEnaOfficialFieldPathEditor({
  label,
  selectedFields,
  options,
  disabled = false,
  onChange,
}: OpenEnaOfficialFieldPathEditorProps) {
  const pickerId = useId();
  const [open, setOpen] = useState(false);
  const selected = new Set(selectedFields);

  function setField(field: string, checked: boolean) {
    if (checked) {
      if (!selected.has(field)) onChange([...selectedFields, field]);
      return;
    }
    onChange(selectedFields.filter((candidate) => candidate !== field));
  }

  return (
    <section
      className="ena-official-field-editor"
      data-ena-official-field-path="true"
      aria-label={label}
    >
      <div className="ena-official-field-path">
        <div
          className="ena-official-field-path-segments"
          style={{ "--ena-official-field-count": Math.max(1, selectedFields.length) } as CSSProperties}
        >
          {selectedFields.length === 0 ? (
            <span className="ena-official-field-path-empty">Add field</span>
          ) : selectedFields.map((field) => (
            <span className="ena-official-field-path-segment" key={field}>
              <span className="ena-official-drag-dots" aria-hidden="true">
                <i /><i /><i />
              </span>
              <span className="ena-official-field-name">{field}</span>
              <button
                type="button"
                className="ena-official-field-remove"
                aria-label={`Remove ${field} from ${label}`}
                disabled={disabled}
                onClick={() => setField(field, false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          className="ena-official-field-path-add"
          aria-label={`Add or remove ${label} fields`}
          aria-controls={pickerId}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true">＋</span>
        </button>
      </div>

      <div id={pickerId} className="ena-official-field-picker" hidden={!open}>
        {options.map((field) => (
          <label key={field}>
            <input
              type="checkbox"
              checked={selected.has(field)}
              disabled={disabled}
              onChange={(event) => setField(field, event.target.checked)}
            />
            <span>{field}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

export interface OpenEnaOfficialTwoEndedSwitchProps {
  label: string;
  startLabel: string;
  endLabel: string;
  endSelected: boolean;
  disabled?: boolean;
  boundary?: string;
  onChange?: (endSelected: boolean) => void;
}

export function OpenEnaOfficialTwoEndedSwitch({
  label,
  startLabel,
  endLabel,
  endSelected,
  disabled = false,
  boundary,
  onChange,
}: OpenEnaOfficialTwoEndedSwitchProps) {
  const boundaryId = useId();
  return (
    <div className="ena-official-two-ended-switch">
      <div className="ena-official-two-ended-switch-control">
        <span data-selected={!endSelected ? "true" : "false"}>{startLabel}</span>
        <button
          type="button"
          role="switch"
          className="ena-official-switch-track"
          aria-label={label}
          aria-checked={endSelected}
          aria-describedby={boundary ? boundaryId : undefined}
          title={boundary}
          disabled={disabled}
          onClick={() => onChange?.(!endSelected)}
        >
          <span aria-hidden="true" />
        </button>
        <span data-selected={endSelected ? "true" : "false"}>{endLabel}</span>
      </div>
      {boundary ? <p id={boundaryId} className="ena-official-switch-boundary">{boundary}</p> : null}
    </div>
  );
}

export type OpenEnaOfficialIconName =
  | "add"
  | "collapse"
  | "mean"
  | "visibility"
  | "exclude"
  | "reset";

function iconGlyph(icon: OpenEnaOfficialIconName): ReactNode {
  if (icon === "add") return <path d="M12 5v14M5 12h14" />;
  if (icon === "collapse") return <><path d="m7 10 5-5 5 5" /><path d="M12 5v14" /><path d="M6 19h12" /></>;
  if (icon === "mean") return <><path d="M4 12h16M12 4v16" /><rect x="9" y="9" width="6" height="6" /></>;
  if (icon === "visibility") return <><path d="M3 4.5 21 19.5" /><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" /><path d="M6.2 7.1C4.5 8.3 3.3 10 2.5 12c2 4 5.2 6 9.5 6 1.5 0 2.9-.3 4.1-.8" /><path d="M9.8 6.2c.7-.1 1.4-.2 2.2-.2 4.3 0 7.5 2 9.5 6-.5 1.1-1.2 2.1-2 2.9" /></>;
  if (icon === "exclude") return <><circle cx="12" cy="12" r="8" /><path d="M8 12h8" /></>;
  return <><path d="M4.5 10a8 8 0 1 1 1.3 7" /><path d="M4 5v5h5" /></>;
}

export function OpenEnaOfficialIconButton({
  icon,
  ariaLabel,
  title,
  disabled = false,
  onClick,
}: {
  icon: OpenEnaOfficialIconName;
  ariaLabel: string;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="ena-official-icon-button"
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {iconGlyph(icon)}
      </svg>
    </button>
  );
}
