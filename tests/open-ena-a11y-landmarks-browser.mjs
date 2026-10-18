import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const projectRoot = process.cwd();
const require = createRequire(`${projectRoot}/package.json`);
const { build } = require("esbuild");
const { chromium } = require("playwright");

function workspaceEntry(locale) {
  return `
import React from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import LocaleLayout from "./app/[locale]/layout";
import { SkipLink } from "./components/SkipLink";
import OpenEnaWorkspace from "./components/open-ena/OpenEnaWorkspace";
const worker = () => new Promise(() => {});
const locale = ${JSON.stringify(locale)};
const root = document.getElementById("root");
const workspace = React.createElement(OpenEnaWorkspace, { locale, worker });
LocaleLayout({ children: workspace, params: Promise.resolve({ locale }) }).then((shell) => {
  root.innerHTML = renderToStaticMarkup(shell);
  const rendered = root.querySelector("a.skip-link");
  const host = document.createElement("span");
  rendered.replaceWith(host);
  createRoot(host).render(React.createElement(SkipLink, {
    skipToContent: rendered.textContent,
    skipToWorkspace: ${JSON.stringify(locale === "zh-hant" ? "跳至工作區" : locale === "zh-hans" ? "跳至工作区" : "Skip to workspace")},
  }));
  const main = root.querySelector("#main-content");
  main.replaceChildren();
  createRoot(main).render(React.createElement(React.StrictMode, null, workspace));
});
`;
}

const homeEntry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import LocaleLayout from "./app/[locale]/layout";
import { SkipLink } from "./components/SkipLink";
import HomePage from "./app/[locale]/page";
const locale = "en";
HomePage({ params: Promise.resolve({ locale }) }).then((page) => (
  LocaleLayout({ children: page, params: Promise.resolve({ locale }) })
)).then((shell) => {
  const root = document.getElementById("root");
  root.innerHTML = renderToStaticMarkup(shell);
  const rendered = root.querySelector("a.skip-link");
  const host = document.createElement("span");
  rendered.replaceWith(host);
  createRoot(host).render(React.createElement(SkipLink, {
    skipToContent: rendered.textContent,
    skipToWorkspace: "Skip to workspace",
  }));
});
`;

async function bundleEntry(contents, sourcefile) {
  const result = await build({
    stdin: { contents, loader: "tsx", resolveDir: projectRoot, sourcefile },
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    write: false,
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"development"' },
    banner: { js: "var process = { env: { NODE_ENV: 'development' } };" },
    plugins: [{
      name: "stub-next-navigation",
      setup(pluginBuild) {
        const stubs = {
          "next/navigation": `${projectRoot}/tests/helpers/a11y-next-navigation-stub.js`,
          "next/link": `${projectRoot}/tests/helpers/a11y-next-link-stub.tsx`,
          "next/image": `${projectRoot}/tests/helpers/a11y-next-image-stub.tsx`,
        };
        pluginBuild.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (args) => ({ path: stubs[args.path] }));
      },
    }],
  });
  return result.outputFiles[0].text;
}

const WORKSPACE_LOCALES = [
  { locale: "en", label: "Skip to workspace", toolbar: "Analysis mode toolbar" },
  { locale: "zh-hant", label: "跳至工作區", toolbar: "分析模式工具列" },
  { locale: "zh-hans", label: "跳至工作区", toolbar: "分析模式工具栏" },
];

const loginEntry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import LocaleLayout from "./app/[locale]/layout";
import { SkipLink } from "./components/SkipLink";
import OpenEnaLogin from "./components/open-ena/OpenEnaLogin";
const locale = "en";
const page = React.createElement(OpenEnaLogin, { locale, error: false, configurationReady: true });
LocaleLayout({ children: page, params: Promise.resolve({ locale }) }).then((shell) => {
  const root = document.getElementById("root");
  root.innerHTML = renderToStaticMarkup(shell);
  const rendered = root.querySelector("a.skip-link");
  const host = document.createElement("span");
  rendered.replaceWith(host);
  createRoot(host).render(React.createElement(SkipLink, {
    skipToContent: rendered.textContent,
    skipToWorkspace: "Skip to workspace",
  }));
});
`;

