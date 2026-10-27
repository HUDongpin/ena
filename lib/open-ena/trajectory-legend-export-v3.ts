import type { Locale } from "../i18n";
import type { GroupNetwork } from "./types";
import type { buildTrajectoryPresentationV3 } from "./trajectory-presentation-v3";
import { trajectoryCopyV3 } from "./trajectory-copy-v3";
import { groupFigureName2D } from "./group-label-layout-2d";

type Trajectory = ReturnType<typeof buildTrajectoryPresentationV3>;
type LegendItem = { x: number; y: number; text: string; color?: string; square?: boolean; symbol?: "centroid" | "unit" | "ci"; bold?: boolean };

function wrapText(text: string, width: number, size: number): string[] {
  const lines: string[] = []; let line = "", advance = 0;
  for (const char of text) {
    const next = /[\u2e80-\uffef]/u.test(char) ? size : size * .61;
    if (advance + next > width && line) {
      const breakAt = line.lastIndexOf(" ");
      if (breakAt > 0) { lines.push(line.slice(0, breakAt).trim()); line = line.slice(breakAt + 1); }
      else { lines.push(line.trim()); line = ""; }
      advance = [...line].reduce((sum, c) => sum + (/[\u2e80-\uffef]/u.test(c) ? size : size * .61), 0);
    }
    line += char; advance += next;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

/** One layout feeds both SVG and raster exports, including the scientific key. */
export function trajectoryLegendExportLayoutV3(trajectory: Trajectory, groups: readonly GroupNetwork[], locale: Locale, width: number) {
  const copy = trajectoryCopyV3(locale), items: LegendItem[] = [];
  const columns = Math.max(1, Math.floor((width - 32) / 210)), cellWidth = (width - 32) / columns;
  let y = 25;
  const block = (title: string, entries: { text: string; color: string; square: boolean }[]) => {
    items.push({ x: 16, y, text: title, bold: true }); y += 23;
    for (let start = 0; start < entries.length; start += columns) {
      let rowHeight = 20;
      entries.slice(start, start + columns).forEach((entry, column) => {
        const lines = wrapText(entry.text, cellWidth - 38, 12);
        rowHeight = Math.max(rowHeight, lines.length * 17 + 4);
        lines.forEach((text, index) => items.push({ x: 16 + column * cellWidth + (index > 0 ? 28 : 0), y: y + index * 17, text,
          ...(index === 0 ? { color: entry.color, square: entry.square } : {}) }));
      });
      y += rowHeight;
    }
    y += 7;
  };
  block(copy.groups, groups.map(group => ({ text: groupFigureName2D(group.name, trajectory.groupLabels), color: group.color, square: true })));
  block(copy.periods, trajectory.horizonStyles.map(period => ({ text: period.label, color: period.color, square: false })));
  for (const [symbol, description] of [["centroid", copy.centroid], ["unit", copy.units], ...(trajectory.showConfidenceIntervals ? [["ci", copy.ci]] : [])] as Array<["centroid" | "unit" | "ci", string]>) {
    const lines = wrapText(description, width - 60, 12);
    lines.forEach((text, index) => items.push({ x: index ? 44 : 16, y: y + index * 17, text, ...(index === 0 ? { symbol } : {}) }));
    y += lines.length * 17 + 4;
  }
  y += 7;
  const descriptions: string[] = [];
  const unavailable = trajectory.centroids.some(centroid => Object.values(centroid.intervals ?? {}).some(interval => interval.status === "not-estimable"));
  if (trajectory.showConfidenceIntervals && (trajectory.uncertaintyStatus === "pending" || trajectory.uncertaintyStatus === "unavailable" || unavailable)) {
    descriptions.push(trajectory.uncertaintyStatus === "pending" ? copy.pending : copy.unavailable);
  }
  for (const description of descriptions) {
    for (const text of wrapText(description, width - 32, 12)) { items.push({ x: 16, y, text }); y += 17; }
  }
  const height = y + 14;
  if (!Number.isFinite(width) || width < 100 || height > 30_000) throw new RangeError("Trajectory legend exceeds image export limits");
  return { items, height, fontSize: 12 };
}

export function appendTrajectoryLegendToSvg(svg: SVGSVGElement, trajectory: Trajectory, groups: readonly GroupNetwork[], locale: Locale) {
  const viewBox = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/u).map(Number);
  const width = viewBox.length === 4 ? viewBox[2] : Number(svg.getAttribute("width"));
  const height = viewBox.length === 4 ? viewBox[3] : Number(svg.getAttribute("height"));
  const layout = trajectoryLegendExportLayoutV3(trajectory, groups, locale, width);
  const ns = "http://www.w3.org/2000/svg", doc = svg.ownerDocument;
  const footer = doc.createElementNS(ns, "g"); footer.setAttribute("transform", `translate(0 ${height})`);
  footer.setAttribute("data-ena-trajectory-export-legend", "true");
  const background = doc.createElementNS(ns, "rect");
  for (const [key, value] of Object.entries({ width, height: layout.height, fill: "#fff" })) background.setAttribute(key, String(value));
  footer.append(background);
  for (const item of layout.items) {
    if (item.symbol) {
      const mark = doc.createElementNS(ns, item.symbol === "ci" ? "line" : item.symbol === "centroid" ? "rect" : "circle");
      const attributes = item.symbol === "ci" ? { x1: item.x + 3, x2: item.x + 23, y1: item.y - 4.5, y2: item.y - 4.5 }
        : item.symbol === "centroid" ? { x: item.x + 9, y: item.y - 8.5, width: 8, height: 8 }
          : { cx: item.x + 13, cy: item.y - 4.5, r: 3.5 };
      for (const [key, value] of Object.entries(attributes)) mark.setAttribute(key, String(value));
      mark.setAttribute("fill", "#eef2f3"); mark.setAttribute("stroke", "#526269"); mark.setAttribute("stroke-width", "1.2");
      if (item.symbol === "ci") { mark.setAttribute("stroke-dasharray", "0.1 3"); mark.setAttribute("stroke-linecap", "round"); }
      footer.append(mark);
    } else if (item.color) {
      const mark = doc.createElementNS(ns, item.square ? "rect" : "circle");
      const attributes = item.square ? { x: item.x + 9, y: item.y - 8.5, width: 8, height: 8 } : { cx: item.x + 13, cy: item.y - 4.5, r: 4.5 };
      for (const [key, value] of Object.entries(attributes)) mark.setAttribute(key, String(value));
      if (item.square) {
        const line = doc.createElementNS(ns, "line");
        for (const [key, value] of Object.entries({ x1: item.x + 1, x2: item.x + 25, y1: item.y - 4.5, y2: item.y - 4.5, stroke: "#000", "stroke-width": 1.5 })) line.setAttribute(key, String(value));
        footer.append(line);
      }
      mark.setAttribute("fill", item.square ? "#fff" : item.color); mark.setAttribute("stroke", item.square ? item.color : "#526269"); mark.setAttribute("stroke-width", "1"); footer.append(mark);
    }
    const text = doc.createElementNS(ns, "text"); text.setAttribute("x", String(item.x + (item.color || item.symbol ? 28 : 0))); text.setAttribute("y", String(item.y));
    text.setAttribute("style", `fill:#263740;stroke:none;font: ${item.bold ? "bold " : ""}${layout.fontSize}px Arial,Helvetica,sans-serif`);
    text.textContent = item.text; footer.append(text);
  }
  svg.append(footer);
  svg.setAttribute("viewBox", `0 0 ${width} ${height + layout.height}`);
  svg.setAttribute("width", String(width)); svg.setAttribute("height", String(height + layout.height));
  return { width, height: height + layout.height };
}

export async function appendTrajectoryLegendToPng(dataUrl: string, trajectory: Trajectory, groups: readonly GroupNetwork[], locale: Locale) {
  const source = new Image();
  await new Promise<void>((resolve, reject) => { source.onload = () => resolve(); source.onerror = () => reject(new Error("Unable to compose trajectory image")); source.src = dataUrl; });
  const scale = Math.min(3, Math.max(1, source.width / 900)), width = source.width / scale;
  const layout = trajectoryLegendExportLayoutV3(trajectory, groups, locale, width);
  const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height + Math.ceil(layout.height * scale);
  if (canvas.height > 32767 || canvas.width * canvas.height > 100_000_000) throw new RangeError("Trajectory image exceeds raster export limits");
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas image export is unavailable");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0);
  ctx.translate(0, source.height); ctx.scale(scale, scale);
  for (const item of layout.items) {
    if (item.symbol) {
      ctx.strokeStyle = "#526269"; ctx.lineWidth = 1.2; ctx.fillStyle = "#eef2f3"; ctx.beginPath();
      if (item.symbol === "ci") {
        ctx.save(); ctx.lineCap = "round"; ctx.setLineDash([.1, 3]); ctx.moveTo(item.x + 3, item.y - 4.5); ctx.lineTo(item.x + 23, item.y - 4.5); ctx.stroke(); ctx.restore();
      } else {
        if (item.symbol === "centroid") ctx.rect(item.x + 9, item.y - 8.5, 8, 8); else ctx.arc(item.x + 13, item.y - 4.5, 3.5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    } else if (item.color) {
      if (item.square) {
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(item.x + 1, item.y - 4.5); ctx.lineTo(item.x + 25, item.y - 4.5); ctx.stroke();
      }
      ctx.fillStyle = item.square ? "#fff" : item.color; ctx.beginPath();
      if (item.square) ctx.rect(item.x + 9, item.y - 8.5, 8, 8); else ctx.arc(item.x + 13, item.y - 4.5, 4.5, 0, Math.PI * 2);
      ctx.fill(); ctx.strokeStyle = item.square ? item.color : "#526269"; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.fillStyle = "#263740"; ctx.font = `${item.bold ? "bold " : ""}${layout.fontSize}px Arial,Helvetica,sans-serif`;
    ctx.fillText(item.text, item.x + (item.color || item.symbol ? 28 : 0), item.y);
  }
  return canvas.toDataURL("image/png");
}
