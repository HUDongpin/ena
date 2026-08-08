interface BackToTopProps {
  label: string;
}

export default function BackToTop({ label }: BackToTopProps) {
  return (
    <a href="#main-content" className="back-to-top focus-ring" aria-label={label}>
      <span aria-hidden="true">↑</span>
    </a>
  );
}
