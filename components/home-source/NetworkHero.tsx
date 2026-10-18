export default function NetworkHero() {
  return (
    <figure className="network-hero" aria-labelledby="network-hero-caption">
      <svg viewBox="0 0 620 520" role="img" aria-labelledby="network-title network-desc">
        <title id="network-title">An epistemic network moving through an open boundary</title>
        <desc id="network-desc">Connected nodes and weighted edges extend through an open circular frame.</desc>
        <defs>
          <linearGradient id="open-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#B9E5F8" />
            <stop offset="1" stopColor="#73C2E8" />
          </linearGradient>
          <filter id="soft-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#175F88" floodOpacity=".12" />
          </filter>
        </defs>
        <circle cx="290" cy="262" r="188" fill="#FFFFFF" stroke="#D9EEF7" strokeWidth="1.5" />
        <path d="M431 137A188 188 0 1 0 460 355" fill="none" stroke="url(#open-ring)" strokeWidth="27" strokeLinecap="round" />
        <g className="hero-grid" fill="none" stroke="#DDEBF1" strokeWidth="1">
          <path d="M130 262h322M291 98v331" />
          <circle cx="290" cy="262" r="105" />
        </g>
        <g className="hero-edges" fill="none" strokeLinecap="round">
          <path d="M189 290 270 185" stroke="#1A2B3F" strokeWidth="4" />
          <path d="M270 185 377 222" stroke="#89CFF0" strokeWidth="11" />
          <path d="M189 290 333 340" stroke="#89CFF0" strokeWidth="7" />
          <path d="M333 340 377 222" stroke="#1A2B3F" strokeWidth="3" />
          <path d="M270 185 333 340" stroke="#1A2B3F" strokeWidth="5" />
          <path d="M377 222 493 112" stroke="#89CFF0" strokeWidth="6" strokeDasharray="12 12" />
        </g>
        <g filter="url(#soft-shadow)">
          <g fill="#FFFFFF" stroke="#0F172A" strokeWidth="4">
            <circle cx="189" cy="290" r="18" />
            <circle cx="270" cy="185" r="18" />
            <circle cx="333" cy="340" r="18" />
          </g>
          <circle cx="377" cy="222" r="21" fill="#89CFF0" stroke="#0F172A" strokeWidth="4" />
          <circle cx="493" cy="112" r="22" fill="#89CFF0" stroke="#0F172A" strokeWidth="4" />
        </g>
        <g fill="#526477" fontFamily="Inter, Helvetica Neue, Arial, sans-serif" fontSize="12" fontWeight="700" letterSpacing="1.1">
          <text x="156" y="326">EVIDENCE</text>
          <text x="240" y="154">IDEAS</text>
          <text x="300" y="382">CONTEXT</text>
          <text x="363" y="190">LINKS</text>
          <text x="470" y="75" fill="#175F88">OPEN</text>
        </g>
      </svg>
      <figcaption id="network-hero-caption">
        <span aria-hidden="true" />
        Knowledge structures remain inspectable—from coded evidence to connected ideas.
      </figcaption>
    </figure>
  );
}
