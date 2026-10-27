/** Display-only, deterministic layout. Coordinates are in the caller's screen units. */
export interface PlotLabelRect { x: number; y: number; width: number; height: number }
export interface PlotLabelCandidate {
  id: string;
  anchor: { x: number; y: number };
  width: number;
  height: number;
  priority: number;
  preferredOffset?: { x: number; y: number };
}
export interface PlotLabelPlacement extends PlotLabelRect {
  id: string;
  dx: number;
  dy: number;
  visible: boolean;
}

const GAP = 4;
const CELL = 64;
const finiteRect = (r: PlotLabelRect) => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;
const intersects = (a: PlotLabelRect, b: PlotLabelRect) => a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y;

/** A spatial index keeps dense Unit-label layouts from scanning every other mark. */
class OccupiedRects {
  private cells = new Map<string, PlotLabelRect[]>();
  private keys(r: PlotLabelRect): string[] {
    const keys: string[] = [];
    for (let x = Math.floor((r.x - GAP) / CELL); x <= Math.floor((r.x + r.width + GAP) / CELL); x++) {
      for (let y = Math.floor((r.y - GAP) / CELL); y <= Math.floor((r.y + r.height + GAP) / CELL); y++) keys.push(`${x}:${y}`);
    }
    return keys;
  }
  add(r: PlotLabelRect) {
    for (const key of this.keys(r)) {
      const entries = this.cells.get(key) ?? [];
      entries.push(r); this.cells.set(key, entries);
    }
  }
  intersects(r: PlotLabelRect) {
    return this.keys(r).some(key => this.cells.get(key)?.some(other => intersects(r, other)));
  }
}

export function placePlotLabels({ labels, bounds, obstacles = [], previous }: {
  labels: readonly PlotLabelCandidate[];
  bounds: PlotLabelRect;
  obstacles?: readonly PlotLabelRect[];
  previous?: ReadonlyMap<string, PlotLabelPlacement>;
}): Map<string, PlotLabelPlacement> {
  const result = new Map<string, PlotLabelPlacement>();
  const occupied = new OccupiedRects();
  // Clip obstacles to the viewport before indexing arbitrarily large/offscreen marks.
  if (finiteRect(bounds)) for (const obstacle of obstacles) {
    if (!finiteRect(obstacle)) continue;
    const x = Math.max(bounds.x, obstacle.x), y = Math.max(bounds.y, obstacle.y);
    const width = Math.min(bounds.x + bounds.width, obstacle.x + obstacle.width) - x;
    const height = Math.min(bounds.y + bounds.height, obstacle.y + obstacle.height) - y;
    if (width > 0 && height > 0) occupied.add({ x, y, width, height });
  }
  const ordered = [...labels].sort((a, b) => (b.priority - a.priority) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const label of ordered) {
    const hidden: PlotLabelPlacement = { id: label.id, x: 0, y: 0, width: Number.isFinite(label.width) ? Math.max(0, label.width) : 0, height: Number.isFinite(label.height) ? Math.max(0, label.height) : 0, dx: 0, dy: 0, visible: false };
    result.set(label.id, hidden);
    if (!finiteRect(bounds) || !finiteRect({ ...label.anchor, width: label.width, height: label.height })
      || label.width > bounds.width || label.height > bounds.height
      || label.anchor.x < bounds.x || label.anchor.x > bounds.x + bounds.width || label.anchor.y < bounds.y || label.anchor.y > bounds.y + bounds.height) continue;
    const candidates: Array<{ x: number; y: number }> = [];
    const retained = previous?.get(label.id);
    if (retained?.visible && retained.width === label.width && retained.height === label.height) candidates.push({ x: retained.dx, y: retained.dy });
    if (label.preferredOffset) candidates.push(label.preferredOffset);
    // Bounded local search, nearest ring first. Never randomize or change scientific anchors.
    const halfWidth = label.width / 2, halfHeight = label.height / 2;
    const radiusLimit = Math.min(240, Math.max(bounds.width, bounds.height) / 2);
    for (let distance = 0; distance <= radiusLimit; distance += 16) {
      const x = halfWidth + GAP + distance, y = halfHeight + GAP + distance;
      candidates.push({ x, y: -y }, { x: -x, y: -y }, { x, y }, { x: -x, y }, { x: 0, y: -y }, { x, y: 0 }, { x: 0, y }, { x: -x, y: 0 });
    }
    for (const offset of candidates) {
      if (![offset.x, offset.y].every(Number.isFinite)) continue;
      const rect = {
        x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - label.width, label.anchor.x + offset.x - halfWidth)),
        y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - label.height, label.anchor.y + offset.y - halfHeight)),
        width: label.width, height: label.height,
      };
      if (occupied.intersects(rect)) continue;
      const placement = { ...rect, id: label.id, dx: rect.x + halfWidth - label.anchor.x, dy: rect.y + halfHeight - label.anchor.y, visible: true };
      result.set(label.id, placement); occupied.add(rect); break;
    }
  }
  return result;
}
