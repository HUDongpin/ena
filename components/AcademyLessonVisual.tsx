import type { AcademyVisual } from "@/lib/academy-types";

interface AcademyLessonVisualProps {
  variant: AcademyVisual;
  alt: string;
  sequence: number;
}

function FrameVisual() {
  return (
    <>
      <g className="academy-visual-rail">
        <rect x="46" y="104" width="172" height="292" rx="20" />
        <text x="72" y="142">MODEL SETUP</text>
        {[
          ["QUESTION", 188],
          ["UNIT", 238],
          ["CONVERSATION", 288],
          ["CODES", 338],
        ].map(([label, y], index) => (
          <g key={label} className={index === 1 ? "is-active" : undefined}>
            <circle cx="77" cy={Number(y) - 5} r="6" />
            <text x="96" y={y}>{label}</text>
          </g>
        ))}
      </g>
      <g className="academy-visual-network">
        <text x="278" y="126" className="academy-visual-section-label">RELATIONAL QUESTION</text>
        <line x1="355" y1="230" x2="492" y2="176" className="edge edge-strong" />
        <line x1="492" y1="176" x2="624" y2="275" className="edge edge-mid" />
        <line x1="624" y1="275" x2="493" y2="354" className="edge edge-strong" />
        <line x1="493" y1="354" x2="318" y2="321" className="edge edge-soft" />
        <line x1="318" y1="321" x2="355" y2="230" className="edge edge-mid" />
        <line x1="355" y1="230" x2="493" y2="354" className="edge edge-soft" />
        <g transform="translate(355 230)"><circle r="27" /><text y="47">GOAL</text></g>
        <g transform="translate(492 176)"><circle r="31" /><text y="52">EVIDENCE</text></g>
        <g transform="translate(624 275)"><circle r="25" /><text y="47">REVISION</text></g>
        <g transform="translate(493 354)"><circle r="28" /><text y="52">STRATEGY</text></g>
        <g transform="translate(318 321)"><circle r="23" /><text x="-61" y="48">TRADEOFF</text></g>
      </g>
      <g className="academy-visual-status">
        <rect x="278" y="407" width="348" height="40" rx="20" />
        <circle cx="302" cy="427" r="6" />
        <text x="320" y="432">ONE NETWORK = ONE TEAM</text>
      </g>
    </>
  );
}

function PrepareVisual() {
  const rows = [0, 1, 2, 3, 4, 5];
  const matrix = [
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 1, 1, 0, 0],
    [0, 0, 1, 1, 0],
    [1, 0, 1, 1, 0],
    [0, 1, 1, 0, 1],
  ];
  return (
    <>
      <text x="62" y="126" className="academy-visual-section-label">ORDERED SOURCE ROWS</text>
      <g className="academy-visual-table">
        <rect x="50" y="146" width="352" height="256" rx="18" />
        <rect x="50" y="146" width="352" height="42" rx="18" className="table-header" />
        <text x="72" y="173">LINE</text><text x="134" y="173">UNIT</text><text x="224" y="173">RAW EVIDENCE</text>
        {rows.map((row) => (
          <g key={row}>
            <line x1="50" y1={188 + row * 35.5} x2="402" y2={188 + row * 35.5} />
            <text x="76" y={212 + row * 35.5}>{row + 1}</text>
            <text x="132" y={212 + row * 35.5}>T-{String(row < 3 ? 1 : 2).padStart(2, "0")}</text>
            <rect x="224" y={199 + row * 35.5} width={94 + (row % 3) * 22} height="8" rx="4" className="evidence-line" />
          </g>
        ))}
      </g>
      <path d="M426 274 H474" className="academy-visual-arrow" />
      <path d="M464 264 L476 274 L464 284" className="academy-visual-arrow" />
      <text x="500" y="126" className="academy-visual-section-label">BINARY CODE MATRIX</text>
      <g className="academy-visual-matrix">
        <rect x="490" y="146" width="258" height="256" rx="18" />
        {["G", "E", "S", "T", "R"].map((label, index) => <text key={label} x={530 + index * 43} y="176">{label}</text>)}
        {matrix.map((row, rowIndex) => row.map((value, columnIndex) => (
          <rect
            key={`${rowIndex}-${columnIndex}`}
            x={514 + columnIndex * 43}
            y={196 + rowIndex * 31}
            width="24"
            height="24"
            rx="7"
            className={value ? "matrix-on" : "matrix-off"}
          />
        )))}
      </g>
      <g className="academy-visual-status">
        <rect x="490" y="417" width="258" height="40" rx="20" />
        <circle cx="514" cy="437" r="6" />
        <text x="532" y="442">48 ROWS VALIDATED</text>
      </g>
    </>
  );
}

