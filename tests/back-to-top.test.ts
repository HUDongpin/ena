import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BackToTop, { getScrollProgress } from "../components/BackToTop";

const source = readFileSync(new URL("../components/BackToTop.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");

test("scroll progress clamps page distance to an integer percentage", () => {
  assert.equal(getScrollProgress({ scrollTop: 0, scrollHeight: 1600, clientHeight: 800 }), 0);
  assert.equal(getScrollProgress({ scrollTop: 400, scrollHeight: 1600, clientHeight: 800 }), 50);
  assert.equal(getScrollProgress({ scrollTop: 800, scrollHeight: 1600, clientHeight: 800 }), 100);
  assert.equal(getScrollProgress({ scrollTop: 1200, scrollHeight: 1600, clientHeight: 800 }), 100);
  assert.equal(getScrollProgress({ scrollTop: -20, scrollHeight: 1600, clientHeight: 800 }), 0);
  assert.equal(getScrollProgress({ scrollTop: 40, scrollHeight: 700, clientHeight: 800 }), 0);
});

test("back-to-top renders the approved ENA progress-ring artwork", () => {
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
  assert.match(html, /data-track="page-progress-arc"/);
  assert.doesNotMatch(html, />↑</u);
});

test("back-to-top throttles progress updates and honors reduced motion", () => {
  assert.match(source, /requestAnimationFrame\(updateProgress\)/u);
  assert.match(source, /addEventListener\("scroll", requestProgressUpdate, \{ passive: true \}\)/u);
  assert.match(source, /addEventListener\("resize", requestProgressUpdate\)/u);
  assert.match(source, /visualViewport\?\.addEventListener\("resize", requestProgressUpdate\)/u);
  assert.match(source, /cancelAnimationFrame\(animationFrame\)/u);
  assert.match(source, /removeEventListener\("scroll", requestProgressUpdate\)/u);
  assert.match(source, /removeEventListener\("resize", requestProgressUpdate\)/u);
  assert.match(source, /prefers-reduced-motion: reduce/u);
  assert.match(source, /behavior: reduceMotion \? "auto" : "smooth"/u);
  assert.match(source, /window\.scrollTo\(\{[\s\S]*?top: 0/u);
  assert.match(layout, /progressLabel=\{dictionary\.common\.pageScrollProgress\}/u);
});
