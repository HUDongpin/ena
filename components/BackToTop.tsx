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

interface ScrollProgressEventTarget {
  addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface ScrollProgressControllerOptions {
  windowTarget: ScrollProgressEventTarget;
  visualViewportTarget?: ScrollProgressEventTarget;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(frame: number): void;
  getMetrics(): ScrollProgressMetrics;
  publishProgress(progress: number): void;
}

interface ScrollToTopTarget {
  scrollTo(options: { top: number; behavior: "auto" | "smooth" }): void;
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

export function createScrollProgressController({
  windowTarget,
  visualViewportTarget,
  requestAnimationFrame,
  cancelAnimationFrame,
  getMetrics,
  publishProgress,
}: ScrollProgressControllerOptions) {
  let animationFrame: number | null = null;

  function updateProgress() {
    animationFrame = null;
    publishProgress(getScrollProgress(getMetrics()));
  }

  function requestProgressUpdate() {
    if (animationFrame !== null) return;
    animationFrame = requestAnimationFrame(updateProgress);
  }

  requestProgressUpdate();
  windowTarget.addEventListener("scroll", requestProgressUpdate, { passive: true });
  windowTarget.addEventListener("resize", requestProgressUpdate);
  visualViewportTarget?.addEventListener("resize", requestProgressUpdate);

  return () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    windowTarget.removeEventListener("scroll", requestProgressUpdate);
    windowTarget.removeEventListener("resize", requestProgressUpdate);
    visualViewportTarget?.removeEventListener("resize", requestProgressUpdate);
  };
}

export function scrollToTop(target: ScrollToTopTarget, reduceMotion: boolean) {
  target.scrollTo({
    top: 0,
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

export default function BackToTop({ label, progressLabel }: BackToTopProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const progressOffset = progressCircleCircumference * (1 - scrollProgress / 100);

  useEffect(() => {
    const visualViewport = window.visualViewport;

    return createScrollProgressController({
      windowTarget: window,
      visualViewportTarget: visualViewport ?? undefined,
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      cancelAnimationFrame: (animationFrame) => window.cancelAnimationFrame(animationFrame),
      getMetrics: () => {
        const root = document.documentElement;
        const body = document.body;

        return {
          scrollTop: window.scrollY || root.scrollTop || body?.scrollTop || 0,
          scrollHeight: Math.max(root.scrollHeight, body?.scrollHeight ?? 0),
          clientHeight: window.innerHeight || root.clientHeight,
        };
      },
      publishProgress: setScrollProgress,
    });
  }, []);

  function handleClick() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    scrollToTop(window, reduceMotion);
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
          stroke="var(--accent-strong)"
          strokeWidth="5.2"
          strokeLinecap="round"
          data-track="page-progress-outline"
          strokeDasharray={progressCircleCircumference}
          strokeDashoffset={progressOffset}
          transform="rotate(-90 28 28)"
        />
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
