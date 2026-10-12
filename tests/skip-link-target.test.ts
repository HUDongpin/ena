import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getDictionary } from "../lib/i18n";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

const projectRoot = process.cwd();

test("the locale shell owns one skip link and the workspace does not render a second one", () => {
  const layout = readFileSync(join(projectRoot, "app/[locale]/layout.tsx"), "utf8");
  const workspace = readFileSync(join(projectRoot, "components/open-ena/OpenEnaWorkspace.tsx"), "utf8");
  const skipLink = readFileSync(join(projectRoot, "components/SkipLink.tsx"), "utf8");
  assert.match(layout, /<SkipLink/u);
  assert.match(layout, /skipToContent=\{dictionary\.common\.skipToContent\}/u);
  assert.match(layout, /skipToWorkspace=\{workspaceCopy\.modelV3\.workspace\.landmarks\.skipToWorkspace\}/u);
  assert.doesNotMatch(layout, /cookies\(|headers\(/u);
  assert.doesNotMatch(workspace, /className="skip-link"/u);
  assert.match(skipLink, /open-ena-workspace/u);
  assert.match(skipLink, /MutationObserver/u);
  assert.match(workspace, /id="open-ena-workspace"/u);
  assert.equal(getDictionary("en").common.skipToContent, "Skip to content");
  assert.equal(getOpenEnaCopy("en").modelV3.workspace.landmarks.skipToWorkspace, "Skip to workspace");
  assert.equal(getOpenEnaCopy("zh-hant").modelV3.workspace.landmarks.skipToWorkspace, "跳至工作區");
  assert.equal(getOpenEnaCopy("zh-hans").modelV3.workspace.landmarks.skipToWorkspace, "跳至工作区");
});

test("skip activation focuses a tabindex=-1 landmark and leaves #main-content to the browser", () => {
  const skipLink = readFileSync(join(projectRoot, "components/SkipLink.tsx"), "utf8");
  const workspace = readFileSync(join(projectRoot, "components/open-ena/OpenEnaWorkspace.tsx"), "utf8");
  assert.match(workspace, /id="open-ena-workspace"[^>]*tabIndex=\{-1\}/u);
  assert.match(skipLink, /hasAttribute\(\s*["']tabindex["']\s*\)/u);
  assert.match(skipLink, /preventDefault\(\)/u);
  assert.match(skipLink, /\.focus\(\)/u);
  assert.doesNotMatch(skipLink, /tabIndex\s*<\s*0\s*\)\s*return/u);
});
