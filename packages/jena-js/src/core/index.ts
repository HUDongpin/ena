export * from "./guards.js";
export * from "./matrix.js";
export * from "./table.js";
export * from "./linear.js";
export { identity } from "./matrix-extra.js";
export {
  DENSE_SVD_FLOAT64_BYTES,
  DENSE_SVD_MAX_MATRIX_BYTES,
  DENSE_SVD_MAX_WORK_UNITS,
  estimateDenseSvdBudget,
} from "./denseSvdBudget.js";
export type { DenseSvdBudgetEstimate } from "./denseSvdBudget.js";
export { windowBoundsForRow } from "../performance.js";