function ModelVisual() {
  const groupA = [[104, 184], [130, 218], [152, 166], [176, 231]];
  const groupB = [[218, 128], [244, 164], [268, 114], [291, 150]];
  return (
    <>
      <g className="academy-visual-plot-frame">
        <rect x="46" y="110" width="430" height="318" rx="20" />
        <text x="70" y="142" className="academy-visual-section-label">COMPARISON PLOT</text>
        <line x1="91" y1="372" x2="428" y2="372" className="axis" />
        <line x1="91" y1="372" x2="91" y2="170" className="axis" />
        <line x1="259" y1="170" x2="259" y2="372" className="axis-grid" />
        <line x1="91" y1="271" x2="428" y2="271" className="axis-grid" />
        <g transform="translate(92 132)">
          {groupA.map(([x, y], index) => <circle key={`a-${index}`} cx={x} cy={y} r="9" className="point-a" />)}
          {groupB.map(([x, y], index) => <circle key={`b-${index}`} cx={x} cy={y} r="9" className="point-b" />)}
          <rect x="132" y="187" width="18" height="18" className="mean-a" />
          <path d="M249 131 l11 18 h-22 z" className="mean-b" />
        </g>
        <text x="109" y="402" className="plot-label">BASELINE</text>
        <text x="338" y="402" className="plot-label">SCAFFOLDED</text>
      </g>
      <g className="academy-visual-mini-network" transform="translate(506 110)">
        <rect width="242" height="146" rx="20" />
        <text x="22" y="34">BASELINE NETWORK</text>
        <line x1="56" y1="82" x2="121" y2="62" className="edge edge-mid" />
        <line x1="121" y1="62" x2="187" y2="94" className="edge edge-soft" />
        <line x1="56" y1="82" x2="138" y2="111" className="edge edge-soft" />
        <circle cx="56" cy="82" r="13" /><circle cx="121" cy="62" r="15" /><circle cx="187" cy="94" r="12" /><circle cx="138" cy="111" r="13" />
      </g>
      <g className="academy-visual-mini-network is-secondary" transform="translate(506 282)">
        <rect width="242" height="146" rx="20" />
        <text x="22" y="34">SCAFFOLDED NETWORK</text>
        <line x1="56" y1="82" x2="121" y2="62" className="edge edge-strong" />
        <line x1="121" y1="62" x2="187" y2="94" className="edge edge-strong" />
        <line x1="56" y1="82" x2="138" y2="111" className="edge edge-mid" />
        <line x1="138" y1="111" x2="187" y2="94" className="edge edge-mid" />
        <circle cx="56" cy="82" r="13" /><circle cx="121" cy="62" r="15" /><circle cx="187" cy="94" r="12" /><circle cx="138" cy="111" r="13" />
      </g>
      <text x="70" y="463" className="academy-visual-caption">ALL UNITS MODELED IN ONE SHARED ANALYTIC SPACE</text>
    </>
  );
}

