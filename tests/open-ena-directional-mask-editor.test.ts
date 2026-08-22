import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OpenEnaDirectionalMaskEditor,
  applyDirectionalMaskPreset,
} from "../components/open-ena/OpenEnaDirectionalMaskEditor";
import { createDirectionalMask } from "../lib/open-ena/network-config";

test("directional mask presets address the full p-squared matrix including diagonal cells", () => {
  const mask = createDirectionalMask(["A", "B"]);

  assert.deepEqual(applyDirectionalMaskPreset(mask, "none").enabled, [
    [false, false],
    [false, false],
  ]);
  assert.deepEqual(applyDirectionalMaskPreset(mask, "diagonal").enabled, [
    [true, false],
    [false, true],
  ]);
  assert.deepEqual(applyDirectionalMaskPreset(mask, "off-diagonal").enabled, [
    [false, true],
    [true, false],
  ]);
  assert.deepEqual(applyDirectionalMaskPreset(mask, "all").enabled, [
    [true, true],
    [true, true],
  ]);
  assert.throws(
    () => applyDirectionalMaskPreset(mask, "unexpected" as never),
    /unsupported directional-mask preset/i,
  );
  assert.deepEqual(mask.enabled, [[true, true], [true, true]], "presets must not mutate the controlled value");
});

test("mask editor is a scoped nonmodal dialog with source rows, response columns, and localized controls", () => {
  const mask = createDirectionalMask(["A", "B"]);
  const markup = renderToStaticMarkup(createElement(OpenEnaDirectionalMaskEditor, {
    id: "test-mask",
    open: true,
    onOpenChange: () => undefined,
    value: mask,
    onChange: () => undefined,
    copy: {
      triggerLabel: "Edit directional mask",
      dialogTitle: "Directional mask",
      dialogDescription: "Rows are ground sources and columns are responses.",
      closeLabel: "Close mask",
      matrixCaption: "Ground source by response target",
      groundHeader: "Ground / source",
      responseHeader: "Response / target",
      allLabel: "All",
      noneLabel: "None",
      diagonalLabel: "Diagonal",
      offDiagonalLabel: "Off-diagonal",
      invalidMaskMessage: "Mask is invalid.",
      cellLabel: (ground, response, diagonal) => `${ground} to ${response}${diagonal ? " self" : ""}`,
      cellAnnouncement: (ground, response, enabled) => `${ground} to ${response} ${enabled ? "enabled" : "disabled"}`,
      bulkAnnouncement: (preset, enabled, total) => `${preset}: ${enabled} of ${total}`,
    },
  }));

  assert.match(markup, /role="dialog"/u);
  assert.match(markup, /aria-modal="false"/u);
  assert.match(markup, /Ground \/ source/u);
  assert.match(markup, /Response \/ target/u);
  assert.match(markup, /A to A self/u);
  assert.match(markup, /B to B self/u);
  assert.equal((markup.match(/type="checkbox"/gu) ?? []).length, 4);
  assert.match(markup, /aria-live="polite"/u);
  assert.match(markup, /Off-diagonal/u);
});

test("mask editor closes on Escape and restores focus to its own trigger", () => {
  const source = readFileSync(
    new URL("../components/open-ena/OpenEnaDirectionalMaskEditor.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /onOpenChange\(false\)/u);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/u);
});
