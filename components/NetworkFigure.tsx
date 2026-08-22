interface NetworkFigureProps {
  title: string;
  caption: string;
  labels: [string, string, string, string, string];
}

const nodes = [
  { x: 118, y: 118 },
  { x: 306, y: 82 },
  { x: 405, y: 207 },
  { x: 268, y: 288 },
  { x: 92, y: 250 },
];

export default function NetworkFigure({ title, caption, labels }: NetworkFigureProps) {
  return (
    <figure className="network-figure">
      <div className="plot-header">
        <div>
          <span className="plot-kicker">ENA</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="plot-canvas">
        <svg
          viewBox="0 0 500 360"
          role="img"
          aria-label={caption}
          preserveAspectRatio="xMidYMid meet"
        >
          <g className="plot-grid" aria-hidden="true">
            <path d="M42 72H462M42 156H462M42 240H462M42 324H462" />
            <path d="M72 38V330M174 38V330M276 38V330M378 38V330" />
          </g>
          <g fill="none" strokeLinecap="round">
            <path className="edge edge-medium" d="M118 118L306 82" />
            <path className="edge edge-strong" d="M306 82L405 207" />
            <path className="edge edge-light" d="M405 207L268 288" />
            <path className="edge edge-strong" d="M268 288L92 250" />
            <path className="edge edge-medium" d="M92 250L118 118" />
            <path className="edge edge-light" d="M118 118L405 207" />
            <path className="edge edge-strongest" d="M306 82L268 288" />
            <path className="edge edge-medium" d="M118 118L268 288" />
            <path className="edge edge-light" d="M306 82L92 250" />
          </g>
          <g>
            {nodes.map((node, index) => (
              <g key={`${node.x}-${node.y}`} transform={`translate(${node.x} ${node.y})`}>
                <circle className="node-halo" r="23" />
                <circle className="node" r="10" />
                <text
                  className="node-label"
                  y={index === 0 || index === 1 ? -31 : index === 2 ? 35 : 39}
                  textAnchor="middle"
                >
                  {labels[index]}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
