import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BackToTop, { getScrollProgress } from "../components/BackToTop";
import * as backToTopModule from "../components/BackToTop";

type Listener = () => void;

interface ScrollProgressEventTarget {
  addEventListener(type: string, listener: Listener, options?: { passive?: boolean }): void;
  removeEventListener(type: string, listener: Listener): void;
}

interface ScrollProgressControllerOptions {
  windowTarget: ScrollProgressEventTarget;
  visualViewportTarget?: ScrollProgressEventTarget;
  requestAnimationFrame(callback: Listener): number;
  cancelAnimationFrame(frame: number): void;
  getMetrics(): { scrollTop: number; scrollHeight: number; clientHeight: number };
  publishProgress(progress: number): void;
}

type ScrollProgressController = (options: ScrollProgressControllerOptions) => () => void;
type ScrollToTop = (target: { scrollTo(options: { top: number; behavior: "auto" | "smooth" }): void }, reduceMotion: boolean) => void;

const createScrollProgressController = (
  backToTopModule as unknown as { createScrollProgressController?: ScrollProgressController }
).createScrollProgressController;
const scrollToTop = (backToTopModule as unknown as { scrollToTop?: ScrollToTop }).scrollToTop;
const source = readFileSync(new URL("../components/BackToTop.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

class FakeEventTarget implements ScrollProgressEventTarget {
  readonly addCalls: Array<{ type: string; options?: { passive?: boolean } }> = [];
  readonly removeCalls: string[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener, options?: { passive?: boolean }) {
    this.addCalls.push({ type, options });
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.removeCalls.push(type);
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function createFrameQueue() {
  let nextFrame = 1;
  const pending = new Map<number, Listener>();
  const cancelled: number[] = [];

  return {
    pending,
    cancelled,
    requestAnimationFrame(callback: Listener) {
      const frame = nextFrame++;
      pending.set(frame, callback);
      return frame;
    },
    cancelAnimationFrame(frame: number) {
      cancelled.push(frame);
      pending.delete(frame);
    },
    flush() {
      assert.equal(pending.size, 1, "exactly one animation frame should be pending");
      const [frame, callback] = pending.entries().next().value as [number, Listener];
      pending.delete(frame);
      callback();
      return frame;
    },
  };
}

function requireController() {
  assert.equal(typeof createScrollProgressController, "function", "missing executable scroll-progress controller");
  return createScrollProgressController as ScrollProgressController;
}

function requireScrollToTop() {
  assert.equal(typeof scrollToTop, "function", "missing executable return-to-top helper");
  return scrollToTop as ScrollToTop;
}

function getRuleBlock(stylesheet: string, selector: string) {
  const start = stylesheet.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS selector: ${selector}`);
  const bodyStart = stylesheet.indexOf("{", start);
  let depth = 0;

  for (let index = bodyStart; index < stylesheet.length; index += 1) {
    if (stylesheet[index] === "{") depth += 1;
    if (stylesheet[index] === "}") depth -= 1;
    if (depth === 0) return stylesheet.slice(start, index + 1);
  }

  assert.fail(`unterminated CSS selector: ${selector}`);
}

function getMediaBlocks(stylesheet: string, query: string) {
  const blocks: string[] = [];
  let searchStart = 0;

  while (true) {
    const start = stylesheet.indexOf(query, searchStart);
    if (start === -1) return blocks;

    const bodyStart = stylesheet.indexOf("{", start);
    let depth = 0;
    let end = bodyStart;

    for (; end < stylesheet.length; end += 1) {
      if (stylesheet[end] === "{") depth += 1;
      if (stylesheet[end] === "}") depth -= 1;
      if (depth === 0) break;
    }

    blocks.push(stylesheet.slice(start, end + 1));
    searchStart = end + 1;
  }
}

function relativeLuminance(hex: string) {
  const channels = hex.match(/[0-9a-f]{2}/giu);
  assert.ok(channels && channels.length === 3, `invalid color: ${hex}`);

  return channels
    .map((channel) => {
      const srgb = Number.parseInt(channel, 16) / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    })
    .reduce((luminance, channel, index) => luminance + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("scroll progress clamps page distance to an integer percentage", () => {
  assert.equal(getScrollProgress({ scrollTop: 0, scrollHeight: 1600, clientHeight: 800 }), 0);
  assert.equal(getScrollProgress({ scrollTop: 400, scrollHeight: 1600, clientHeight: 800 }), 50);
  assert.equal(getScrollProgress({ scrollTop: 800, scrollHeight: 1600, clientHeight: 800 }), 100);
  assert.equal(getScrollProgress({ scrollTop: 1200, scrollHeight: 1600, clientHeight: 800 }), 100);
  assert.equal(getScrollProgress({ scrollTop: -20, scrollHeight: 1600, clientHeight: 800 }), 0);
  assert.equal(getScrollProgress({ scrollTop: 40, scrollHeight: 700, clientHeight: 800 }), 0);
});

test("back-to-top renders the approved ENA progress-ring artwork and contrast outline", () => {
  const html = renderToStaticMarkup(
    React.createElement(BackToTop, {
      label: "Back to top",
      progressLabel: "Page scroll progress",
    }),
  );

  assert.match(html, /<button/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-label="Page scroll progress"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /r="22\.5"/);
  assert.match(html, /stroke-width="2\.6"/);
  assert.match(html, /fill="var\(--accent\)"/);
  assert.match(html, /stroke="#dfe6ee"/);
  assert.match(html, /stroke="#48d5e8"/);
  assert.match(html, /stroke="#172033"/);
  assert.match(html, /d="M28 37\.5V20\.5M19\.5 29 28 20\.5 36\.5 29"/);
  assert.match(html, /transform="rotate\(-90 28 28\)"/);
  assert.match(html, /data-track="page-progress-outline"/);
  assert.match(html, /stroke="var\(--accent-strong\)"/);
  assert.match(html, /stroke-width="5\.2"/);
  assert.match(html, /data-track="page-progress-arc"/);
  assert.ok(
    html.indexOf('data-track="page-progress-outline"') < html.indexOf('data-track="page-progress-arc"'),
    "the deep-blue outline must render beneath the cyan arc",
  );
  assert.doesNotMatch(html, />↑</u);
});

test("the approved deep-blue outline has a 3:1 boundary contrast without rounding", () => {
  for (const background of ["#dfe6ee", "#89cff0", "#48d5e8", "#ffffff"]) {
    assert.ok(
      contrastRatio("#1f6f9e", background) >= 3,
      `#1f6f9e must have at least 3:1 contrast against ${background}`,
    );
  }
});

test("scroll-progress controller subscribes once and coalesces notifications until flush", () => {
  const controller = requireController();
  const windowTarget = new FakeEventTarget();
  const visualViewportTarget = new FakeEventTarget();
  const frames = createFrameQueue();
  const progress: number[] = [];
  let metrics = { scrollTop: 200, scrollHeight: 1000, clientHeight: 600 };

  const cleanup = controller({
    windowTarget,
    visualViewportTarget,
    requestAnimationFrame: frames.requestAnimationFrame,
    cancelAnimationFrame: frames.cancelAnimationFrame,
    getMetrics: () => metrics,
    publishProgress: (value) => progress.push(value),
  });

  assert.deepEqual(windowTarget.addCalls, [
    { type: "scroll", options: { passive: true } },
    { type: "resize", options: undefined },
  ]);
  assert.deepEqual(visualViewportTarget.addCalls, [{ type: "resize", options: undefined }]);
  assert.equal(frames.pending.size, 1);

  windowTarget.dispatch("scroll");
  windowTarget.dispatch("resize");
  visualViewportTarget.dispatch("resize");
  assert.equal(frames.pending.size, 1);

  metrics = { scrollTop: 300, scrollHeight: 1000, clientHeight: 600 };
  frames.flush();
  assert.deepEqual(progress, [75]);
  cleanup();
});

test("scroll-progress controller cancels a pending frame and unregisters every listener", () => {
  const controller = requireController();
  const windowTarget = new FakeEventTarget();
  const visualViewportTarget = new FakeEventTarget();
  const frames = createFrameQueue();
  const progress: number[] = [];

  const cleanup = controller({
    windowTarget,
    visualViewportTarget,
    requestAnimationFrame: frames.requestAnimationFrame,
    cancelAnimationFrame: frames.cancelAnimationFrame,
    getMetrics: () => ({ scrollTop: 0, scrollHeight: 1000, clientHeight: 600 }),
    publishProgress: (value) => progress.push(value),
  });

  frames.flush();
  windowTarget.dispatch("scroll");
  assert.deepEqual([...frames.pending.keys()], [2]);
  cleanup();

  assert.deepEqual(frames.cancelled, [2]);
  assert.deepEqual(windowTarget.removeCalls, ["scroll", "resize"]);
  assert.deepEqual(visualViewportTarget.removeCalls, ["resize"]);
  windowTarget.dispatch("scroll");
  windowTarget.dispatch("resize");
  visualViewportTarget.dispatch("resize");
  assert.equal(frames.pending.size, 0);
  assert.deepEqual(progress, [0]);
});

test("return-to-top helper respects the reduced-motion choice", () => {
  const returnToTop = requireScrollToTop();
  const calls: Array<{ top: number; behavior: "auto" | "smooth" }> = [];
  const target = { scrollTo: (options: { top: number; behavior: "auto" | "smooth" }) => calls.push(options) };

  returnToTop(target, false);
  returnToTop(target, true);

  assert.deepEqual(calls, [
    { top: 0, behavior: "smooth" },
    { top: 0, behavior: "auto" },
  ]);
});

test("back-to-top CSS preserves the responsive and motion contracts", () => {
  const desktop = getRuleBlock(css, ".back-to-top");
  assert.match(desktop, /right: 20px;/u);
  assert.match(desktop, /bottom: calc\(5\.65rem \+ env\(safe-area-inset-bottom\)\);/u);
  assert.match(desktop, /z-index: 65;/u);
  assert.match(desktop, /width: 56px;/u);
  assert.match(desktop, /height: 56px;/u);

  const mobile = getMediaBlocks(css, "@media (max-width: 640px)").find((block) => block.includes(".back-to-top {"));
  assert.ok(mobile, "missing mobile public-page back-to-top override");
  const mobileControl = getRuleBlock(mobile, ".back-to-top");
  const mobileTooltip = getRuleBlock(mobile, ".back-to-top-tooltip");
  assert.match(mobileControl, /right: 16px;/u);
  assert.match(mobileControl, /bottom: calc\(5\.25rem \+ env\(safe-area-inset-bottom\)\);/u);
  assert.match(mobileControl, /width: 56px;/u);
  assert.match(mobileControl, /height: 56px;/u);
  assert.match(mobileTooltip, /display: none;/u);

  const progressTransition = getRuleBlock(
    css,
    '.back-to-top [data-track="page-progress-outline"],\n.back-to-top [data-track="page-progress-arc"]',
  );
  assert.match(progressTransition, /transition: stroke-dashoffset 140ms linear;/u);

  const reducedMotion = getMediaBlocks(css, "@media (prefers-reduced-motion: reduce)").find((block) =>
    block.includes('data-track="page-progress-outline"'),
  );
  assert.ok(reducedMotion, "missing reduced-motion outline override");
  assert.match(reducedMotion, /\.back-to-top,/u);
  assert.match(reducedMotion, /\.back-to-top-progress,/u);
  assert.match(reducedMotion, /\.back-to-top-tooltip,/u);
  assert.match(reducedMotion, /page-progress-outline/u);
  assert.match(reducedMotion, /page-progress-arc/u);
  assert.match(reducedMotion, /transition: none;/u);

  assert.match(getRuleBlock(css, "body:has(.open-ena-login-page) .back-to-top"), /display: none;/u);
  assert.match(getRuleBlock(css, "body:has(.open-ena-page) .back-to-top"), /display: none;/u);
  assert.match(
    getRuleBlock(css, ".back-to-top:hover .back-to-top-tooltip,\n.back-to-top:focus-visible .back-to-top-tooltip"),
    /opacity: 1;/u,
  );
});

test("the component uses the controller and current reduced-motion preference", () => {
  assert.match(source, /return createScrollProgressController\(/u);
  assert.match(source, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/u);
  assert.match(layout, /progressLabel=\{dictionary\.common\.pageScrollProgress\}/u);
});