const bundles = {
  home: await bundleEntry(homeEntry, "open-ena-a11y-landmarks-home.tsx"),
  login: await bundleEntry(loginEntry, "open-ena-a11y-landmarks-login.tsx"),
};
for (const { locale } of WORKSPACE_LOCALES) {
  bundles[locale] = await bundleEntry(workspaceEntry(locale), `open-ena-a11y-landmarks-${locale}.tsx`);
}
const css = await readFile(`${projectRoot}/app/globals.css`, "utf8");
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div>`;

const RAILS = [
  {
    id: "data",
    button: "Data",
    region: "Data",
    control: (panel) => panel.getByRole("button", { name: "Load sample", exact: true }),
  },
  {
    id: "model",
    button: "Model",
    region: "Model",
    control: (panel) => panel.locator("[data-model-tab='units']"),
  },
  {
    id: "plot",
    button: "Plot Tools",
    region: "Plot Tools panel",
    control: (panel) => panel.getByRole("checkbox", { name: "Points", exact: true }),
  },
  {
    id: "stats",
    button: "Stats & Export",
    region: "Stats & Export",
    control: (panel) => panel.getByRole("combobox", { name: "Primary group", exact: true }),
  },
  {
    id: "ai",
    button: "AI-assisted interpretation",
    region: "AI",
    control: (panel) => panel.getByRole("button", { name: "Open Stats", exact: true }),
  },
];

const VIEWPORTS = [
  { width: 1440, height: 900, columns: 3, sideBySide: true },
  { width: 768, height: 1024, columns: 1, sideBySide: false },
  { width: 390, height: 844, columns: 1, sideBySide: false },
  { width: 320, height: 568, columns: 1, sideBySide: false },
];

const RAIL_FOCUS_ORDER = ["Data", "Model", "Plot Tools", "Stats & Export", "AI-assisted interpretation"];

function duplicateNames(entries) {
  const seen = new Set();
  const duplicates = [];
  for (const entry of entries) {
    const key = `${entry.role}:${entry.name}`;
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }
  return duplicates;
}

async function landmarkEntries(page) {
  const roles = ["region", "navigation", "main", "complementary", "banner", "contentinfo", "search", "form"];
  const entries = [];
  for (const role of roles) {
    const locator = page.getByRole(role);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const name = await locator.nth(index).evaluate((element) => {
        const labelledBy = element.getAttribute("aria-labelledby");
        if (labelledBy) {
          return labelledBy.split(/\s+/u)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
            .replace(/\s+/gu, " ")
            .trim();
        }
        return (element.getAttribute("aria-label") ?? "").trim();
      });
      entries.push({ role, name });
    }
  }
  return entries;
}

async function overflowReport(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = [];
    for (const element of document.body.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      if (style.position === "fixed" || style.display === "none" || style.visibility === "hidden") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) continue;
      if (rect.right > viewportWidth + 1 || rect.left < -1) {
        offenders.push({
          tag: element.tagName.toLowerCase(),
          className: String(element.className).slice(0, 100),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: viewportWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 8),
    };
  });
}

async function reachesViewport(page, locator) {
  return locator.evaluate((element) => {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.bottom <= 0 || rect.top >= viewportHeight || rect.right <= 0 || rect.left >= viewportWidth) return false;
    let parent = element.parentElement;
    while (parent && parent !== document.documentElement) {
      const style = getComputedStyle(parent);
      const clips = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
      if (/hidden|clip/u.test(clips)) {
        const box = parent.getBoundingClientRect();
        const visibleWidth = Math.min(rect.right, box.right) - Math.max(rect.left, box.left);
        const visibleHeight = Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top);
        if (visibleWidth < 8 || visibleHeight < 8) return false;
      }
      parent = parent.parentElement;
    }
    return true;
  });
}

async function tabTo(page, predicate, steps, key = "Tab") {
  for (let index = 0; index < steps; index += 1) {
    if (await predicate()) return true;
    await page.keyboard.press(key);
  }
  return predicate();
}

async function railPanelFitReport(page) {
  return page.evaluate(() => {
    const minimum = 24;
    const circlesIntersect = (a, b, diameter) => {
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      return Math.hypot(ax - bx, ay - by) < diameter;
    };
    const circleHitsBox = (circle, box, diameter) => {
      const cx = circle.left + circle.width / 2;
      const cy = circle.top + circle.height / 2;
      const nearestX = Math.max(box.left, Math.min(cx, box.right));
      const nearestY = Math.max(box.top, Math.min(cy, box.bottom));
      return Math.hypot(cx - nearestX, cy - nearestY) < diameter / 2;
    };
    const roots = [document.querySelector(".ena-tool-rail"), document.querySelector(".ena-control-panel")].filter(Boolean);
    const targets = [];
    const seen = new Set();
    for (const root of roots) {
      const candidates = root.querySelectorAll("a[href], button, input, select, textarea, summary, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='tab'], [role='slider'], [role='combobox']");
      for (const element of candidates) {
        if (!(element instanceof HTMLElement)) continue;
        if (element.closest("[hidden], [aria-hidden='true']")) continue;
        const owner = element.closest("label, button, a");
        const target = owner && owner !== element ? owner : element;
        if (!(target instanceof HTMLElement) || seen.has(target)) continue;
        if (target.closest("[hidden], [aria-hidden='true']")) continue;
        const style = getComputedStyle(target);
        if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") continue;
        const rect = target.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        seen.add(target);
        let clipped = null;
        let parent = target.parentElement;
        while (parent && parent !== document.body) {
          const parentStyle = getComputedStyle(parent);
          const overflowX = parentStyle.overflowX;
          const overflowY = parentStyle.overflowY;
          const scrolls = overflowX === "auto" || overflowX === "scroll" || overflowY === "auto" || overflowY === "scroll";
          if (scrolls) break;
          const box = parent.getBoundingClientRect();
          const hiddenX = overflowX === "hidden" || overflowX === "clip";
          const hiddenY = overflowY === "hidden" || overflowY === "clip";
          if (hiddenX && (rect.left < box.left - 1 || rect.right > box.right + 1)) {
            clipped = "hidden-x";
            break;
          }
          if (hiddenY) {
            const visible = Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top);
            if (visible < Math.min(rect.height, minimum) - 1) {
              clipped = "hidden-y";
              break;
            }
          }
          parent = parent.parentElement;
        }
        const viewportWidth = document.documentElement.clientWidth;
        if (!clipped && (rect.left < -1 || rect.right > viewportWidth + 1)) clipped = "viewport-x";
        targets.push({
          name: (target.getAttribute("aria-label") || target.textContent || target.tagName).replace(/\s+/gu, " ").trim().slice(0, 80),
          className: String(target.className).slice(0, 80),
          tag: target.tagName.toLowerCase(),
          parentClass: String(target.parentElement?.className ?? "").slice(0, 80),
          position: style.position,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          clipped,
        });
      }
    }

    const undersized = [];
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      if (target.width >= minimum - 0.5 && target.height >= minimum - 0.5) continue;
      const problems = [];
      for (let otherIndex = 0; otherIndex < targets.length; otherIndex += 1) {
        if (otherIndex === index) continue;
        const other = targets[otherIndex];
        if (circleHitsBox(target, other, minimum)) problems.push(`circle hits ${other.name}`);
        const otherUndersized = other.width < minimum - 0.5 || other.height < minimum - 0.5;
        if (otherUndersized && circlesIntersect(target, other, minimum)) problems.push(`circle hits circle of ${other.name}`);
      }
      if (problems.length > 0) {
        undersized.push({
          name: target.name,
          className: target.className,
          width: Math.round(target.width),
          height: Math.round(target.height),
          problems: problems.slice(0, 3),
        });
      }
    }

    const overlaps = [];
    for (let index = 0; index < targets.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < targets.length; otherIndex += 1) {
        const a = targets[index];
        const b = targets[otherIndex];
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (width > 4 && height > 4) {
          overlaps.push({
            a: a.name,
            aTag: a.tag,
            aClass: a.className,
            aParent: a.parentClass,
            aPosition: a.position,
            aTop: Math.round(a.top),
            aHeight: Math.round(a.height),
            b: b.name,
            bTag: b.tag,
            bClass: b.className,
            bParent: b.parentClass,
            bPosition: b.position,
            bTop: Math.round(b.top),
            bHeight: Math.round(b.height),
            width: Math.round(width),
            height: Math.round(height),
          });
        }
      }
    }

    return {
      count: targets.length,
      clipped: targets.filter((target) => target.clipped).slice(0, 8).map((target) => ({
        name: target.name,
        className: target.className,
        clipped: target.clipped,
        width: Math.round(target.width),
        height: Math.round(target.height),
      })),
      undersized: undersized.slice(0, 8),
      overlaps: overlaps.slice(0, 8),
    };
  });
}

async function focusedRailName(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.classList.contains("ena-rail-button")) return null;
    return active.getAttribute("aria-label");
  });
}

async function activeRailId(page) {
  return page.locator("[data-ena-rail-panel]").getAttribute("data-ena-rail-panel");
}

async function activeRailButton(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.classList.contains("ena-rail-button")) return null;
    return active.getAttribute("aria-label");
  });
}

async function focusOutsidePanel(page, panel) {
  const outside = await tabTo(page, async () => {
    const inside = await panel.evaluate((element) => element.contains(document.activeElement));
    return !inside;
  }, 40, "Shift+Tab");
  return outside;
}

async function clearFragment(page) {
  await page.evaluate(() => {
    if (!location.hash) return;
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  });
}

async function armSkipActivationProbe(page) {
  await page.evaluate(() => {
    window.__skipActivation = { defaultPrevented: null, hashChanged: false };
    document.addEventListener("click", (event) => {
      const link = event.target instanceof Element ? event.target.closest("a.skip-link") : null;
      if (!link) return;
      window.__skipActivation.defaultPrevented = event.defaultPrevented;
    });
    window.addEventListener("hashchange", () => {
      window.__skipActivation.hashChanged = true;
    });
  });
}

async function readSkipActivation(page) {
  // Fragment navigation to a tabindex="-1" target updates location.hash
  // immediately but dispatches hashchange on a later task. Wait for that
  // task unless the click handler already cancelled the navigation.
  await page.evaluate(() => new Promise((resolve) => {
    const probe = window.__skipActivation;
    if (!probe || probe.hashChanged || probe.defaultPrevented === true) {
      resolve(undefined);
      return;
    }
    const timer = window.setTimeout(resolve, 50);
    window.addEventListener("hashchange", () => {
      window.clearTimeout(timer);
      resolve(undefined);
    }, { once: true });
  }));
  return page.evaluate(() => {
    const active = document.activeElement;
    const probe = window.__skipActivation;
    return {
      hash: location.hash,
      clicked: probe?.defaultPrevented !== null && probe?.defaultPrevented !== undefined,
      defaultPrevented: probe?.defaultPrevented === true,
      hashChanged: probe?.hashChanged === true,
      activeId: active instanceof HTMLElement ? active.id : "",
      activeLabel: active instanceof HTMLElement ? (active.getAttribute("aria-label") ?? "") : "",
    };
  });
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: VIEWPORTS[0], reducedMotion: "reduce" });
  // The Playwright library's default action timeout is infinite. Cap it so a
  // stuck focus or route cannot hang the CI job.
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(30_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource|net::ERR_/u.test(text)) return;
    pageErrors.push(text);
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.abort();
    if (url.pathname === "/ena-mark.svg") {
      return route.fulfill({
        contentType: "image/svg+xml",
        body: await readFile(`${projectRoot}/public/ena-mark.svg`, "utf8"),
      });
    }
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
  });

  async function mount(script) {
    await page.goto("http://localhost:32161/");
    await page.addScriptTag({ content: script });
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mount(bundles.en);
    await page.getByTestId("open-ena-workspace-v3").waitFor();
    const label = `${viewport.width}x${viewport.height}`;

    const tracks = await page.locator(".ena-workbench-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    const columnCount = tracks.trim().split(/\s+/u).filter(Boolean).length;
    check(columnCount === viewport.columns, `${label}: expected ${viewport.columns} workbench columns, got ${columnCount} (${tracks})`);

    const arrangement = await page.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { x: rect.x, y: rect.y } : null;
      };
      return {
        rail: box(".ena-tool-rail"),
        controls: box(".ena-control-panel"),
        visual: box(".ena-visual-workspace"),
      };
    });
    check(Boolean(arrangement.rail && arrangement.controls && arrangement.visual), `${label}: rail, controls, and workspace surfaces are missing`);
    if (arrangement.rail && arrangement.controls && arrangement.visual) {
      if (viewport.sideBySide) {
        check(
          arrangement.rail.x < arrangement.controls.x && arrangement.controls.x < arrangement.visual.x,
          `${label}: desktop order must stay rail, controls, then research surface`,
        );
      } else {
        check(
          arrangement.rail.y < arrangement.controls.y && arrangement.controls.y <= arrangement.visual.y + 1,
          `${label}: narrow layout must stack the rail above the controls and research surface`,
        );
      }
    }

    if (viewport.width < 1440) {
      const overflow = await overflowReport(page);
      check(
        overflow.scrollWidth <= overflow.clientWidth + 1 && overflow.bodyScrollWidth <= overflow.clientWidth + 1,
        `${label}: horizontal overflow scrollWidth=${overflow.scrollWidth} body=${overflow.bodyScrollWidth} client=${overflow.clientWidth} offenders=${JSON.stringify(overflow.offenders)}`,
      );
    }

    const landmarks = await landmarkEntries(page);
    const duplicates = duplicateNames(landmarks);
    check(duplicates.length === 0, `${label}: duplicate landmarks ${duplicates.join(", ")} among ${JSON.stringify(landmarks)}`);
    check(
      landmarks.some((entry) => entry.role === "navigation" && entry.name === "Analysis modes"),
      `${label}: Analysis modes navigation landmark is missing`,
    );
    check(
      landmarks.some((entry) => entry.role === "region" && entry.name === "Open ENA analysis workspace"),
      `${label}: Open ENA analysis workspace landmark is missing`,
    );

    const skipLinks = page.locator("a.skip-link");
    const skipCount = await skipLinks.count();
    check(skipCount === 1, `${label}: expected exactly one .skip-link, found ${skipCount}`);
    const skip = page.getByRole("link", { name: "Skip to workspace", exact: true });
    check(await skip.count() === 1, `${label}: expected one Skip to workspace link, found ${await skip.count()}`);
    if (skipCount === 1 && await skip.count() === 1) {
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await page.keyboard.press("Tab");
      const firstTabIsSkip = await page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLAnchorElement && active.classList.contains("skip-link");
      });
      check(firstTabIsSkip, `${label}: the skip link is not the first Tab stop`);
      try {
        await page.waitForFunction(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || !active.classList.contains("skip-link")) return false;
          const rect = active.getBoundingClientRect();
          return rect.top >= 0 && rect.height >= 24 && rect.width >= 40 && rect.left >= 0;
        }, { timeout: 1000 });
      } catch {
        check(false, `${label}: skip link did not become visible when focused`);
      }
      const skipBox = await skip.boundingBox();
      check(
        Boolean(skipBox && skipBox.y >= 0 && skipBox.height >= 24 && skipBox.width >= 40 && skipBox.x >= 0 && skipBox.x < viewport.width),
        `${label}: skip link is not visible when focused (${JSON.stringify(skipBox)})`,
      );
      await clearFragment(page);
      const hashBeforeSkip = await page.evaluate(() => location.hash);
      await armSkipActivationProbe(page);
      await page.keyboard.press("Enter");
      const skipActivation = await readSkipActivation(page);
      check(
        skipActivation.clicked && skipActivation.defaultPrevented && !skipActivation.hashChanged && skipActivation.hash === hashBeforeSkip,
        `${label}: Skip to workspace followed fragment navigation instead of the click handler (clicked=${skipActivation.clicked}, defaultPrevented=${skipActivation.defaultPrevented}, hash ${hashBeforeSkip} -> ${skipActivation.hash}, hashChanged=${skipActivation.hashChanged})`,
      );
      check(
        skipActivation.activeId === "open-ena-workspace" && skipActivation.activeLabel === "Open ENA analysis workspace",
        `${label}: Skip to workspace did not move focus to the workspace landmark`,
      );
    }

    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const toolbar = page.getByRole("toolbar", { name: "Analysis mode toolbar" });
    const toolbarCount = await toolbar.count();
    check(toolbarCount === 1, `${label}: expected one Analysis mode toolbar, found ${toolbarCount}`);
    if (toolbarCount === 1) {
      const expectedOrientation = viewport.width <= 900 ? "horizontal" : "vertical";
      let orientation = await toolbar.getAttribute("aria-orientation");
      if (orientation !== expectedOrientation) {
        try {
          await page.waitForFunction((expected) => document.querySelector(".ena-rail-modes")?.getAttribute("aria-orientation") === expected, expectedOrientation, { timeout: 1000 });
          orientation = expectedOrientation;
        } catch {
          orientation = await toolbar.getAttribute("aria-orientation");
        }
      }
      check(
        orientation === expectedOrientation,
        `${label}: toolbar aria-orientation was ${JSON.stringify(orientation)}, expected ${expectedOrientation}`,
      );
    }
    const railTabIndexes = await page.locator(".ena-rail-button").evaluateAll((elements) => elements.map((element) => element.tabIndex));
    check(
      railTabIndexes.filter((value) => value >= 0).length === 1,
      `${label}: expected exactly one rail button in the Tab order, tabIndexes=${JSON.stringify(railTabIndexes)}`,
    );

    await page.getByRole("button", { name: "Data", exact: true }).focus();
    const panelAtArrowStart = await activeRailId(page);
    const arrowSteps = [
      ["ArrowDown", "Model"],
      ["ArrowRight", "Plot Tools"],
      ["End", "AI-assisted interpretation"],
      ["ArrowDown", "Data"],
      ["ArrowUp", "AI-assisted interpretation"],
      ["Home", "Data"],
      ["End", "AI-assisted interpretation"],
      ["ArrowLeft", "Stats & Export"],
      ["ArrowUp", "Plot Tools"],
    ];
    let arrowsWork = true;
    for (const [key, expectedName] of arrowSteps) {
      await page.keyboard.press(key);
      const focused = await focusedRailName(page);
      if (focused !== expectedName) {
        check(false, `${label}: ${key} focused ${JSON.stringify(focused)}, expected ${expectedName}`);
        arrowsWork = false;
        break;
      }
    }
    const panelAfterArrows = await activeRailId(page);
    check(
      panelAfterArrows === panelAtArrowStart,
      `${label}: arrow focus changed the active rail from ${panelAtArrowStart} to ${panelAfterArrows}`,
    );
    const currentAfterArrows = await page.locator(".ena-rail-button[aria-current='step']").evaluate((element) => element.getAttribute("aria-label"));
    check(currentAfterArrows === "Data", `${label}: arrow focus changed aria-current to ${JSON.stringify(currentAfterArrows)}`);
    if (arrowsWork) {
      // Arrow roving leaves the tab stop on Plot Tools while Data stays the active mode.
      // Clicking the already-active mode must move the tab stop onto that button.
      await page.getByRole("button", { name: "Data", exact: true }).click();
      const tabStopsAfterActiveClick = await page.locator(".ena-rail-button").evaluateAll((elements) => elements.map((element) => ({
        name: element.getAttribute("aria-label"),
        tabIndex: element.tabIndex,
        current: element.getAttribute("aria-current"),
      })));
      const clickedStop = tabStopsAfterActiveClick.find((entry) => entry.name === "Data");
      const otherStops = tabStopsAfterActiveClick.filter((entry) => entry.name !== "Data");
      check(
        clickedStop?.tabIndex === 0 && otherStops.every((entry) => entry.tabIndex === -1) && clickedStop.current === "step",
        `${label}: clicking the already-active Data rail after arrow roving left tab stops ${JSON.stringify(tabStopsAfterActiveClick)}`,
      );
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Tab");
      const tabLanding = await focusedRailName(page);
      check(tabLanding === null, `${label}: Tab from the roving rail button landed on another rail button (${tabLanding})`);
      await page.keyboard.press("Shift+Tab");
      const returned = await focusedRailName(page);
      check(returned === "Plot Tools", `${label}: Shift+Tab returned to ${JSON.stringify(returned)}, expected the roving Plot Tools button`);
      await page.keyboard.press("Enter");
      check((await activeRailId(page)) === "plot", `${label}: Enter did not activate the focused Plot Tools rail`);
      await page.keyboard.press("ArrowDown");
      check((await focusedRailName(page)) === "Stats & Export", `${label}: ArrowDown after Enter did not move to Stats & Export`);
      check((await activeRailId(page)) === "plot", `${label}: ArrowDown after Enter changed the active rail`);
      await page.keyboard.press("Space");
      check((await activeRailId(page)) === "stats", `${label}: Space did not activate the focused Stats & Export rail`);
    }
    await page.getByRole("button", { name: "Model", exact: true }).focus();
    await page.keyboard.press("Space");
    check((await activeRailId(page)) === "model", `${label}: Space on Model did not activate that rail`);
    await page.getByRole("button", { name: "Data", exact: true }).focus();
    await page.keyboard.press("Enter");
    check((await activeRailId(page)) === "data", `${label}: Enter on Data did not activate that rail`);
    check(
      JSON.stringify(RAIL_FOCUS_ORDER) === JSON.stringify(RAILS.map((rail) => rail.button)),
      "rail focus order drifted from the rail fixtures",
    );

    for (const rail of RAILS) {
      const trigger = page.getByRole("button", { name: rail.button, exact: true });
      await trigger.focus();
      check(await reachesViewport(page, trigger), `${label}: rail button ${rail.button} is clipped or unreachable`);
      await page.keyboard.press("Enter");
      const namedPanel = page.locator(`[data-ena-rail-panel="${rail.id}"]`);
      const namedCount = await namedPanel.count();
      check(namedCount === 1, `${label}: ${rail.button} has no single rail panel`);
      const panel = namedCount === 1 ? namedPanel : page.locator(".ena-control-panel");
      if (namedCount === 1) {
        const regionName = await panel.evaluate((element) => element.getAttribute("aria-label") ?? "");
        const regionRole = await panel.evaluate((element) => element.getAttribute("role") ?? "");
        check(regionName === rail.region, `${label}: ${rail.button} landmark name was ${JSON.stringify(regionName)}, expected ${rail.region}`);
        check(regionRole === "region", `${label}: ${rail.button} panel role was ${regionRole}`);
        const activeLandmarks = await landmarkEntries(page);
        const activeDuplicates = duplicateNames(activeLandmarks);
        check(activeDuplicates.length === 0, `${label}: duplicate landmarks while ${rail.button} is active: ${activeDuplicates.join(", ")}`);
      }

      const control = rail.control(panel);
      await trigger.focus();
      const reached = await tabTo(page, async () => control.evaluate((element) => document.activeElement === element).catch(() => false), 30);
      check(reached, `${label}: Tab from ${rail.button} did not reach its primary control`);
      if (!reached) continue;
      check(await reachesViewport(page, control), `${label}: primary control in ${rail.button} is clipped or unreachable`);
      if (viewport.width <= 768) {
        const fit = await railPanelFitReport(page);
        check(fit.clipped.length === 0, `${label}: ${rail.button} clipped rail/panel controls ${JSON.stringify(fit.clipped)}`);
        check(fit.undersized.length === 0, `${label}: ${rail.button} undersized rail/panel targets ${JSON.stringify(fit.undersized)}`);
        check(fit.overlaps.length === 0, `${label}: ${rail.button} overlapping rail/panel controls ${JSON.stringify(fit.overlaps)}`);
      }
      const leftPanel = await focusOutsidePanel(page, panel);
      check(leftPanel, `${label}: Shift+Tab did not leave the ${rail.button} panel (focus trap)`);
      await control.focus();
      await page.keyboard.press("Escape");
      let returned = false;
      try {
        await page.waitForFunction((buttonName) => {
          const active = document.activeElement;
          return active instanceof HTMLElement
            && active.classList.contains("ena-rail-button")
            && active.getAttribute("aria-label") === buttonName;
        }, rail.button, { timeout: 500 });
        returned = true;
      } catch {
        returned = false;
      }
      check(returned, `${label}: Escape from ${rail.button} did not return focus to its trigger`);
    }
  }

  for (const { locale, label: skipLabel, toolbar: toolbarLabel } of WORKSPACE_LOCALES) {
    if (locale === "en") continue;
    await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
    await mount(bundles[locale]);
    await page.getByRole("link", { name: skipLabel, exact: true }).waitFor();
    const localizedToolbar = page.getByRole("toolbar", { name: toolbarLabel });
    check(
      await localizedToolbar.count() === 1,
      `${locale}: expected one ${toolbarLabel} toolbar, found ${await localizedToolbar.count()}`,
    );
    const localeLabel = locale;
    const skipCount = await page.locator("a.skip-link").count();
    check(skipCount === 1, `${localeLabel}: expected exactly one .skip-link, found ${skipCount}`);
    const localizedSkip = page.getByRole("link", { name: skipLabel, exact: true });
    check(await localizedSkip.count() === 1, `${localeLabel}: expected one ${skipLabel} link, found ${await localizedSkip.count()}`);
    if (skipCount === 1 && await localizedSkip.count() === 1) {
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await page.keyboard.press("Tab");
      const firstTabIsSkip = await page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLAnchorElement && active.classList.contains("skip-link");
      });
      check(firstTabIsSkip, `${localeLabel}: the skip link is not the first Tab stop`);
      await clearFragment(page);
      const hashBeforeSkip = await page.evaluate(() => location.hash);
      await armSkipActivationProbe(page);
      await page.keyboard.press("Enter");
      const skipActivation = await readSkipActivation(page);
      check(
        skipActivation.clicked && skipActivation.defaultPrevented && !skipActivation.hashChanged && skipActivation.hash === hashBeforeSkip,
        `${localeLabel}: skip activation followed fragment navigation instead of the click handler (clicked=${skipActivation.clicked}, defaultPrevented=${skipActivation.defaultPrevented}, hash ${hashBeforeSkip} -> ${skipActivation.hash}, hashChanged=${skipActivation.hashChanged})`,
      );
      check(skipActivation.activeId === "open-ena-workspace", `${localeLabel}: activating the skip link did not move focus onto the workspace landmark`);
    }
  }

  await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
  await mount(bundles.home);
  await page.locator("#main-content").waitFor();
  const homeSkipCount = await page.locator("a.skip-link").count();
  check(homeSkipCount === 1, `home: expected exactly one .skip-link, found ${homeSkipCount}`);
  const homeSkip = page.getByRole("link", { name: "Skip to content", exact: true });
  check(await homeSkip.count() === 1, `home: expected the global Skip to content link, found ${await homeSkip.count()}`);
  if (homeSkipCount === 1 && await homeSkip.count() === 1) {
    const homeHref = await homeSkip.getAttribute("href");
    check(homeHref === "#main-content", `home: skip link href was ${homeHref}`);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.keyboard.press("Tab");
    const homeFirstTab = await page.evaluate(() => {
      const active = document.activeElement;
      const target = document.getElementById("main-content");
      return active instanceof HTMLAnchorElement
        && active.classList.contains("skip-link")
        && active.getAttribute("href") === "#main-content"
        && active.textContent?.trim() === "Skip to content"
        && target instanceof HTMLElement;
    });
    check(homeFirstTab, "home: the global skip link is not the first Tab stop or #main-content is missing");
    if (homeFirstTab) {
      await clearFragment(page);
      await armSkipActivationProbe(page);
      await page.keyboard.press("Enter");
      const homeActivation = await readSkipActivation(page);
      check(
        homeActivation.clicked && !homeActivation.defaultPrevented && homeActivation.hashChanged && homeActivation.hash === "#main-content",
        `home: #main-content must keep default fragment navigation (clicked=${homeActivation.clicked}, defaultPrevented=${homeActivation.defaultPrevented}, hash=${homeActivation.hash}, hashChanged=${homeActivation.hashChanged})`,
      );
    }
  }

  await mount(bundles.login);
  await page.locator(".open-ena-login-form").waitFor();
  const loginSkipCount = await page.locator("a.skip-link").count();
  check(loginSkipCount === 1, `login: expected exactly one .skip-link, found ${loginSkipCount}`);
  const loginHref = loginSkipCount === 1 ? await page.locator("a.skip-link").getAttribute("href") : null;
  check(loginHref === "#main-content", `login: skip link href was ${loginHref}`);
  const loginTarget = await page.evaluate(() => document.getElementById("main-content") instanceof HTMLElement && document.getElementById("open-ena-workspace") === null);
  check(loginTarget, "login: #main-content must exist and the workspace landmark must be absent");
  if (loginSkipCount === 1 && loginTarget) {
    await clearFragment(page);
    await page.locator("a.skip-link").focus();
    await armSkipActivationProbe(page);
    await page.keyboard.press("Enter");
    const loginActivation = await readSkipActivation(page);
    check(
      loginActivation.clicked && !loginActivation.defaultPrevented && loginActivation.hashChanged && loginActivation.hash === "#main-content",
      `login: #main-content must keep default fragment navigation (clicked=${loginActivation.clicked}, defaultPrevented=${loginActivation.defaultPrevented}, hash=${loginActivation.hash}, hashChanged=${loginActivation.hashChanged})`,
    );
  }

  check(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
  if (failures.length > 0) {
    throw new Error(failures.map((failure) => `- ${failure}`).join("\n"));
  }
  console.log("open ena workspace landmarks, skip link, keyboard order, and narrow viewport PASS");
} finally {
  await browser.close();
}
