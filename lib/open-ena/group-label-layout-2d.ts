import type { IdentityFieldV3 } from "./model-v3/identity";

/** Presentation names only. Never parse or rewrite scientific identity labels. */
export function groupDisplayNames2D(groups: readonly { displayLabel: string; fields: readonly IdentityFieldV3[] }[]) {
  const names = groups.map(group => group.fields.length === 1 ? String(group.fields[0].value.value).trim() || group.displayLabel : group.displayLabel);
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const typed = names.map((name, i) => counts.get(name)! > 1 ? `${name} (${groups[i].fields[0].value.type})` : name);
  const typedCounts = new Map<string, number>();
  for (const name of typed) typedCounts.set(name, (typedCounts.get(name) ?? 0) + 1);
  const reserved = new Set(groups.map(group => group.displayLabel));
  return Object.fromEntries(groups.map((group, i) => [group.displayLabel,
    typedCounts.get(typed[i])! > 1 || (reserved.has(typed[i]) && typed[i] !== group.displayLabel) ? group.displayLabel : typed[i]]));
}
export const groupFigureName2D = (name: string, labels?: Readonly<Record<string, string>>) => labels && Object.hasOwn(labels, name) ? labels[name] : name;

export interface LabelBox2D { x: number; y: number; width: number; height: number }
export interface GroupLabelRequest2D {
  id: string;
  anchor: { x: number; y: number };
  width: number;
  height: number;
  extent: LabelBox2D;
}
const overlapArea = (a: LabelBox2D, b: LabelBox2D) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
export const paddedLabelBox2D = (box: LabelBox2D, gap: number): LabelBox2D => ({ x: box.x - gap, y: box.y - gap, width: box.width + 2 * gap, height: box.height + 2 * gap });

/** Move text boxes in SVG display coordinates only; anchors and geometry are immutable. */
export function placeGroupLabels2D(groups: readonly GroupLabelRequest2D[], obstacles: readonly LabelBox2D[], bounds: LabelBox2D) {
  const occupied = [...obstacles], output: Array<LabelBox2D & { id: string }> = [];
  for (const group of groups) {
    const { anchor, extent, width, height } = group;
    const centerX = groups.reduce((sum, item) => sum + item.anchor.x, 0) / groups.length;
    const preferred = anchor.x < centerX || (anchor.x === centerX && output.length < groups.length / 2) ? -1 : 1;
    const candidates: LabelBox2D[] = [];
    for (let ring = 0; ring < 10; ring++) {
      const gap = 10 + ring * 12;
      const left = extent.x - width - gap, right = extent.x + extent.width + gap;
      const top = extent.y - height - gap, bottom = extent.y + extent.height + gap;
      const centerX = anchor.x - width / 2, centerY = anchor.y - height / 2;
      for (const [x, y] of [[left, centerY], [right, centerY], [centerX, top], [centerX, bottom], [left, top], [right, top], [left, bottom], [right, bottom]]) candidates.push({ x, y, width, height });
    }
    const clamp = (box: LabelBox2D) => ({ ...box,
      x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, box.x)),
      y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, box.y)),
    });
    const overlaps = (box: LabelBox2D) => occupied.reduce((sum, other) => sum + overlapArea(paddedLabelBox2D(box, 4), other), 0);
    const score = (box: LabelBox2D) => {
      const dx = box.x + width / 2 - anchor.x, dy = box.y + height / 2 - anchor.y;
      // Any collision-free candidate wins over a colliding one. Among clear
      // candidates, prefer the outward side, then the shortest displacement.
      const overlap = overlaps(box);
      return [overlap > 0 ? 1 : 0, overlap, dx * preferred < 0 ? 1 : 0, dx * dx + dy * dy];
    };
    const compare = (a: LabelBox2D, b: LabelBox2D) => {
      const left = score(a), right = score(b);
      for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
      return 0;
    };
    let best = candidates.map(clamp).sort(compare)[0];
    // Dense plots can require a free location farther from the mean. The search
    // is deterministic and bounded by the SVG viewport, never by sample values.
    if (overlaps(best) > 0) {
      for (let y = bounds.y; y <= bounds.y + bounds.height - height; y += 16) for (let x = bounds.x; x <= bounds.x + bounds.width - width; x += 16) {
        const candidate = { x, y, width, height };
        if (compare(candidate, best) < 0) best = candidate;
      }
    }
    output.push({ id: group.id, ...best });
    occupied.push(paddedLabelBox2D(best, 4));
  }
  return output;
}