function InterpretVisual() {
  return (
    <>
      <g className="academy-visual-interpret-network">
        <rect x="46" y="110" width="338" height="318" rx="20" />
        <text x="70" y="144" className="academy-visual-section-label">MODELED PATTERN</text>
        <line x1="116" y1="255" x2="214" y2="198" className="edge edge-strong" />
        <line x1="214" y1="198" x2="313" y2="264" className="edge edge-strong" />
        <line x1="313" y1="264" x2="224" y2="342" className="edge edge-mid" />
        <line x1="224" y1="342" x2="116" y2="255" className="edge edge-soft" />
        <line x1="116" y1="255" x2="313" y2="264" className="edge edge-mid" />
        <g transform="translate(116 255)"><circle r="24" /><text x="-34" y="49">GOAL</text></g>
        <g transform="translate(214 198)"><circle r="29" /><text x="-45" y="54">EVIDENCE</text></g>
        <g transform="translate(313 264)"><circle r="26" /><text x="-42" y="51">REVISION</text></g>
        <g transform="translate(224 342)"><circle r="22" /><text x="-44" y="48">STRATEGY</text></g>
      </g>
      <g className="academy-visual-evidence-panel">
        <rect x="420" y="110" width="328" height="318" rx="20" />
        <text x="444" y="144" className="academy-visual-section-label">SOURCE ROWS</text>
        {[
          ["TEAM-05 / LINE 02", 174, "EXIT TICKETS SHOW..."],
          ["TEAM-05 / LINE 06", 238, "REVISE AND CHECK..."],
          ["TEAM-08 / LINE 03", 302, "EVIDENCE CHECK..."],
        ].map(([label, y, excerpt], index) => (
          <g key={label} className={index === 1 ? "is-selected" : undefined}>
            <rect x="442" y={Number(y)} width="284" height="50" rx="12" />
            <circle cx="459" cy={Number(y) + 17} r="5" />
            <text x="473" y={Number(y) + 20}>{label}</text>
            <text x="459" y={Number(y) + 40} className="excerpt">{excerpt}</text>
          </g>
        ))}
        <rect x="442" y="372" width="284" height="34" rx="17" className="evidence-status" />
        <text x="463" y="394" className="evidence-status-text">PATTERN → EXCERPT → BOUNDED CLAIM</text>
      </g>
      <path d="M380 270 H424" className="academy-visual-arrow" />
      <path d="M414 260 L426 270 L414 280" className="academy-visual-arrow" />
      <text x="70" y="463" className="academy-visual-caption">RETURN FROM THE NETWORK TO THE CODED QUALITATIVE EVIDENCE</text>
    </>
  );
}

export default function AcademyLessonVisual({ variant, alt, sequence }: AcademyLessonVisualProps) {
  return (
    <div className={`academy-lesson-visual academy-lesson-visual-${variant}`} role="img" aria-label={alt} lang="en" dir="ltr">
      <svg viewBox="0 0 800 500" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`academy-grid-fade-${sequence}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7fbfe" />
            <stop offset="1" stopColor="#edf8fd" />
          </linearGradient>
          <pattern id={`academy-grid-${sequence}`} width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="#89cff0" strokeOpacity="0.28" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="800" height="500" rx="28" fill={`url(#academy-grid-fade-${sequence})`} />
        <rect width="800" height="500" rx="28" fill={`url(#academy-grid-${sequence})`} opacity="0.54" />
        <g className="academy-visual-topbar">
          <rect width="800" height="72" rx="28" />
          <rect y="48" width="800" height="24" />
          <circle cx="42" cy="36" r="8" /><circle cx="68" cy="36" r="8" /><circle cx="94" cy="36" r="8" />
          <text x="128" y="42">ENA ACADEMY / LESSON {String(sequence).padStart(2, "0")}</text>
          <text x="684" y="42" className="academy-visual-ready">READY</text>
        </g>
        {variant === "frame" ? <FrameVisual /> : null}
        {variant === "prepare" ? <PrepareVisual /> : null}
        {variant === "model" ? <ModelVisual /> : null}
        {variant === "interpret" ? <InterpretVisual /> : null}
      </svg>
    </div>
  );
}
