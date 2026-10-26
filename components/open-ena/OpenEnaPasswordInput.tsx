"use client";

import { useState, type InputHTMLAttributes } from "react";

interface OpenEnaPasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  id: string;
  showPasswordLabel: string;
  hidePasswordLabel: string;
}

export default function OpenEnaPasswordInput({
  id,
  showPasswordLabel,
  hidePasswordLabel,
  ...inputProps
}: OpenEnaPasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? hidePasswordLabel : showPasswordLabel;

  return (
    <div className="open-ena-password-field">
      <input {...inputProps} id={id} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="open-ena-password-toggle"
        aria-label={toggleLabel}
        aria-controls={id}
        title={toggleLabel}
        onClick={() => setVisible((current) => !current)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? <path d="m3 3 18 18" /> : null}
        </svg>
      </button>
    </div>
  );
}
