import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const classifierUrl = new URL(
  "./support/open-ena-browser-warning-classifier.mjs",
  import.meta.url,
);
const classifierPath = fileURLToPath(classifierUrl);

async function loadClassifier() {
  assert.equal(
    existsSync(classifierPath),
    true,
    "the pure browser warning classifier module is missing",
  );
  return await import(classifierUrl.href);
}

const currentOrigin = "http://127.0.0.1:34807";
const advisoryText = "Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true. See: https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently";

function warningFor(sourcePath = "/_next/static/chunks/32s-eijjk505p.js", overrides = {}) {
  return {
    text: advisoryText,
    location: {
      url: currentOrigin + sourcePath,
      lineNumber: 1914,
      columnNumber: 0,
      ...overrides,
    },
  };
}

test("classifies the exact Chromium Canvas2D advisory from the observed Next chunk", async () => {
  const { classifyChromiumCanvasReadbackDiagnostic } = await loadClassifier();

  assert.deepEqual(
    classifyChromiumCanvasReadbackDiagnostic({
      browser: "chromium",
      currentOrigin,
      warning: warningFor(),
    }),
    {
      normalizedPattern: "Canvas2D exact willReadFrequently advisory",
      sourcePath: "/_next/static/chunks/32s-eijjk505p.js",
      reportedLineNumber: 1914,
      reportedColumnNumber: 0,
    },
  );
});

test("accepts only same-origin Next static JavaScript chunk paths", async () => {
  const { classifyChromiumCanvasReadbackDiagnostic } = await loadClassifier();
  const acceptedPaths = [
    "/_next/static/chunks/32s-eijjk505p.js",
    "/_next/static/chunks/1234-abcd-efgh.js",
    "/_next/static/immutable/chunks/2532syt7n1xoc.js",
  ];

  for (const sourcePath of acceptedPaths) {
    assert.equal(
      classifyChromiumCanvasReadbackDiagnostic({
        browser: "chromium",
        currentOrigin,
        warning: warningFor(sourcePath),
      })?.sourcePath,
      sourcePath,
    );
  }

  assert.equal(
    classifyChromiumCanvasReadbackDiagnostic({
      browser: "chromium",
      currentOrigin,
      warning: warningFor("/_next/static/chunks/32s-eijjk505p.js?cache=1#fragment"),
    })?.sourcePath,
    "/_next/static/chunks/32s-eijjk505p.js",
  );
});

test("rejects unknown warnings and unsafe or malformed diagnostic locations", async () => {
  const { classifyChromiumCanvasReadbackDiagnostic } = await loadClassifier();
  const validWarning = warningFor();
  const rejected = [
    {
      browser: "firefox",
      currentOrigin,
      warning: validWarning,
    },
    {
      browser: "chromium",
      currentOrigin,
      warning: {
        ...validWarning,
        text: validWarning.text + " unexpected suffix",
      },
    },
    {
      browser: "chromium",
      currentOrigin,
      warning: warningFor("/_next/static/media/32s-eijjk505p.js"),
    },
    {
      browser: "chromium",
      currentOrigin,
      warning: warningFor("/_next/static/immutable/chunks/evil.js"),
    },
    {
      browser: "chromium",
      currentOrigin,
      warning: {
        ...validWarning,
        location: {
          ...validWarning.location,
          url: "https://attacker.example/_next/static/chunks/32s-eijjk505p.js",
        },
      },
    },
    {
      browser: "chromium",
      currentOrigin,
      warning: {
        ...validWarning,
        location: {
          ...validWarning.location,
          url: currentOrigin + ".attacker.example/_next/static/chunks/32s-eijjk505p.js",
        },
      },
    },
    {
      browser: "chromium",
      currentOrigin,
      warning: warningFor("/_next/static/chunks/32s-eijjk505p.JS"),
    },
    {
      browser: "chromium",
      currentOrigin,
      warning: warningFor("/_next/static/chunks/32s-eijjk505p.js", { lineNumber: -1 }),
    },
    {
      browser: "chromium",
      currentOrigin,
      warning: "not a structured warning",
    },
    {
      browser: "chromium",
      currentOrigin: "https://synthetic-user:synthetic-password@example.test",
      warning: validWarning,
    },
    {
      browser: "chromium",
      currentOrigin: "https://example.test?redirect=1",
      warning: validWarning,
    },
  ];

  for (const input of rejected) {
    assert.equal(classifyChromiumCanvasReadbackDiagnostic(input), null);
  }
});

test("does not mutate the warning object while classifying it", async () => {
  const { classifyChromiumCanvasReadbackDiagnostic } = await loadClassifier();
  const warning = Object.freeze({
    ...warningFor(),
    location: Object.freeze(warningFor().location),
  });

  assert.doesNotThrow(() => classifyChromiumCanvasReadbackDiagnostic({
    browser: "chromium",
    currentOrigin,
    warning,
  }));
  assert.equal(warning.text, advisoryText);
  assert.equal(warning.location.url, currentOrigin + "/_next/static/chunks/32s-eijjk505p.js");
  assert.equal(warning.location.lineNumber, 1914);
});
