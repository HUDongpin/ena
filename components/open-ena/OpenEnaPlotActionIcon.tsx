import type { ReactNode } from "react";

export type OpenEnaPlotActionIconName =
  | "zoom-in"
  | "zoom-out"
  | "recenter"
  | "copy"
  | "switch"
  | "hide"
  | "show"
  | "remove"
  | "restore";

const PATHS: Record<OpenEnaPlotActionIconName, ReactNode> = {
  "zoom-in": <path d="M9.5 3a6.5 6.5 0 1 0 3.96 11.65L19.8 21 21 19.8l-6.35-6.34A6.5 6.5 0 0 0 9.5 3Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM8.7 7v1.7H7v1.6h1.7V12h1.6v-1.7H12V8.7h-1.7V7H8.7Z" />,
  "zoom-out": <path d="M9.5 3a6.5 6.5 0 1 0 3.96 11.65L19.8 21 21 19.8l-6.35-6.34A6.5 6.5 0 0 0 9.5 3Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM7 8.7h5v1.6H7V8.7Z" />,
  recenter: <path d="M11 2h2v3.08A7.01 7.01 0 0 1 18.92 11H22v2h-3.08A7.01 7.01 0 0 1 13 18.92V22h-2v-3.08A7.01 7.01 0 0 1 5.08 13H2v-2h3.08A7.01 7.01 0 0 1 11 5.08V2Zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />,
  copy: <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 14H8V7h11v12Z" />,
  switch: <path d="M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7V7Zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11v2Z" />,
  hide: <path d="M2.1 3.5 3.5 2.1l18.4 18.4-1.4 1.4-3.1-3.1A11.7 11.7 0 0 1 12 20C6.5 20 2.1 16.6.4 12c.8-2.1 2.2-4 4-5.4L2.1 3.5ZM12 4c5.5 0 9.9 3.4 11.6 8a12.2 12.2 0 0 1-3.2 4.7l-2-2A7 7 0 0 0 9.3 5.3 12 12 0 0 1 12 4Zm-6.2 4L8 10.2A4.2 4.2 0 0 0 13.8 16l2.2 2.2c-1.2.5-2.6.8-4 .8-4.3 0-7.9-2.5-9.4-7 .7-1.6 1.8-3 3.2-4Zm4.1 4.1 2 2a2.2 2.2 0 0 1-2-2Zm2.2-2.2-2-2A4.2 4.2 0 0 1 16 13.8l-2-2a2.2 2.2 0 0 0-1.9-1.9Z" />,
  show: <path d="M12 4c5.5 0 9.9 3.4 11.6 8C21.9 16.6 17.5 20 12 20S2.1 16.6.4 12C2.1 7.4 6.5 4 12 4Zm0 2c-4.3 0-7.9 2.5-9.4 6 1.5 3.5 5.1 6 9.4 6s7.9-2.5 9.4-6C19.9 8.5 16.3 6 12 6Zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />,
  remove: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16ZM7 11h10v2H7v-2Z" />,
  restore: <path d="M7 10V7.5A2.5 2.5 0 0 1 9.5 5h1V3l4 3-4 3V7h-1a.5.5 0 0 0-.5.5V10H7Zm4 1.5a2 2 0 0 1 4 0V13h1.2c1 0 1.8.8 1.8 1.8V21H8v-6.2c0-1 .8-1.8 1.8-1.8H11v-1.5Zm2 0V15h-3v4h6v-4h-3v-3.5Z" />,
};

export default function OpenEnaPlotActionIcon({ name }: { name: OpenEnaPlotActionIconName }) {
  return (
    <svg
      className="ena-official-action-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
