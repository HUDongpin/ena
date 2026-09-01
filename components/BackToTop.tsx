"use client";

import { useEffect, useState } from "react";

interface BackToTopProps {
  label: string;
  progressLabel: string;
}

interface ScrollProgressMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

const progressCircleRadius = 22.5;
const progressCircleCircumference = 2 * Math.PI * progressCircleRadius;

export function getScrollProgress({
  scrollTop,
  scrollHeight,
  clientHeight,
}: ScrollProgressMetrics) {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  if (maxScroll === 0) return 0;

  const progress = (scrollTop / maxScroll) * 100;
  return Math.round(Math.min(100, Math.max(0, progress)));
}

export default function BackToTop({ label, progressLabel }: BackToTopProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const progressOffset = progressCircleCircumference * (1 - scrollProgress / 100);

  useEffect(() => {
    let animationFrame = 0;

    function updateProgress() {
      animationFrame = 0;
      const root = document.documentElement;
      const body = document.body;

      setScrollProgress(
        getScrollProgress({
          scrollTop: window.scrollY || root.scrollTop || body?.scrollTop || 0,
          scrollHeight: Math.max(root.scrollHeight, body?.scrollHeight ?? 0),
          clientHeight: window.innerHeight || root.clientHeight,
        }),
      );
    }

    function requestProgressUpdate() {
      if (animationFrame !== 0) return;
      animationFrame = window.requestAnimationFrame(updateProgress);
    }

    requestProgressUpdate();
    window.addEventListener("scroll", requestProgressUpdate, { passive: true });
    window.addEventListener("resize", requestProgressUpdate);
    window.visualViewport?.addEventListener("resize", requestProgressUpdate);

    return () => {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", requestProgressUpdate);
      window.removeEventListener("resize", requestProgressUpdate);
      window.visualViewport?.removeEventListener("resize", requestProgressUpdate);
    };
  }, []);

  function handleClick() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  return (
    <button type="button" className="back-to-top focus-ring" aria-label={label} onClick={handleClick}>
      <svg
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={scrollProgress}
        viewBox="0 0 56 56"
        className="back-to-top-progress"
      >
        <g data-artwork="back-to-top-base" aria-hidden="true">
          <circle cx="28" cy="31.5" r="21" fill="#d8e0e9" opacity="0.45" />
          <circle cx="28" cy="28" r="21.3" fill="var(--accent)" />
          <circle
            data-track="page-progress-track"
            cx="28"
            cy="28"
            r={progressCircleRadius}
            fill="none"
            stroke="#dfe6ee"
            strokeWidth="2.6"
          />
          <path
            d="M28 37.5V20.5M19.5 29 28 20.5 36.5 29"
            fill="none"
            stroke="#172033"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <circle
          cx="28"
          cy="28"
          r={progressCircleRadius}
          fill="none"
          stroke="#48d5e8"
          strokeWidth="2.6"
          strokeLinecap="round"
          data-track="page-progress-arc"
          strokeDasharray={progressCircleCircumference}
          strokeDashoffset={progressOffset}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <span className="back-to-top-tooltip" aria-hidden="true">{label}</span>
    </button>
  );
}
