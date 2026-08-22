export interface HorizontalScrollableRegion {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
}

/** Returns true only when the key produces horizontal movement. */
export function moveHorizontalScrollableRegion(
  region: HorizontalScrollableRegion,
  key: string,
): boolean {
  const maximum = Math.max(0, region.scrollWidth - region.clientWidth);
  const current = Math.min(maximum, Math.max(0, region.scrollLeft));
  const lineStep = Math.max(40, Math.floor(region.clientWidth * 0.12));
  const pageStep = Math.max(80, Math.floor(region.clientWidth * 0.85));
  let next: number;

  switch (key) {
    case "ArrowLeft":
      next = current - lineStep;
      break;
    case "ArrowRight":
      next = current + lineStep;
      break;
    case "PageUp":
      next = current - pageStep;
      break;
    case "PageDown":
      next = current + pageStep;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = maximum;
      break;
    default:
      return false;
  }

  const clamped = Math.min(maximum, Math.max(0, next));
  if (clamped === current) return false;
  region.scrollLeft = clamped;
  return true;
}
