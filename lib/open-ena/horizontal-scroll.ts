export interface HorizontalScrollableRegion {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
}

export function moveHorizontalScrollableRegion(
  region: HorizontalScrollableRegion,
  key: string,
): boolean {
  const maximum = Math.max(0, region.scrollWidth - region.clientWidth);
  const lineStep = Math.max(40, Math.floor(region.clientWidth * 0.12));
  const pageStep = Math.max(80, Math.floor(region.clientWidth * 0.85));
  let next: number;

  switch (key) {
    case "ArrowLeft":
      next = region.scrollLeft - lineStep;
      break;
    case "ArrowRight":
      next = region.scrollLeft + lineStep;
      break;
    case "PageUp":
      next = region.scrollLeft - pageStep;
      break;
    case "PageDown":
      next = region.scrollLeft + pageStep;
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

  region.scrollLeft = Math.min(maximum, Math.max(0, next));
  return true;
}
