import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const projectRoot = process.cwd();
const require = createRequire(`${projectRoot}/package.json`);
const { build } = require("esbuild");
const { chromium } = require("playwright");

const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import OpenEnaWorkspace from "./components/open-ena/OpenEnaWorkspace";
const worker = () => new Promise(() => {});
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OpenEnaWorkspace locale="en" worker={worker} />
  </React.StrictMode>
);
`;

const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: projectRoot, sourcefile: "open-ena-a11y-landmarks.tsx" },
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
});
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
];

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

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: VIEWPORTS[0], reducedMotion: "reduce" });
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

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("http://localhost:32161/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
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

    const skip = page.getByRole("link", { name: "Skip to workspace", exact: true });
    check(await skip.count() === 1, `${label}: expected one Skip to workspace link, found ${await skip.count()}`);
    if (await skip.count() === 1) {
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await skip.focus();
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
      await page.keyboard.press("Enter");
      const skipFocusedWorkspace = await page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement
          && active.id === "open-ena-workspace"
          && active.getAttribute("aria-label") === "Open ENA analysis workspace";
      });
      check(skipFocusedWorkspace, `${label}: Skip to workspace did not move focus to the workspace landmark`);
    }

    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const tabbedRails = [];
    const sawRails = await tabTo(page, async () => {
      const name = await activeRailButton(page);
      if (name && tabbedRails.at(-1) !== name) tabbedRails.push(name);
      return tabbedRails.length === RAILS.length;
    }, 20);
    check(sawRails, `${label}: Tab did not reach every rail button (saw ${tabbedRails.join(" → ")})`);
    check(
      JSON.stringify(tabbedRails) === JSON.stringify(RAILS.map((rail) => rail.button)),
      `${label}: rail Tab order was ${tabbedRails.join(" → ")}`,
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

  check(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
  if (failures.length > 0) {
    throw new Error(failures.map((failure) => `- ${failure}`).join("\n"));
  }
  console.log("open ena workspace landmarks, skip link, keyboard order, and narrow viewport PASS");
} finally {
  await browser.close();
}
