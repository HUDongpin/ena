/**
 * jENA 0.6.2's published default plotting palette. Keeping this in the host
 * application avoids letting individual renderers drift away from the runtime
 * whose analytical and visual conventions Open ENA follows.
 */
export const JENA_GROUP_COLORS = [
  "#3366cc",
  "#dc3912",
  "#ff9900",
  "#109618",
  "#990099",
  "#0099c6",
  "#dd4477",
  "#66aa00",
] as const;

export const JENA_PRIMARY_COLOR = JENA_GROUP_COLORS[0];
export const JENA_SECONDARY_COLOR = JENA_GROUP_COLORS[1];
