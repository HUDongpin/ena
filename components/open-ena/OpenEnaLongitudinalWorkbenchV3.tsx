"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import {
  compileTrajectoryPlotlySpec,
  createExportBundle,
  type LongitudinalAnalysisBundleV2,
  type TrajectoryDisplaySpecV2,
  type TrajectoryPlotlySpecV2,
} from "j-3dena";

import type { Locale } from "@/lib/i18n";
import { csvDownloadBlob, isCsvDownloadMediaType } from "@/lib/open-ena/csv-download";
import {
  buildOpenEnaLongitudinalExecutionRequestV3,
  advanceOpenEnaLongitudinalScientificRevisionV3,
  bindOpenEnaLongitudinalScientificRunV3,
  changeOpenEnaLongitudinalTimeColumnV3,
  clearOpenEnaLongitudinalIdentityConfirmationV3,
  cloneOpenEnaLongitudinalSettingsV3,
  confirmOpenEnaLongitudinalIdentityV3,
  createExpectedOpenEnaLongitudinalPeriodV3,
  createOpenEnaLongitudinalSettingsV3,
  isOpenEnaLongitudinalBundleStaleV3,
  isOpenEnaLongitudinalScientificRunCurrentV3,
  openEnaLongitudinalHeaderDimensionsV3,
  openEnaLongitudinalDisplayInventoryV3,
  openEnaTrajectoryDisplaySpecV3,
  profileOpenEnaLongitudinalMappingV3,
  snapshotOpenEnaLongitudinalSettingsV3,
  snapshotOpenEnaPreparedLongitudinalExecutionV3,
  withoutOpenEnaLongitudinalInferencePreparedV3,
  withoutOpenEnaLongitudinalInferenceSettingsV3,
  type OpenEnaLongitudinalBindingV3,
  type OpenEnaLongitudinalMappingProfileV3,
  type OpenEnaLongitudinalScientificRunIdentityV3,
  type OpenEnaLongitudinalSettingsV3,
} from "@/lib/open-ena/longitudinal-v3";
import {
  estimateOpenEnaLongitudinalExecutionV3,
  executeOpenEnaLongitudinalPreparedV3,
  OpenEnaLongitudinalExecutionClientErrorV3,
  type OpenEnaLongitudinalProgressV3,
  type OpenEnaLongitudinalRouteDecisionV3,
} from "@/lib/open-ena/longitudinal-v3-client";
import {
  applyCompactTrajectoryPlotlyLayoutV3,
  applyFullscreenTrajectoryPlotlyLayoutV3,
  cloneTrajectoryPlotlyInputV3,
  createTrajectoryPlotlyControllerV3,
  isolateOpenEnaFallbackFullscreenOutsideTreeV3,
  nextOpenEnaFallbackFullscreenFocusV3,
  type TrajectoryPlotlyControllerV3,
  type TrajectoryPlotlyRangesV3,
} from "@/lib/open-ena/longitudinal-v3-display";
import {
  cameraForPreset,
  type OpenEna3dAspectRatio,
  type OpenEna3dCamera,
} from "@/lib/open-ena/plot3d";
import type {
  CameraPreset,
  OpenEnaConfig,
  OpenEnaMode,
  OpenEnaResult,
  ParsedDataset,
} from "@/lib/open-ena/types";
import {
  resetOpenEna3dCameraDistance,
  zoomOpenEna3dAspectRatio,
  zoomOpenEna3dCamera,
} from "./OpenEnaInteractive3DPlot";
import { getPlotlyGl3d, type PlotlyGl3dApi } from "./plotly-gl3d-loader";

type PlotlyApi = PlotlyGl3dApi;
type PlotlyImageApi = PlotlyApi;
type PlotRoot = HTMLDivElement & {
  _fullLayout?: {
    scene?: {
      camera?: unknown;
      aspectratio?: unknown;
      _scene?: {
        getCamera?: () => unknown;
        glplot?: { getAspectratio?: () => unknown };
      };
    };
    xaxis?: { range?: unknown };
    yaxis?: { range?: unknown };
  };
};
const WORKBENCH_STATUSES = ["initializing", "ready", "preparing", "running", "remote-confirmation", "remote-recovery", "complete", "error"] as const;
type WorkbenchStatus = (typeof WORKBENCH_STATUSES)[number];

function plotlyRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function plotlyVector(
  value: unknown,
  fallback: OpenEna3dCamera["eye"],
): OpenEna3dCamera["eye"] {
  const vector = plotlyRecord(value);
  return {
    x: typeof vector.x === "number" && Number.isFinite(vector.x) ? vector.x : fallback.x,
    y: typeof vector.y === "number" && Number.isFinite(vector.y) ? vector.y : fallback.y,
    z: typeof vector.z === "number" && Number.isFinite(vector.z) ? vector.z : fallback.z,
  };
}

function trajectoryPlotlyCamera(
  value: unknown,
  fallback: OpenEna3dCamera,
): OpenEna3dCamera {
  const camera = plotlyRecord(value);
  const projection = plotlyRecord(camera.projection);
  const projectionType = projection.type === "orthographic" || projection.type === "perspective"
    ? projection.type
    : fallback.projection.type;
  return {
    eye: plotlyVector(camera.eye, fallback.eye),
    center: plotlyVector(camera.center, fallback.center),
    up: plotlyVector(camera.up, fallback.up),
    projection: { type: projectionType },
  };
}

function trajectoryPlotlyAspectRatio(
  value: unknown,
  fallback: OpenEna3dAspectRatio,
): OpenEna3dAspectRatio {
  const ratio = plotlyRecord(value);
  const axis = (candidate: unknown, fallbackValue: number) => (
    typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0
      ? candidate
      : fallbackValue
  );
  return {
    x: axis(ratio.x, fallback.x),
    y: axis(ratio.y, fallback.y),
    z: axis(ratio.z, fallback.z),
  };
}

function trajectoryPlotlyRange(
  value: unknown,
  fallback?: readonly [number, number],
): [number, number] | null {
  if (
    Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
  ) return [value[0], value[1]];
  return fallback ? [...fallback] : null;
}

function trajectoryPlotlyRuntimeRanges(
  root: PlotRoot,
): TrajectoryPlotlyRangesV3 | null {
  const x = trajectoryPlotlyRange(root._fullLayout?.xaxis?.range);
  const y = trajectoryPlotlyRange(root._fullLayout?.yaxis?.range);
  return x && y ? { x, y } : null;
}

function trajectoryPlotlyRuntimeAspectRatio(
  root: PlotRoot,
): OpenEna3dAspectRatio | null {
  const scene = root._fullLayout?.scene;
  const runtimeRatio = scene?._scene?.glplot?.getAspectratio?.() ?? scene?.aspectratio;
  const ratio = plotlyRecord(runtimeRatio);
  if (
    typeof ratio.x !== "number" || !Number.isFinite(ratio.x) || ratio.x <= 0
    || typeof ratio.y !== "number" || !Number.isFinite(ratio.y) || ratio.y <= 0
    || typeof ratio.z !== "number" || !Number.isFinite(ratio.z) || ratio.z <= 0
  ) return null;
  return { x: ratio.x, y: ratio.y, z: ratio.z };
}

interface DisplayStateV3 {
  projection: TrajectoryDisplaySpecV2["projection"];
  displayedGroups: string[];
  traces: TrajectoryDisplaySpecV2["traces"];
  axisFlips: [boolean, boolean, boolean];
  cameraPreset: CameraPreset;
}

interface OpenEnaLongitudinalWorkbenchV3Props {
  locale: Locale;
  result: OpenEnaResult;
  config: OpenEnaConfig;
  dataset: ParsedDataset;
  datasetHash: string;
  modelResultStale: boolean;
  analysisControls: ReactNode | null;
  analysisControlsMode: OpenEnaMode;
}

export function OpenEnaLongitudinalV3ControlsSlot({
  analysisControlsMode,
  analysisControls,
  trajectoryControls,
}: {
  analysisControlsMode: OpenEnaMode;
  analysisControls: ReactNode | null;
  trajectoryControls: ReactNode;
}) {
  return (
    <>
      <div
        className="ena-longitudinal-v3-analysis-controls"
        data-testid="open-ena-longitudinal-v3-analysis-controls"
        data-controls-mode={analysisControlsMode}
        hidden={analysisControlsMode === "plot"}
      >
        {analysisControls}
      </div>
      <div
        className="ena-longitudinal-v3-trajectory-controls"
        data-testid="open-ena-longitudinal-v3-trajectory-controls"
        hidden={analysisControlsMode !== "plot"}
      >
        {trajectoryControls}
      </div>
    </>
  );
}

type PreparedLongitudinalRunV3 = Awaited<ReturnType<typeof buildOpenEnaLongitudinalExecutionRequestV3>>;

interface PendingLongitudinalRunV3 {
  prepared: PreparedLongitudinalRunV3;
  identity: Readonly<OpenEnaLongitudinalScientificRunIdentityV3>;
  settingsSnapshot: OpenEnaLongitudinalSettingsV3;
}

const english = {
  kicker: "jENA-derived analysis",
  title: "3D Longitudinal Trajectory Analysis",
  subtitle: "One immutable fitted jENA result, one versioned task bundle, and display-only 3D/2D views.",
  time: "Time / order variable",
  entity: "Entity ID",
  identity: "I confirm that the same raw ID represents the same physical entity across the selected periods.",
  identityHint: "Paired and repeated inference stays disabled until this exact dataset and mapping is confirmed.",
  group: "Optional group / condition",
  displayed: "Displayed trajectory levels",
  compare: "Compare A / B",
  inferenceSettings: "Inference tasks",
  independentAt: "Independent comparison period",
  pairedChange: "Paired change periods",
  repeatedSelection: "Repeated-measures periods",
  repeatedGroup: "Paired / repeated group",
  pathDesign: "Whole-path design",
  order: "Ordered time values",
  expected: "Expected empty period",
  addExpected: "Add expected period",
  earlier: "Move earlier",
  later: "Move later",
  cohort: "Cohort and estimand",
  available: "Available cohort",
  complete: "Complete cohort",
  missing: "Complete analytical rows",
  equal: "Equal participant",
  weighted: "Weighted participant",
  weightField: "Positive stable metadata weight",
  dimensions: "Selected ENA axes",
  fullDistance: "Full rotation distance is computed from every fitted jENA dimension; the selected axes affect selected-3D metrics only.",
  projection: "3D / 2D projection",
  paths: "Paths and marks",
  participantPoints: "Participant-period points",
  individualPaths: "Individual paths",
  centroids: "Group centroid paths",
  arrows: "Direction arrows",
  labels: "Labels",
  codeNodesHint: "ENA code reference nodes are always shown from the fitted jENA geometry. Trajectory analysis does not draw ENA mean-network edges.",
  overall: "Overall",
  run: "Run trajectory analysis",
  recompute: "Recompute trajectory analysis",
  cancel: "Cancel",
  retry: "Retry",
  retryRemote: "Retry remote",
  continueLocal: "Continue locally",
  confirmRemote: "Confirm persistent compute",
  disableHeavy: "Run without inference",
  stale: "Settings changed. The completed bundle below is stale until you explicitly recompute.",
  modelStale: "The fitted ENA model is stale relative to pending model controls. This workbench remains bound to the last successful fit.",
  remoteTitle: "Persistent compute confirmation required",
  remoteText: "Only preprojected coordinates, opaque participant tokens, group/time, required weights, and task parameters will be sent. Raw coded rows are excluded.",
  remoteRecoveryTitle: "Persistent compute did not complete",
  remoteRecoveryText: "You can continue the same task locally. Inference is removed only if you explicitly choose that option.",
  signInAgain: "Sign in again (opens a new tab)",
  resumeAfterSignIn: "I have signed in — retry remote",
  remoteWaitComplete: "The waiting period has ended. You can explicitly retry remote compute.",
  remoteBillingUnavailable: "Remote compute accounting is unavailable. Continue locally and try remote compute later.",
  remoteServiceUnavailable: "The remote compute service is unavailable. Continue locally and try again later.",
  remotePrivacyRejected: "The remote task did not pass the data privacy checks. Review the participant and time mappings before creating a new task.",
  remoteTaskRejected: "The remote task did not pass validation. Review the trajectory settings before creating a new task.",
  remoteOriginRejected: "The request origin was rejected. Keep your local work and reopen Open ENA from its official site before trying again.",
  remoteRequestRejected: "The remote request was rejected. Review the task settings before creating a new task.",
  remoteOtherFailure: "Remote compute did not complete. You can explicitly retry or continue locally.",
  remoteAuthRequired: "Your Open ENA session has expired. Sign in again, then return to this trajectory task.",
  remoteRateLimited: "Persistent compute is rate limited. Wait before trying the remote task again.",
  remoteRateLimitedWait: (seconds: number) => `Persistent compute is rate limited. Wait ${seconds} seconds before trying the remote task again.`,
  downloads: "Downloads",
  bundleZip: "Analysis bundle ZIP",
  pathCsv: "Path CSV",
  metadataCsv: "Metadata CSV",
  inferenceCsv: "Inference CSV",
  analysisJson: "Analysis JSON",
  plotlyJson: "Plotly spec JSON",
  participantZip: "Participant-level ZIP (opt-in)",
  privacyConfirm: "Participant-level histories can create re-identification risk. Include them in a local export?",
  plotTitle: "Longitudinal trajectory presenter",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  recenter: "Recenter / default distance",
  copyImage: "Copy image",
  imageCopied: "Image copied",
  imageDownloaded: "Image downloaded",
  actionUnavailable: "Plot action unavailable",
  camera: "3D camera preset",
  summary: "Accessible plot summary",
  mappingAudit: "Mapping and identity audit",
  pathTable: "Trajectory path metrics",
  inference: "Rank and whole-path inference",
  pathComparison: "Whole-path comparison",
  warnings: "Warnings and diagnostics",
  provenance: "Provenance",
  noResult: "Configure the mappings and run the versioned trajectory task.",
  initializing: "Preparing the fitted-result binding…",
  ready: "Ready to run",
  runStatePreparing: "Preparing the trajectory task",
  runStateRunning: "Running trajectory analysis",
  runStateComplete: "Trajectory analysis finished",
  runStateError: "Trajectory analysis failed",
  runStateRemoteConfirmation: "Waiting for persistent-compute confirmation",
  runStateRemoteRecovery: "Persistent compute stopped before finishing",
  notEstimable: "Not estimable",
  disabled: "Disabled",
  status: "Status",
  cacheHit: "Reused verified cached envelope",
  sourceRows: "Source rows",
  participants: "Participants",
  participantPeriods: "Participant-periods",
  duplicateRows: "Duplicate rows",
  duplicatedPeriods: "Duplicated periods",
  identityConfirmed: "Identity confirmed",
  yes: "Yes",
  no: "No",
  cohortLabel: "Cohort",
  estimandLabel: "Estimand",
  resultHash: "Result hash",
  pathCaption: "Group-period centroids, changes, selected-3D/full-space distances, elapsed time, speed, and cohort diagnostics",
  pathGroup: "Group",
  pathPeriod: "Period",
  pathRows: "Rows",
  pathParticipantPeriods: "P-P",
  pathIncluded: "Included",
  pathDuplicate: "Duplicate",
  path3dStep: "3D step",
  pathFullStep: "Full step",
  path3dCumulative: "3D cumulative",
  pathFullCumulative: "Full cumulative",
  pathElapsed: "Elapsed",
  path3dSpeed: "3D speed",
  pathFullSpeed: "Full speed",
  inferenceCaption: "Independent, paired, repeated, post-hoc, and whole-path families with Holm adjustment",
  requestColumn: "Request",
  testColumn: "Test",
  axisMetricColumn: "Axis / metric",
  estimandColumn: "Estimand",
  effectColumn: "Effect",
  statisticColumn: "Statistic",
  rawPColumn: "Raw p",
  holmPColumn: "Holm p",
  methodColumn: "Method",
  tiesColumn: "Ties",
  zerosColumn: "Zeros",
  statusReasonColumn: "Status / reason",
  noDiagnostics: "No diagnostics were emitted.",
  provenanceCaption: "Immutable scientific and execution binding",
  datasetHash: "Dataset hash",
  specHash: "Spec hash",
  sourceResultHash: "Source result hash",
  requestHash: "Request hash",
  runId: "Run ID",
  jenaBuild: "jENA build",
  jenaVersion: "jENA version",
  jenaCommit: "jENA commit",
  jenaIntegrity: "jENA integrity",
  sdkLabel: "3DENA SDK",
  executionTarget: "Execution target",
  evidence: "Evidence",
  permutationPlans: "Permutation plans",
  resamplingPlans: "Resampling plans",
  identityHeading: "Identity confirmation",
  axisFlipsLegend: "Axis flips (display only)",
  flipAxis: "Flip",
  independentPermutation: "Independent permutation",
  pairedPermutation: "Paired permutation",
  accumulatedOrderLocked: "AccumulatedTrajectory order is locked to the fitted chronology.",
  periodGap: "gap",
  predictedTime: "Predicted time",
  predictedMemory: "Predicted memory",
  hardDeadline: "Hard deadline",
  staleOverlay: "STALE · RECOMPUTE REQUIRED",
  notRun: "not run",
  emptyPlotSummary: "fitted dimensions",
  sourceRowsWord: "source rows",
};

const zhHans: typeof english = {
  ...english,
  kicker: "jENA 派生分析",
  title: "三维纵向轨迹分析",
  subtitle: "一个不可变的 jENA 拟合结果、一套版本化任务 bundle、仅用于显示的三维／二维视图。",
  time: "时间／顺序变量",
  entity: "实体 ID",
  identity: "我确认所选时期中的相同 raw ID 代表同一个真实实体。",
  identityHint: "只有对当前数据和映射完成确认后，配对与重复测量推断才会启用。",
  group: "可选组别／条件",
  displayed: "显示的轨迹层级",
  compare: "比较 A／B",
  inferenceSettings: "推断任务",
  independentAt: "独立比较时期",
  pairedChange: "配对变化时期",
  repeatedSelection: "重复测量时期",
  repeatedGroup: "配对／重复测量组别",
  pathDesign: "全路径设计",
  order: "有序时间值",
  expected: "预期空时期",
  addExpected: "添加预期时期",
  earlier: "向前移动",
  later: "向后移动",
  cohort: "队列与估计量",
  available: "可用队列",
  complete: "完整队列",
  missing: "完整分析行",
  equal: "参与者等权",
  weighted: "参与者加权",
  weightField: "正数且稳定的元数据权重",
  dimensions: "所选 ENA 轴",
  fullDistance: "全空间距离使用 jENA 拟合的全部维度；所选坐标轴只影响 selected-3D 指标。",
  projection: "三维／二维投影",
  paths: "路径与标记",
  participantPoints: "参与者－时期点",
  individualPaths: "个体路径",
  centroids: "组质心路径",
  arrows: "方向箭头",
  labels: "标签",
  codeNodesHint: "ENA code 参考节点始终显示，并直接使用拟合后的 jENA 几何坐标。轨迹分析不绘制 ENA 平均网络连线。",
  overall: "全部",
  run: "运行轨迹分析",
  recompute: "重新计算轨迹分析",
  cancel: "取消",
  retry: "重试",
  retryRemote: "重试远端计算",
  continueLocal: "继续本地运行",
  confirmRemote: "确认持久计算",
  disableHeavy: "关闭推断后运行",
  stale: "设置已经改变。下方旧 bundle 标记为过期，明确重新运行后才会更新。",
  modelStale: "待应用的模型控件与上次成功拟合不同；本工作台仍绑定上次成功结果。",
  remoteTitle: "需要确认持久计算",
  remoteText: "只发送预投影坐标、不透明参与者 token、组别／时间、必要权重以及任务参数；不发送原始编码行。",
  remoteRecoveryTitle: "持久计算未能完成",
  remoteRecoveryText: "可以继续在本地运行同一个任务；只有您明确选择时才会移除推断任务。",
  signInAgain: "重新登录（在新标签页打开）",
  resumeAfterSignIn: "我已登录，重试远端计算",
  remoteWaitComplete: "等待时间已结束。您可以主动重试远端计算。",
  remoteBillingUnavailable: "远端计算的用量记录服务暂时不可用。请继续本地运行，稍后再使用远端计算。",
  remoteServiceUnavailable: "远端计算服务暂时不可用。请继续本地运行，稍后再试。",
  remotePrivacyRejected: "远端任务未通过数据隐私检查。请检查参与者和时间映射，再创建新任务。",
  remoteTaskRejected: "远端任务未通过验证。请检查轨迹分析设置，再创建新任务。",
  remoteOriginRejected: "请求来源未通过验证。请保留本地工作，从官方网站重新打开开放 ENA 后再试。",
  remoteRequestRejected: "远端请求被拒绝。请检查任务设置，再创建新任务。",
  remoteOtherFailure: "远端计算未能完成。您可以主动重试，或继续本地运行。",
  remoteAuthRequired: "您的开放 ENA 会话已失效。请重新登录，再回到此轨迹任务。",
  remoteRateLimited: "持久计算已达到请求次数限制。请稍候，再尝试远端任务。",
  remoteRateLimitedWait: (seconds: number) => `持久计算已达到请求次数限制。请等待 ${seconds} 秒，再尝试远端任务。`,
  downloads: "下载",
  bundleZip: "分析 bundle ZIP",
  pathCsv: "路径 CSV",
  metadataCsv: "元数据 CSV",
  inferenceCsv: "推断 CSV",
  analysisJson: "分析 JSON",
  plotlyJson: "Plotly spec JSON",
  participantZip: "参与者级 ZIP（主动选择）",
  privacyConfirm: "参与者级历史可能带来重新识别风险。是否加入本地导出？",
  plotTitle: "纵向轨迹呈现器",
  fullscreen: "全屏",
  exitFullscreen: "退出全屏",
  zoomIn: "放大",
  zoomOut: "缩小",
  recenter: "重新居中／默认距离",
  copyImage: "复制图片",
  imageCopied: "图片已复制",
  imageDownloaded: "图片已下载",
  actionUnavailable: "图形操作暂不可用",
  camera: "三维相机预设",
  summary: "无障碍图形摘要",
  mappingAudit: "映射与实体审计",
  pathTable: "轨迹路径指标",
  inference: "秩检验与全路径推断",
  pathComparison: "全路径比较",
  warnings: "警告与诊断",
  provenance: "来源与版本",
  noResult: "完成映射后运行版本化轨迹任务。",
  initializing: "正在准备拟合结果绑定……",
  ready: "可以运行",
  runStatePreparing: "正在准备",
  runStateRunning: "正在运行",
  runStateComplete: "已完成",
  runStateError: "出错",
  runStateRemoteConfirmation: "等待确认持久计算",
  runStateRemoteRecovery: "持久计算未能完成",
  notEstimable: "不可估计",
  disabled: "已禁用",
  status: "状态",
  cacheHit: "复用了已验证的缓存 envelope",
  sourceRows: "来源数据行",
  participants: "参与者",
  participantPeriods: "参与者－时期",
  duplicateRows: "重复数据行",
  duplicatedPeriods: "重复时期",
  identityConfirmed: "标识已确认",
  yes: "是",
  no: "否",
  cohortLabel: "队列",
  estimandLabel: "估计量",
  resultHash: "结果哈希",
  pathCaption: "组－时期质心、变化、所选三维／全空间距离、经过时间、速度及队列诊断",
  pathGroup: "组",
  pathPeriod: "时期",
  pathRows: "数据行",
  pathParticipantPeriods: "参与者－时期",
  pathIncluded: "纳入",
  pathDuplicate: "重复",
  path3dStep: "三维步长",
  pathFullStep: "全空间步长",
  path3dCumulative: "三维累积",
  pathFullCumulative: "全空间累积",
  pathElapsed: "经过时间",
  path3dSpeed: "三维速度",
  pathFullSpeed: "全空间速度",
  inferenceCaption: "独立、配对、重复测量、事后及全路径检验族，并采用 Holm 校正",
  requestColumn: "请求",
  testColumn: "检验",
  axisMetricColumn: "坐标轴／指标",
  estimandColumn: "估计量",
  effectColumn: "效应",
  statisticColumn: "统计量",
  rawPColumn: "原始 p",
  holmPColumn: "Holm 校正 p",
  methodColumn: "方法",
  tiesColumn: "结",
  zerosColumn: "零值",
  statusReasonColumn: "状态／原因",
  noDiagnostics: "没有发出诊断。",
  provenanceCaption: "不可变的科学与执行绑定",
  datasetHash: "数据集哈希",
  specHash: "规格哈希",
  sourceResultHash: "来源结果哈希",
  requestHash: "请求哈希",
  runId: "运行 ID",
  jenaBuild: "jENA 构建",
  jenaVersion: "jENA 版本",
  jenaCommit: "jENA 提交",
  jenaIntegrity: "jENA 完整性",
  sdkLabel: "3DENA 开发套件",
  executionTarget: "执行目标",
  evidence: "证据",
  permutationPlans: "置换方案",
  resamplingPlans: "重抽样方案",
  identityHeading: "标识确认",
  axisFlipsLegend: "坐标轴翻转（仅显示）",
  flipAxis: "翻转",
  independentPermutation: "独立置换",
  pairedPermutation: "配对置换",
  accumulatedOrderLocked: "AccumulatedTrajectory 的顺序锁定于拟合时的时间顺序。",
  periodGap: "间隔",
  predictedTime: "预计时间",
  predictedMemory: "预计内存",
  hardDeadline: "硬性时限",
  staleOverlay: "已过期 · 需要重新计算",
  notRun: "尚未运行",
  emptyPlotSummary: "拟合维度",
  sourceRowsWord: "来源数据行",
};

const zhHant: typeof english = {
  ...zhHans,
  title: "三維縱向軌跡分析",
  subtitle: "一個不可變的 jENA 擬合結果、一套版本化任務 bundle、僅用於顯示的三維／二維視圖。",
  time: "時間／順序變量",
  entity: "實體 ID",
  displayed: "顯示的軌跡層級",
  complete: "完整隊列",
  downloads: "下載",
  fullscreen: "全螢幕",
  zoomIn: "放大",
  zoomOut: "縮小",
  recenter: "回正／預設距離",
  copyImage: "複製圖片",
  imageCopied: "圖片已複製",
  imageDownloaded: "圖片已下載",
  actionUnavailable: "繪圖操作暫時無法使用",
  disableHeavy: "關閉推斷後運行",
  retryRemote: "重試遠端計算",
  remoteRecoveryTitle: "持久計算未能完成",
  remoteRecoveryText: "可以繼續在本地運行同一個任務；只有您明確選擇時才會移除推斷任務。",
  signInAgain: "重新登入（在新分頁開啟）",
  resumeAfterSignIn: "我已登入，重試遠端計算",
  remoteWaitComplete: "等待時間已結束。您可以主動重試遠端計算。",
  remoteBillingUnavailable: "遠端計算的用量記錄服務暫時無法使用。請繼續本地運行，稍後再使用遠端計算。",
  remoteServiceUnavailable: "遠端計算服務暫時無法使用。請繼續本地運行，稍後再試。",
  remotePrivacyRejected: "遠端任務未通過資料隱私檢查。請檢查參與者和時間映射，再建立新任務。",
  remoteTaskRejected: "遠端任務未通過驗證。請檢查軌跡分析設定，再建立新任務。",
  remoteOriginRejected: "請求來源未通過驗證。請保留本地工作，從官方網站重新開啟開放 ENA 後再試。",
  remoteRequestRejected: "遠端請求被拒絕。請檢查任務設定，再建立新任務。",
  remoteOtherFailure: "遠端計算未能完成。您可以主動重試，或繼續本地運行。",
  remoteAuthRequired: "您的開放 ENA 工作階段已失效。請重新登入，再回到此軌跡任務。",
  remoteRateLimited: "持久計算已達到請求次數限制。請稍候，再嘗試遠端任務。",
  remoteRateLimitedWait: (seconds: number) => `持久計算已達到請求次數限制。請等待 ${seconds} 秒，再嘗試遠端任務。`,
  remoteText: "只發送預投影坐標、不透明參與者 token、組別／時間、必要權重以及任務參數；不發送原始編碼行。",
  codeNodesHint: "ENA code 參考節點始終顯示，並直接使用擬合後的 jENA 幾何坐標。軌跡分析不繪製 ENA 平均網絡連線。",
  mappingAudit: "映射與實體審計",
  provenance: "來源與版本",
  sourceRows: "來源資料列",
  participants: "參與者",
  participantPeriods: "參與者－期間",
  duplicateRows: "重複資料列",
  duplicatedPeriods: "重複期間",
  identityConfirmed: "識別已確認",
  yes: "是",
  no: "否",
  cohortLabel: "隊列",
  estimandLabel: "估計目標",
  resultHash: "結果雜湊",
  pathCaption: "群組－期間質心、變化、所選三維／全空間距離、經過時間、速度及隊列診斷",
  pathGroup: "群組",
  pathPeriod: "期間",
  pathRows: "資料列",
  pathParticipantPeriods: "參與者－期間",
  pathIncluded: "納入",
  pathDuplicate: "重複",
  path3dStep: "三維步長",
  pathFullStep: "全空間步長",
  path3dCumulative: "三維累積",
  pathFullCumulative: "全空間累積",
  pathElapsed: "經過時間",
  path3dSpeed: "三維速度",
  pathFullSpeed: "全空間速度",
  inferenceCaption: "獨立、配對、重複測量、事後及全路徑檢定族，並採用 Holm 校正",
  requestColumn: "請求",
  testColumn: "檢定",
  axisMetricColumn: "座標軸／指標",
  estimandColumn: "估計目標",
  effectColumn: "效應",
  statisticColumn: "統計量",
  rawPColumn: "原始 p",
  holmPColumn: "Holm 校正 p",
  methodColumn: "方法",
  tiesColumn: "結",
  zerosColumn: "零值",
  statusReasonColumn: "狀態／原因",
  noDiagnostics: "沒有發出診斷。",
  provenanceCaption: "不可變的科學與執行綁定",
  datasetHash: "資料集雜湊",
  specHash: "規格雜湊",
  sourceResultHash: "來源結果雜湊",
  requestHash: "請求雜湊",
  runId: "執行 ID",
  jenaBuild: "jENA 組建",
  jenaVersion: "jENA 版本",
  jenaCommit: "jENA 提交",
  jenaIntegrity: "jENA 完整性",
  sdkLabel: "3DENA 開發套件",
  executionTarget: "執行目標",
  evidence: "證據",
  permutationPlans: "置換方案",
  resamplingPlans: "重抽樣方案",
  identityHeading: "識別確認",
  axisFlipsLegend: "座標軸翻轉（僅顯示）",
  flipAxis: "翻轉",
  independentPermutation: "獨立置換",
  pairedPermutation: "配對置換",
  accumulatedOrderLocked: "AccumulatedTrajectory 的順序鎖定於擬合時的時間順序。",
  periodGap: "間隔",
  predictedTime: "預計時間",
  predictedMemory: "預計記憶體",
  hardDeadline: "硬性時限",
  staleOverlay: "已過期 · 需要重新計算",
  notRun: "尚未執行",
  emptyPlotSummary: "擬合維度",
  sourceRowsWord: "來源資料列",
  initializing: "正在準備擬合結果綁定……",
  ready: "可以運行",
  runStatePreparing: "正在準備",
  runStateRunning: "正在執行",
  runStateComplete: "已完成",
  runStateError: "出錯",
  runStateRemoteConfirmation: "等待確認持久計算",
  runStateRemoteRecovery: "持久計算未能完成",
};

export function getOpenEnaLongitudinalV3Copy(locale: Locale): typeof english {
  return locale === "zh-hans" ? zhHans : locale === "zh-hant" ? zhHant : english;
}

const WORKBENCH_STATUS_LABELS = {
  initializing: "initializing",
  ready: "ready",
  preparing: "runStatePreparing",
  running: "runStateRunning",
  "remote-confirmation": "runStateRemoteConfirmation",
  "remote-recovery": "runStateRemoteRecovery",
  complete: "runStateComplete",
  error: "runStateError",
} as const satisfies Record<WorkbenchStatus, keyof typeof english>;

export function openEnaLongitudinalWorkbenchStatusLabel(
  copy: typeof english,
  status: WorkbenchStatus,
): string {
  return copy[WORKBENCH_STATUS_LABELS[status]];
}

export function OpenEnaLongitudinalWorkbenchStatusLine({
  copy,
  status,
  progress,
  cacheHit,
}: {
  copy: typeof english;
  status: WorkbenchStatus;
  progress?: number;
  cacheHit?: boolean;
}) {
  const label = openEnaLongitudinalWorkbenchStatusLabel(copy, status);
  const showProgress = status === "running" || status === "preparing";
  return (
    <div className="ena-longitudinal-v3-run-status" role="status" aria-live="polite">
      <span data-state={status} />
      <strong>{label}</strong>
      {showProgress ? <progress max="1" value={progress ?? 0}>{Math.round((progress ?? 0) * 100)}%</progress> : null}
      {cacheHit ? <small>{copy.cacheHit}</small> : null}
    </div>
  );
}

function remoteRecoveryReason(
  copy: ReturnType<typeof getOpenEnaLongitudinalV3Copy>,
  failure: OpenEnaLongitudinalExecutionClientErrorV3,
  waitSeconds: number,
): string {
  if (failure.code === "REMOTE_AUTH_REQUIRED") return copy.remoteAuthRequired;
  if (failure.code === "REMOTE_RATE_LIMITED") {
    return waitSeconds > 0 ? copy.remoteRateLimitedWait(waitSeconds) : copy.remoteWaitComplete;
  }
  if (failure.code === "REMOTE_SERVICE_UNAVAILABLE") return failure.serverCode === "BILLING_UNAVAILABLE"
    ? copy.remoteBillingUnavailable : copy.remoteServiceUnavailable;
  if (failure.code === "REMOTE_REQUEST_REJECTED") {
    if (failure.serverCode === "PRIVACY_BOUNDARY_VIOLATION") return copy.remotePrivacyRejected;
    if (failure.serverCode === "INVALID_LONGITUDINAL_TASK") return copy.remoteTaskRejected;
    if (failure.serverCode === "INVALID_REQUEST_ORIGIN") return copy.remoteOriginRejected;
    return copy.remoteRequestRejected;
  }
  return copy.remoteOtherFailure;
}

function finiteText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumSignificantDigits: 7 }) : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function pathRows(bundle: LongitudinalAnalysisBundleV2): Array<Record<string, unknown>> {
  return bundle.paths.flatMap((path) => path.dynamics.periods.map((period) => ({
    group: path.group.display,
    groupCanonical: path.group.canonical,
    period: period.time.display,
    periodCanonical: period.time.canonical,
    x: period.selectedCentroid?.[0] ?? null,
    y: period.selectedCentroid?.[1] ?? null,
    z: period.selectedCentroid?.[2] ?? null,
    deltaX: period.selected3d.delta?.[0] ?? null,
    deltaY: period.selected3d.delta?.[1] ?? null,
    deltaZ: period.selected3d.delta?.[2] ?? null,
    selected3dStepDistance: period.selected3d.stepDistance,
    selected3dCumulativeDistance: period.selected3d.cumulativeDistance,
    selected3dSpeed: period.selected3d.speed,
    fullSpaceStepDistance: period.fullSpace.stepDistance,
    fullSpaceCumulativeDistance: period.fullSpace.cumulativeDistance,
    fullSpaceSpeed: period.fullSpace.speed,
    elapsedFromPrevious: period.elapsedFromPrevious,
    elapsedFromStart: period.elapsedFromStart,
    rows: period.nRows,
    participantPeriods: period.nParticipantPeriods,
    included: period.nUsed,
    duplicateRows: period.nDuplicateRows,
    cohortExcluded: period.nCohortExcluded,
    effectiveParticipantN: period.effectiveParticipantN,
  })));
}

function inferenceRows(bundle: LongitudinalAnalysisBundleV2): Array<Record<string, unknown>> {
  const rankRows = bundle.inference.flatMap((family) => family.rows.length
    ? family.rows.map((row) => ({ requestKind: family.request.kind, familyId: family.familyId, familySize: family.familySize, familyStatus: family.status, familyReason: family.reason, ...row }))
    : [{ requestKind: family.request.kind, familyId: family.familyId, familySize: family.familySize, familyStatus: family.status, familyReason: family.reason }]);
  const pathTests = bundle.pathComparisons.flatMap((comparison) => comparison.result.tests.map((row) => ({
    requestKind: "path-comparison",
    design: comparison.design,
    groups: comparison.groups.join(" vs "),
    planHash: comparison.planHash,
    ...row,
  })));
  return [...rankRows, ...pathTests];
}

function downloadBlob(name: string, value: BlobPart, type: string): void {
  const blob = isCsvDownloadMediaType(type) && (typeof value === "string" || value instanceof Uint8Array)
    ? csvDownloadBlob(value) : new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Decode Plotly's data URL locally so CSP connect-src never blocks export. */
export function imageDataUrlToBlob(image: string): Blob {
  const separator = image.indexOf(",");
  if (!image.startsWith("data:") || separator < 0) throw new TypeError("Plotly returned an invalid image data URL.");
  const header = image.slice(5, separator);
  const payload = image.slice(separator + 1);
  const [mediaType = "application/octet-stream", ...parameters] = header.split(";");
  if (parameters.includes("base64")) {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: mediaType });
  }
  return new Blob([decodeURIComponent(payload)], { type: mediaType });
}

export function cameraForDisplay(preset: CameraPreset) {
  const camera = cameraForPreset(preset);
  return {
    eye: { ...camera.eye },
    center: { ...camera.center },
    up: { ...camera.up },
    projection: { ...camera.projection },
  };
}

export function OpenEnaTrajectoryPlotShellV3({
  fallbackFullscreen,
  label,
  shellRef,
  children,
}: {
  fallbackFullscreen: boolean;
  label: string;
  shellRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      ref={shellRef}
      className="ena-longitudinal-v3-plot-shell"
      data-fallback-fullscreen={fallbackFullscreen ? "true" : undefined}
      role={fallbackFullscreen ? "dialog" : undefined}
      aria-modal={fallbackFullscreen ? true : undefined}
      aria-label={fallbackFullscreen ? label : undefined}
    >
      {children}
    </div>
  );
}

function TrajectoryPlotlyPresenterV3({ spec, cameraPreset, labels }: {
  spec: TrajectoryPlotlySpecV2;
  cameraPreset: CameraPreset;
  labels: typeof english;
}) {
  const rootRef = useRef<PlotRoot>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const fallbackFullscreenOpenerRef = useRef<HTMLElement | null>(null);
  const fallbackFullscreenExitRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<TrajectoryPlotlyControllerV3 | null>(null);
  const actionStatusTimerRef = useRef<number | null>(null);
  const [Plotly, setPlotly] = useState<PlotlyImageApi | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [compactLayout, setCompactLayout] = useState(false);
  const [nativeFullscreenLayout, setNativeFullscreenLayout] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const fullscreenLayout = nativeFullscreenLayout || fallbackFullscreen;
  const plotId = useId();
  const canvasId = `open-ena-longitudinal-v3-plot-${plotId.replace(/:/gu, "")}`;
  const defaultCamera = useMemo(() => {
    const scene = plotlyRecord(spec.layout.scene);
    return trajectoryPlotlyCamera(scene.camera, cameraForPreset(cameraPreset));
  }, [spec, cameraPreset]);

  useEffect(() => {
    let active = true;
    void getPlotlyGl3d().then((module) => {
      if (active) setPlotly(() => module);
    }).catch(() => active && setStatus("error"));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => {
      const next = shell.getBoundingClientRect().width <= 560;
      setCompactLayout((current) => current === next ? current : next);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(shell);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    controllerRef.current = null;
  }, [Plotly]);

  useEffect(() => {
    if (!Plotly || !rootRef.current) return;
    let active = true;
    const root = rootRef.current;
    const mutableSpec = applyFullscreenTrajectoryPlotlyLayoutV3(
      applyCompactTrajectoryPlotlyLayoutV3(
        cloneTrajectoryPlotlyInputV3(spec),
        compactLayout,
      ),
      fullscreenLayout,
    );
    const controller = controllerRef.current ?? createTrajectoryPlotlyControllerV3({
      react: (input) => Plotly.react(
        root,
        input.data as never[],
        input.layout as never,
        input.config as never,
      ),
      relayout: (payload) => Plotly.relayout(root, payload as never),
      toImage: (options) => Plotly.toImage(root, options as {
        format: "png";
        width: number;
        height: number;
        scale: number;
      }),
      readRanges: () => trajectoryPlotlyRuntimeRanges(root),
      readAspectRatio: () => trajectoryPlotlyRuntimeAspectRatio(root),
      readCamera: (fallback) => {
        const scene = root._fullLayout?.scene;
        const runtimeCamera = scene?._scene?.getCamera?.() ?? scene?.camera;
        return trajectoryPlotlyCamera(runtimeCamera, fallback);
      },
      zoomCamera: zoomOpenEna3dCamera,
      resetCamera: resetOpenEna3dCameraDistance,
      zoomAspectRatio: zoomOpenEna3dAspectRatio,
      onPendingChange: setActionPending,
    });
    controllerRef.current = controller;
    setStatus("loading");
    void controller.render({
      specKey: spec,
      input: mutableSpec,
      hasScene: spec.layout.scene !== undefined,
      defaultCamera,
    })
      .then((result) => {
        if (active && result.status === "completed") setStatus("ready");
      })
      .catch(() => active && setStatus("error"));
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      try { void Promise.resolve(Plotly.Plots.resize(root)).catch(() => {}); } catch { /* detached */ }
    });
    observer?.observe(root);
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [Plotly, spec, compactLayout, fullscreenLayout, defaultCamera]);

  useEffect(() => {
    if (!Plotly) return;
    let frame: number | null = null;
    const resizePlot = () => {
      setNativeFullscreenLayout(document.fullscreenElement === shellRef.current);
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const root = rootRef.current;
        if (!root) return;
        try { void Promise.resolve(Plotly.Plots.resize(root)).catch(() => {}); } catch { /* detached */ }
      });
    };
    document.addEventListener("fullscreenchange", resizePlot);
    window.addEventListener("resize", resizePlot);
    resizePlot();
    return () => {
      document.removeEventListener("fullscreenchange", resizePlot);
      window.removeEventListener("resize", resizePlot);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [Plotly]);

  useEffect(() => {
    if (!fallbackFullscreen) return;
    const shell = shellRef.current;
    if (!shell) return;
    const restoreOutsideTree = isolateOpenEnaFallbackFullscreenOutsideTreeV3(
      shell,
      document.body,
    );
    let focusFrame: number | null = window.requestAnimationFrame(() => {
      focusFrame = null;
      fallbackFullscreenExitRef.current?.focus();
    });
    const focusSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const handleFallbackFullscreenKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setFallbackFullscreen(false);
        return;
      }
      if (event.key === "Tab") {
        const focusables = Array.from(shell.querySelectorAll<HTMLElement>(focusSelector))
          .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
        const nextFocus = nextOpenEnaFallbackFullscreenFocusV3(
          focusables,
          document.activeElement instanceof HTMLElement ? document.activeElement : null,
          event.shiftKey,
        );
        if (!nextFocus) return;
        event.preventDefault();
        nextFocus.focus();
      }
    };
    document.addEventListener("keydown", handleFallbackFullscreenKeyDown);
    return () => {
      document.removeEventListener("keydown", handleFallbackFullscreenKeyDown);
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      restoreOutsideTree();
      fallbackFullscreenOpenerRef.current?.focus();
    };
  }, [fallbackFullscreen]);

  useEffect(() => () => {
    if (Plotly && rootRef.current) Plotly.purge(rootRef.current);
  }, [Plotly]);

  useEffect(() => () => {
    if (actionStatusTimerRef.current !== null) {
      window.clearTimeout(actionStatusTimerRef.current);
    }
  }, []);

  const announceAction = (message: string) => {
    setActionStatus("");
    if (actionStatusTimerRef.current !== null) {
      window.clearTimeout(actionStatusTimerRef.current);
    }
    actionStatusTimerRef.current = window.setTimeout(() => {
      setActionStatus(message);
      actionStatusTimerRef.current = null;
    }, 0);
  };

  const copyImage = async () => {
    const controller = controllerRef.current;
    if (!controller || status !== "ready") return;
    try {
      const result = await controller.copy(
        { format: "png", width: 1600, height: 1000, scale: 1 },
        async (image, isCurrent) => {
          const blob = imageDataUrlToBlob(image);
          if (!isCurrent()) return "";
          if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            return labels.imageCopied;
          }
          downloadBlob("3dena-longitudinal-trajectory.png", blob, "image/png");
          return labels.imageDownloaded;
        },
      );
      if (result.status === "completed") announceAction(result.value);
    } catch {
      announceAction(labels.actionUnavailable);
    }
  };

  const changePlotZoom = async (direction: "in" | "out") => {
    const controller = controllerRef.current;
    if (!controller || status !== "ready") return;
    try {
      const result = await controller.zoom(direction);
      if (result.status === "completed") {
        announceAction(direction === "in" ? labels.zoomIn : labels.zoomOut);
      }
    } catch {
      announceAction(labels.actionUnavailable);
    }
  };

  const recenterPlot = async () => {
    const controller = controllerRef.current;
    if (!controller || status !== "ready") return;
    try {
      const result = await controller.recenter();
      if (result.status === "completed") announceAction(labels.recenter);
    } catch {
      announceAction(labels.actionUnavailable);
    }
  };

  const toggleFullscreen = async () => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement === shell) {
      await document.exitFullscreen();
      return;
    }
    if (fallbackFullscreen) {
      setFallbackFullscreen(false);
      return;
    }
    try {
      await shell.requestFullscreen();
    } catch {
      // Extension-controlled and embedded browsers can deny the native API.
      // Keep the interaction useful with an equivalent viewport-filling layer.
      fallbackFullscreenOpenerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setFallbackFullscreen(true);
    }
  };

  return (
    <OpenEnaTrajectoryPlotShellV3
      shellRef={shellRef}
      fallbackFullscreen={fallbackFullscreen}
      label={labels.plotTitle}
    >
      <div className="ena-longitudinal-v3-plot-actions" role="toolbar" aria-label={labels.plotTitle}>
        <button ref={fallbackFullscreenExitRef} type="button" aria-controls={canvasId} aria-pressed={fullscreenLayout} onClick={() => void toggleFullscreen()}>{fullscreenLayout ? labels.exitFullscreen : labels.fullscreen}</button>
        <button type="button" data-ena-plot-action="zoom-in" aria-controls={canvasId} onClick={() => void changePlotZoom("in")} disabled={status !== "ready" || actionPending}>{labels.zoomIn}</button>
        <button type="button" data-ena-plot-action="zoom-out" aria-controls={canvasId} onClick={() => void changePlotZoom("out")} disabled={status !== "ready" || actionPending}>{labels.zoomOut}</button>
        <button type="button" data-ena-plot-action="recenter" data-ena-recenter-behavior="default-distance" aria-controls={canvasId} onClick={() => void recenterPlot()} disabled={status !== "ready" || actionPending}>{labels.recenter}</button>
        <button type="button" data-ena-plot-action="copy-image" aria-controls={canvasId} onClick={() => void copyImage()} disabled={status !== "ready" || actionPending}>{labels.copyImage}</button>
        <span className="sr-only" role="status" aria-live="polite">{actionStatus}</span>
      </div>
      <div
        id={canvasId}
        ref={rootRef}
        className="ena-longitudinal-v3-plot"
        data-testid="open-ena-longitudinal-v3-plot"
        role="img"
        aria-label={`${labels.plotTitle}. ${spec.data.length} Plotly traces. Result ${spec.resultHash.slice(0, 12)}.`}
      />
      <p className="sr-only" aria-live="polite">{status === "ready" ? `${labels.summary}: ${spec.data.length} traces.` : status}</p>
    </OpenEnaTrajectoryPlotShellV3>
  );
}

function AuditCards({ profile, settings, bundle, copy }: {
  profile: OpenEnaLongitudinalMappingProfileV3;
  settings: OpenEnaLongitudinalSettingsV3;
  bundle: LongitudinalAnalysisBundleV2;
  copy: typeof english;
}) {
  return (
    <section className="ena-longitudinal-v3-result-section" data-testid="open-ena-longitudinal-v3-mapping-audit">
      <h3>{copy.mappingAudit}</h3>
      <dl className="ena-longitudinal-v3-audit-grid">
        <div><dt>{copy.sourceRows}</dt><dd>{profile.sourceRows}</dd></div>
        <div><dt>{copy.participants}</dt><dd>{profile.participants}</dd></div>
        <div><dt>{copy.participantPeriods}</dt><dd>{profile.participantPeriods}</dd></div>
        <div><dt>{copy.duplicateRows}</dt><dd>{profile.duplicateRows}</dd></div>
        <div><dt>{copy.duplicatedPeriods}</dt><dd>{profile.duplicatedParticipantPeriods}</dd></div>
        <div><dt>{copy.identityConfirmed}</dt><dd>{settings.identityConfirmed ? copy.yes : copy.no}</dd></div>
        <div><dt>{copy.cohortLabel}</dt><dd>{settings.cohortPolicy}</dd></div>
        <div><dt>{copy.estimandLabel}</dt><dd>{settings.estimand.kind}</dd></div>
        <div><dt>{copy.resultHash}</dt><dd title={bundle.identity.resultHash}>{bundle.identity.resultHash.slice(0, 14)}…</dd></div>
      </dl>
    </section>
  );
}

function ResultsTablesV3({ bundle, copy }: { bundle: LongitudinalAnalysisBundleV2; copy: typeof english }) {
  const paths = pathRows(bundle);
  const ranks = inferenceRows(bundle);
  const warnings = [
    ...bundle.diagnostics,
    ...(bundle.model.type === "AccumulatedTrajectory" ? [{ code: "ACCUMULATED_PATH_DEPENDENCE", severity: "info" as const, message: "AccumulatedTrajectory chronology is locked because later points include earlier history." }] : []),
  ].sort((left, right) => ({ error: 0, warning: 1, info: 2 }[left.severity]) - ({ error: 0, warning: 1, info: 2 }[right.severity]));
  return (
    <div className="ena-longitudinal-v3-results-stack">
      <section className="ena-longitudinal-v3-result-section" data-testid="open-ena-longitudinal-v3-path-table">
        <h3>{copy.pathTable}</h3>
        <div className="ena-longitudinal-v3-table-wrap"><table>
          <caption>{copy.pathCaption}</caption>
          <thead><tr>{[copy.pathGroup, copy.pathPeriod, copy.pathRows, copy.pathParticipantPeriods, copy.pathIncluded, copy.pathDuplicate, "X", "Y", "Z", "ΔX", "ΔY", "ΔZ", copy.path3dStep, copy.pathFullStep, copy.path3dCumulative, copy.pathFullCumulative, copy.pathElapsed, copy.path3dSpeed, copy.pathFullSpeed].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{paths.map((row, index) => <tr key={`${row.groupCanonical}-${row.periodCanonical}-${index}`}>
            <th scope="row">{finiteText(row.group)}</th><td>{finiteText(row.period)}</td><td>{finiteText(row.rows)}</td><td>{finiteText(row.participantPeriods)}</td><td>{finiteText(row.included)}</td><td>{finiteText(row.duplicateRows)}</td><td>{finiteText(row.x)}</td><td>{finiteText(row.y)}</td><td>{finiteText(row.z)}</td><td>{finiteText(row.deltaX)}</td><td>{finiteText(row.deltaY)}</td><td>{finiteText(row.deltaZ)}</td><td>{finiteText(row.selected3dStepDistance)}</td><td>{finiteText(row.fullSpaceStepDistance)}</td><td>{finiteText(row.selected3dCumulativeDistance)}</td><td>{finiteText(row.fullSpaceCumulativeDistance)}</td><td>{finiteText(row.elapsedFromPrevious)}</td><td>{finiteText(row.selected3dSpeed)}</td><td>{finiteText(row.fullSpaceSpeed)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="ena-longitudinal-v3-result-section" data-testid="open-ena-longitudinal-v3-inference">
        <h3>{copy.inference}</h3>
        <div className="ena-longitudinal-v3-table-wrap"><table>
          <caption>{copy.inferenceCaption}</caption>
          <thead><tr>{[copy.requestColumn, copy.testColumn, copy.axisMetricColumn, copy.estimandColumn, "n", copy.effectColumn, copy.statisticColumn, copy.rawPColumn, copy.holmPColumn, copy.methodColumn, copy.tiesColumn, copy.zerosColumn, copy.statusReasonColumn].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{ranks.map((row, index) => <tr key={`${finiteText(row.familyId)}-${index}`}>
            <th scope="row">{finiteText(row.requestKind)}</th><td>{finiteText(row.test)}</td><td>{finiteText(row.axis ?? row.metric)}</td><td>{finiteText(row.estimand)}</td><td>{finiteText(row.n ?? `${finiteText(row.nPrimary)}/${finiteText(row.nSecondary)}`)}</td><td>{finiteText(row.effect)}</td><td>{finiteText(row.statistic)}</td><td>{finiteText(row.pRaw ?? row.pValue)}</td><td>{finiteText(row.pHolm ?? row.holmAdjustedPValue)}</td><td>{finiteText(row.method)}</td><td>{finiteText(row.ties)}</td><td>{finiteText(row.zeros)}</td><td>{finiteText(row.status ?? row.familyStatus)} {finiteText(row.reason ?? row.familyReason)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="ena-longitudinal-v3-result-section" data-testid="open-ena-longitudinal-v3-warnings">
        <h3>{copy.warnings}</h3>
        {warnings.length ? <ul className="ena-longitudinal-v3-warning-list">{warnings.map((warning, index) => <li key={`${warning.code}-${index}`} data-severity={warning.severity}><strong>{warning.severity.toUpperCase()} · {warning.code}</strong><span>{warning.message}</span></li>)}</ul> : <p>{copy.noDiagnostics}</p>}
      </section>

      <section className="ena-longitudinal-v3-result-section" data-testid="open-ena-longitudinal-v3-provenance">
        <h3>{copy.provenance}</h3>
        <div className="ena-longitudinal-v3-table-wrap"><table>
          <caption>{copy.provenanceCaption}</caption>
          <tbody>{[
            [copy.datasetHash, bundle.identity.datasetHash], [copy.specHash, bundle.identity.specHash], [copy.sourceResultHash, bundle.identity.sourceResultHash], [copy.requestHash, bundle.identity.requestHash], [copy.resultHash, bundle.identity.resultHash], [copy.runId, bundle.identity.runId], [copy.jenaBuild, bundle.identity.jenaBuildId], [copy.jenaVersion, bundle.execution.jenaVersion], [copy.jenaCommit, bundle.execution.jenaCommit], [copy.jenaIntegrity, bundle.execution.jenaTarballIntegrity], [copy.sdkLabel, `${bundle.execution.sdkVersion} · ${bundle.execution.buildId}`], [copy.executionTarget, bundle.execution.target], [copy.evidence, bundle.execution.evidenceStatus], [copy.permutationPlans, bundle.execution.permutationPlanHashes.join("; ") || "—"], [copy.resamplingPlans, bundle.execution.resamplingPlanHashes.join("; ") || "—"],
          ].map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}

export default function OpenEnaLongitudinalWorkbenchV3({
  locale,
  result,
  config,
  dataset,
  datasetHash,
  modelResultStale,
  analysisControls,
  analysisControlsMode,
}: OpenEnaLongitudinalWorkbenchV3Props) {
  const copy = getOpenEnaLongitudinalV3Copy(locale);
  const [settings, setSettings] = useState<OpenEnaLongitudinalSettingsV3 | null>(null);
  const [bundle, setBundle] = useState<LongitudinalAnalysisBundleV2 | null>(null);
  const [binding, setBinding] = useState<OpenEnaLongitudinalBindingV3 | null>(null);
  const [display, setDisplay] = useState<DisplayStateV3>({
    projection: "3d",
    displayedGroups: [],
    traces: { participants: true, individualPaths: false, centroids: true, paths: true, directionArrows: true, uncertainty: false, networkOverlay: false, codeNodes: true, labels: true },
    axisFlips: [false, false, false],
    cameraPreset: "isometric",
  });
  const [status, setStatus] = useState<WorkbenchStatus>("initializing");
  const [progress, setProgress] = useState<OpenEnaLongitudinalProgressV3>({ progress: 0, stage: "validate-binding" });
  const [error, setError] = useState<string | null>(null);
  const [scientificDirty, setScientificDirty] = useState(false);
  const [routeDecision, setRouteDecision] = useState<OpenEnaLongitudinalRouteDecisionV3 | null>(null);
  const [remoteFailure, setRemoteFailure] = useState<OpenEnaLongitudinalExecutionClientErrorV3 | null>(null);
  // A remote cooldown belongs to this workbench, not to a mutable scientific task.
  // Neither scientific edits, local continuation nor cancellation resets it.
  const remoteRetryAtRef = useRef(0);
  const [remoteRetryAt, setRemoteRetryAt] = useState(0);
  const [cooldownNow, setCooldownNow] = useState(0);
  const remoteWaitSeconds = Math.max(0, Math.ceil((remoteRetryAt - cooldownNow) / 1000));
  useEffect(() => {
    if (remoteRetryAt <= Date.now()) { setCooldownNow(Date.now()); return; }
    const timer = setInterval(() => {
      const now = Date.now();
      setCooldownNow(now);
      if (now >= remoteRetryAt) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [remoteRetryAt]);
  const [pendingRun, setPendingRun] = useState<PendingLongitudinalRunV3 | null>(null);
  const [cacheHit, setCacheHit] = useState(false);
  const [expectedPeriodLabel, setExpectedPeriodLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scientificRevisionRef = useRef(0);
  const initializationKey = `${datasetHash}\u001f${result.analyzedAt}\u001f${config.model}\u001f${config.unitColumns.join("\u001e")}\u001f${config.conversationColumns.join("\u001e")}`;

  useEffect(() => {
    let active = true;
    abortRef.current?.abort();
    scientificRevisionRef.current = advanceOpenEnaLongitudinalScientificRevisionV3(scientificRevisionRef.current);
    setStatus("initializing");
    setBundle(null);
    setBinding(null);
    setScientificDirty(false);
    setError(null);
    setRemoteFailure(null);
    setPendingRun(null);
    setRouteDecision(null);
    setCacheHit(false);
    void createOpenEnaLongitudinalSettingsV3({ result, config, dataset, datasetHash }).then((next) => {
      if (!active) return;
      const inventory = openEnaLongitudinalDisplayInventoryV3(dataset, config, next);
      setSettings(next);
      setDisplay((current) => ({ ...current, displayedGroups: inventory.groups.map((group) => group.canonical) }));
      setStatus("ready");
    }).catch((caught) => {
      if (!active) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    });
    return () => { active = false; };
  // All values participating in initializationKey are immutable fit bindings.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializationKey]);

  useEffect(() => () => {
    // Preparation hashes run before an execution AbortController exists.
    // Retire their revision as well so they cannot dispatch after unmount.
    scientificRevisionRef.current = advanceOpenEnaLongitudinalScientificRevisionV3(scientificRevisionRef.current);
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const profile = useMemo(() => settings
    ? profileOpenEnaLongitudinalMappingV3(dataset, config, settings)
    : null, [config, dataset, settings]);
  const inventory = useMemo(() => settings
    ? openEnaLongitudinalDisplayInventoryV3(dataset, config, settings)
    : { groups: [], periods: [] }, [config, dataset, settings]);
  const stale = Boolean(bundle && (scientificDirty || !binding || isOpenEnaLongitudinalBundleStaleV3(bundle, binding)));
  const displaySpec = useMemo(() => bundle ? openEnaTrajectoryDisplaySpecV3(bundle, {
    projection: display.projection,
    displayedGroups: display.displayedGroups,
    traces: display.traces,
    axisFlips: display.axisFlips,
    camera: display.projection === "3d" ? cameraForDisplay(display.cameraPreset) : null,
  }) : null, [bundle, display]);
  const plotlySpec = useMemo(() => bundle && displaySpec
    ? compileTrajectoryPlotlySpec(bundle, displaySpec)
    : null, [bundle, displaySpec]);

  function commitScientific(next: OpenEnaLongitudinalSettingsV3, clearIdentity = false) {
    abortRef.current?.abort();
    scientificRevisionRef.current = advanceOpenEnaLongitudinalScientificRevisionV3(scientificRevisionRef.current);
    setSettings(clearIdentity ? clearOpenEnaLongitudinalIdentityConfirmationV3(next) : next);
    if (bundle) setScientificDirty(true);
    setPendingRun(null);
    setRouteDecision(null);
    setRemoteFailure(null);
    setStatus("ready");
    setError(null);
    setCacheHit(false);
  }

  function updateInferenceGroups(next: OpenEnaLongitudinalSettingsV3, role: 0 | 1, canonical: string) {
    const independent = next.inference.independentPeriod;
    const comparison = next.inference.pathComparison;
    if (independent) {
      const groups: [string, string] = [...independent.groups];
      groups[role] = canonical;
      if (groups[0] !== groups[1]) independent.groups = groups;
    }
    if (comparison) {
      const groups: [string, string] = [...comparison.groups];
      groups[role] = canonical;
      if (groups[0] !== groups[1]) comparison.groups = groups;
    }
  }

  function syncRepeatedPeriodOrder(next: OpenEnaLongitudinalSettingsV3) {
    const repeated = next.inference.repeatedPeriods;
    if (!repeated) return;
    const selected = new Set(repeated.periodCanonicals);
    repeated.periodCanonicals = next.orderedPeriods
      .map((period) => period.sourceTimeCanonical)
      .filter((canonical) => selected.has(canonical));
  }

  const runPrepared = async (
    pending: PendingLongitudinalRunV3,
    options: { allowRemote?: boolean; forceLocal?: boolean } = {},
  ) => {
    const { prepared, identity } = pending;
    const runIsCurrent = () => isOpenEnaLongitudinalScientificRunCurrentV3(
      identity,
      scientificRevisionRef.current,
      prepared.binding,
    );
    if (!runIsCurrent()) return;
    const decision = estimateOpenEnaLongitudinalExecutionV3(prepared.request);
    if (!options.forceLocal && decision.target === "persistent-compute-service" && remoteRetryAtRef.current > Date.now()) {
      setPendingRun(pending);
      setRouteDecision(decision);
      setRemoteFailure(new OpenEnaLongitudinalExecutionClientErrorV3(
        "REMOTE_RATE_LIMITED", "Remote compute is waiting for its retry deadline.", decision,
        { canContinueLocally: true, canDisableInference: true, canRetryRemote: false,
          retryAtMilliseconds: remoteRetryAtRef.current },
      ));
      setCooldownNow(Date.now());
      setStatus("remote-recovery");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const ownsExecution = () => abortRef.current === controller && runIsCurrent();
    setPendingRun(pending);
    setRouteDecision(estimateOpenEnaLongitudinalExecutionV3(prepared.request));
    setStatus("running");
    setProgress({ progress: 0, stage: "validate-binding" });
    setError(null);
    setRemoteFailure(null);
    try {
      const receipt = await executeOpenEnaLongitudinalPreparedV3(prepared.request, {
        signal: controller.signal,
        onProgress: (nextProgress) => { if (ownsExecution()) setProgress(nextProgress); },
        allowRemote: options.allowRemote,
        forceLocal: options.forceLocal,
        remoteEndpoint: "/api/open-ena/longitudinal",
      });
      if (!runIsCurrent()) return;
      if (!ownsExecution()) return;
      setBundle(receipt.bundle);
      setBinding(prepared.binding);
      setCacheHit(receipt.cacheHit);
      setScientificDirty(false);
      setPendingRun(null);
      setRouteDecision(null);
      setStatus("complete");
      const knownGroups = receipt.bundle.paths.map((path) => path.group.canonical);
      setDisplay((current) => ({
        ...current,
        displayedGroups: current.displayedGroups.filter((group) => knownGroups.includes(group)).length
          ? current.displayedGroups.filter((group) => knownGroups.includes(group))
          : knownGroups,
      }));
    } catch (caught) {
      if (!runIsCurrent()) return;
      if (!ownsExecution()) return;
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setPendingRun(null);
        setRouteDecision(null);
        setStatus("ready");
        return;
      }
      if (caught instanceof OpenEnaLongitudinalExecutionClientErrorV3 && caught.code === "REMOTE_CONFIRMATION_REQUIRED") {
        setRouteDecision(caught.decision);
        setStatus("remote-confirmation");
        return;
      }
      if (caught instanceof OpenEnaLongitudinalExecutionClientErrorV3) {
        if (caught.code === "REMOTE_RATE_LIMITED" || caught.retryAtMilliseconds !== null) {
          // A missing or malformed 429 Retry-After uses a conservative 60 second pause.
          remoteRetryAtRef.current = Math.max(remoteRetryAtRef.current, caught.retryAtMilliseconds ?? Date.now() + 60_000);
          setRemoteRetryAt(remoteRetryAtRef.current);
          setCooldownNow(Date.now());
        }
        setRouteDecision(caught.decision);
        setRemoteFailure(caught);
        setError(caught.message);
        setStatus("remote-recovery");
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  function cancelRun() {
    // Invalidate both pending preparation and already-dispatched execution.
    scientificRevisionRef.current = advanceOpenEnaLongitudinalScientificRevisionV3(scientificRevisionRef.current);
    abortRef.current?.abort();
    abortRef.current = null;
    setPendingRun(null);
    setRouteDecision(null);
    setRemoteFailure(null);
    setError(null);
    setCacheHit(false);
    setStatus("ready");
  }

  const run = async (override = settings) => {
    if (!override) return;
    const scientificRevision = scientificRevisionRef.current;
    const settingsSnapshot = snapshotOpenEnaLongitudinalSettingsV3(override);
    setStatus("preparing");
    setError(null);
    try {
      const prepared = await buildOpenEnaLongitudinalExecutionRequestV3({
        result,
        config,
        dataset,
        datasetHash,
        settings: settingsSnapshot,
        runId: `open-ena-longitudinal-${datasetHash.slice(0, 12)}-${result.analyzedAt}`,
        executionTarget: "browser-worker",
      });
      const preparedSnapshot = snapshotOpenEnaPreparedLongitudinalExecutionV3(prepared);
      const pending: PendingLongitudinalRunV3 = {
        prepared: preparedSnapshot,
        identity: bindOpenEnaLongitudinalScientificRunV3(scientificRevision, preparedSnapshot.binding),
        settingsSnapshot,
      };
      if (!isOpenEnaLongitudinalScientificRunCurrentV3(
        pending.identity,
        scientificRevisionRef.current,
        pending.prepared.binding,
      )) return;
      await runPrepared(pending);
    } catch (caught) {
      if (scientificRevisionRef.current !== scientificRevision) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    }
  };

  const runWithoutInference = async () => {
    if (!pendingRun || !isOpenEnaLongitudinalScientificRunCurrentV3(
      pendingRun.identity,
      scientificRevisionRef.current,
      pendingRun.prepared.binding,
    )) return;
    const sourcePending = pendingRun;
    const nextSettings = withoutOpenEnaLongitudinalInferenceSettingsV3(sourcePending.settingsSnapshot);
    commitScientific(nextSettings);
    const scientificRevision = scientificRevisionRef.current;
    setStatus("preparing");
    try {
      const prepared = await withoutOpenEnaLongitudinalInferencePreparedV3(sourcePending.prepared);
      const nextPending: PendingLongitudinalRunV3 = {
        prepared,
        identity: bindOpenEnaLongitudinalScientificRunV3(scientificRevision, prepared.binding),
        settingsSnapshot: snapshotOpenEnaLongitudinalSettingsV3(nextSettings),
      };
      if (!isOpenEnaLongitudinalScientificRunCurrentV3(
        nextPending.identity,
        scientificRevisionRef.current,
        nextPending.prepared.binding,
      )) return;
      await runPrepared(nextPending);
    } catch (caught) {
      if (scientificRevisionRef.current !== scientificRevision) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    }
  };

  const download = async (kind: "bundle" | "participant" | "path" | "metadata" | "inference" | "analysis" | "plotly") => {
    if (!bundle || !plotlySpec || !displaySpec || !settings || !profile) return;
    const prefix = `open-ena-${bundle.identity.resultHash.slice(0, 12)}-trajectory`;
    if (kind === "bundle" || kind === "participant") {
      if (kind === "participant" && !window.confirm(copy.privacyConfirm)) return;
      const exported = await createExportBundle(bundle, { displaySpec, includeParticipantLevel: kind === "participant" });
      downloadBlob(exported.fileName, exported.bytes, "application/zip");
      return;
    }
    const packageFiles = {
      analysis: ["analysis.json", "analysis.json"],
      plotly: ["plotly-spec.json", "plotly-spec.json"],
      path: ["trajectory-path.csv", "path.csv"],
      metadata: ["trajectory-metadata.csv", "metadata.csv"],
      inference: ["trajectory-inference.csv", "inference.csv"],
    } as const;
    const [packagePath, downloadSuffix] = packageFiles[kind];
    const exported = await createExportBundle(bundle, { displaySpec });
    const file = exported.files.find((candidate) => candidate.path === packagePath);
    if (!file) throw new Error(`The 3DENA export bundle omitted ${packagePath}.`);
    downloadBlob(`${prefix}-${downloadSuffix}`, file.bytes, file.mediaType);
  };

  if (!settings || !profile) {
    return <section className="ena-longitudinal-v3-workbench" data-testid="open-ena-longitudinal-v3-workbench"><p role="status">{error ?? copy.initializing}</p></section>;
  }

  const accumulatedLocked = result.set.modelType === "AccumulatedTrajectory";
  const dimensionOptions = result.set.rotation.rotationColumns;
  const timeOptions = config.conversationColumns.filter((column) => !config.unitColumns.includes(column) && column !== config.groupColumn);
  const compareGroups = settings.inference.independentPeriod?.groups ?? settings.inference.pathComparison?.groups ?? null;
  const observedPeriods = inventory.periods.filter((period) => period.observed);
  const headerDimensions = openEnaLongitudinalHeaderDimensionsV3(bundle, settings);

  return (
    <section className="ena-longitudinal-v3-workbench" data-testid="open-ena-longitudinal-v3-workbench" aria-label={copy.title} aria-busy={status === "preparing" || status === "running"}>
      <div className="ena-longitudinal-v3-layout">
        <aside className="ena-longitudinal-v3-controls">
          <OpenEnaLongitudinalV3ControlsSlot
            analysisControlsMode={analysisControlsMode}
            analysisControls={analysisControls}
            trajectoryControls={(
              <>
          <header><p>{copy.kicker}</p><h2>{copy.title}</h2><span>{copy.subtitle}</span></header>

          <section data-trajectory-step="1"><h3><b>1</b>{copy.time}</h3><label><span>{copy.time}</span><select value={settings.timeColumn} onChange={(event) => commitScientific(changeOpenEnaLongitudinalTimeColumnV3(settings, dataset, config, event.target.value), true)}>{timeOptions.map((column) => <option key={column}>{column}</option>)}</select></label></section>

          <section data-trajectory-step="2"><h3><b>2</b>{copy.entity}</h3><fieldset><legend>{copy.entity}</legend>{config.unitColumns.filter((column) => column !== config.groupColumn).map((column) => <label key={column} className="ena-longitudinal-v3-check"><input type="checkbox" checked={settings.participantColumns.includes(column)} onChange={(event) => {
            const next = cloneOpenEnaLongitudinalSettingsV3(settings);
            next.participantColumns = event.target.checked ? [...next.participantColumns, column] : next.participantColumns.filter((item) => item !== column);
            commitScientific(next, true);
          }} /><span>{column}</span></label>)}</fieldset><dl className="ena-longitudinal-v3-mini-audit"><div><dt>{copy.pathRows}</dt><dd>{profile.sourceRows}</dd></div><div><dt>{copy.participants}</dt><dd>{profile.participants}</dd></div><div><dt>{copy.duplicateRows}</dt><dd>{profile.duplicateRows}</dd></div><div><dt>{copy.duplicatedPeriods}</dt><dd>{profile.duplicatedParticipantPeriods}</dd></div></dl></section>

          <section data-trajectory-step="3"><h3><b>3</b>{copy.identityHeading}</h3><label className="ena-longitudinal-v3-confirm"><input type="checkbox" checked={settings.identityConfirmed} onChange={(event) => void (async () => {
            const next = event.target.checked
              ? await confirmOpenEnaLongitudinalIdentityV3(settings, { result, config, datasetHash })
              : clearOpenEnaLongitudinalIdentityConfirmationV3(settings);
            commitScientific(next);
          })()} /><span>{copy.identity}</span></label><p>{copy.identityHint}</p></section>

          <section data-trajectory-step="4">
            <h3><b>4</b>{copy.group}</h3>
            <p>{config.groupColumn ?? copy.overall}</p>
            <fieldset>
              <legend>{copy.displayed}</legend>
              {inventory.groups.map((group) => <label key={group.canonical} className="ena-longitudinal-v3-check"><input type="checkbox" checked={display.displayedGroups.includes(group.canonical)} onChange={(event) => setDisplay((current) => ({ ...current, displayedGroups: event.target.checked ? [...current.displayedGroups, group.canonical] : current.displayedGroups.filter((item) => item !== group.canonical) }))} /><span>{group.display}</span></label>)}
            </fieldset>
            {compareGroups ? <div className="ena-longitudinal-v3-two"><label><span>A</span><select value={compareGroups[0]} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); updateInferenceGroups(next, 0, event.target.value); commitScientific(next); }}>{inventory.groups.map((group) => <option key={group.canonical} value={group.canonical}>{group.display}</option>)}</select></label><label><span>B</span><select value={compareGroups[1]} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); updateInferenceGroups(next, 1, event.target.value); commitScientific(next); }}>{inventory.groups.map((group) => <option key={group.canonical} value={group.canonical}>{group.display}</option>)}</select></label></div> : null}
            <fieldset>
              <legend>{copy.inferenceSettings}</legend>
              {settings.inference.independentPeriod ? <label><span>{copy.independentAt}</span><select value={settings.inference.independentPeriod.periodCanonical} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); if (next.inference.independentPeriod) next.inference.independentPeriod.periodCanonical = event.target.value; commitScientific(next); }}>{observedPeriods.map((period) => <option key={period.canonical} value={period.canonical}>{period.display}</option>)}</select></label> : null}
              {settings.inference.pairedPeriods ? <>
                <label><span>{copy.repeatedGroup}</span><select value={settings.inference.pairedPeriods.group ?? ""} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); if (next.inference.pairedPeriods) next.inference.pairedPeriods.group = event.target.value || null; if (next.inference.repeatedPeriods) next.inference.repeatedPeriods.group = event.target.value || null; commitScientific(next); }}><option value="">{copy.overall}</option>{inventory.groups.map((group) => <option key={group.canonical} value={group.canonical}>{group.display}</option>)}</select></label>
                <div className="ena-longitudinal-v3-two"><label><span>{copy.pairedChange} A</span><select value={settings.inference.pairedPeriods.earlierPeriodCanonical} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); if (next.inference.pairedPeriods) next.inference.pairedPeriods.earlierPeriodCanonical = event.target.value; commitScientific(next); }}>{observedPeriods.map((period) => <option key={period.canonical} value={period.canonical} disabled={period.canonical === settings.inference.pairedPeriods?.laterPeriodCanonical}>{period.display}</option>)}</select></label><label><span>{copy.pairedChange} B</span><select value={settings.inference.pairedPeriods.laterPeriodCanonical} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); if (next.inference.pairedPeriods) next.inference.pairedPeriods.laterPeriodCanonical = event.target.value; commitScientific(next); }}>{observedPeriods.map((period) => <option key={period.canonical} value={period.canonical} disabled={period.canonical === settings.inference.pairedPeriods?.earlierPeriodCanonical}>{period.display}</option>)}</select></label></div>
              </> : null}
              {settings.inference.repeatedPeriods ? <fieldset><legend>{copy.repeatedSelection}</legend>{observedPeriods.map((period) => { const selected = settings.inference.repeatedPeriods!.periodCanonicals.includes(period.canonical); return <label key={period.canonical} className="ena-longitudinal-v3-check"><input type="checkbox" checked={selected} disabled={selected && settings.inference.repeatedPeriods!.periodCanonicals.length <= 3} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); const repeated = next.inference.repeatedPeriods; if (!repeated) return; const chosen = new Set(repeated.periodCanonicals); if (event.target.checked) chosen.add(period.canonical); else chosen.delete(period.canonical); repeated.periodCanonicals = observedPeriods.map((item) => item.canonical).filter((canonical) => chosen.has(canonical)); commitScientific(next); }} /><span>{period.display}</span></label>; })}</fieldset> : null}
              {settings.inference.pathComparison ? <label><span>{copy.pathDesign}</span><select value={settings.inference.pathComparison.design} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); if (next.inference.pathComparison) next.inference.pathComparison.design = event.target.value as "independent" | "paired"; commitScientific(next); }}><option value="independent">{copy.independentPermutation}</option><option value="paired">{copy.pairedPermutation}</option></select></label> : null}
            </fieldset>
          </section>

          <section data-trajectory-step="5"><h3><b>5</b>{copy.order}</h3>{accumulatedLocked ? <p>{copy.accumulatedOrderLocked}</p> : null}<ol className="ena-longitudinal-v3-periods">{settings.orderedPeriods.map((period, index) => <li key={period.sourceTimeCanonical}><span>{period.displayLabel}{inventory.periods.find((item) => item.canonical === period.sourceTimeCanonical)?.observed === false ? ` · ${copy.periodGap}` : ""}</span><span><button type="button" aria-label={`${copy.earlier}: ${period.displayLabel}`} disabled={accumulatedLocked || index === 0} onClick={() => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); [next.orderedPeriods[index - 1], next.orderedPeriods[index]] = [next.orderedPeriods[index]!, next.orderedPeriods[index - 1]!]; syncRepeatedPeriodOrder(next); commitScientific(next); }}>↑</button><button type="button" aria-label={`${copy.later}: ${period.displayLabel}`} disabled={accumulatedLocked || index === settings.orderedPeriods.length - 1} onClick={() => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); [next.orderedPeriods[index], next.orderedPeriods[index + 1]] = [next.orderedPeriods[index + 1]!, next.orderedPeriods[index]!]; syncRepeatedPeriodOrder(next); commitScientific(next); }}>↓</button></span></li>)}</ol><label><span>{copy.expected}</span><input value={expectedPeriodLabel} onChange={(event) => setExpectedPeriodLabel(event.target.value)} /></label><button type="button" className="ena-longitudinal-v3-secondary" disabled={!expectedPeriodLabel.trim()} onClick={() => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); const reference = next.orderedPeriods.find((period) => !period.sourceTimeCanonical.startsWith("expected:")); const period = createExpectedOpenEnaLongitudinalPeriodV3(expectedPeriodLabel, settings.timeColumn, next.orderedPeriods.length, reference); next.orderedPeriods.push(period); setExpectedPeriodLabel(""); commitScientific(next); }}>{copy.addExpected}</button></section>

          <section data-trajectory-step="6"><h3><b>6</b>{copy.cohort}</h3><fieldset><legend>{copy.cohort}</legend><label className="ena-longitudinal-v3-check"><input type="radio" name="v3-cohort" checked={settings.cohortPolicy === "available"} onChange={() => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); next.cohortPolicy = "available"; commitScientific(next); }} /><span>{copy.available}</span></label><label className="ena-longitudinal-v3-check"><input type="radio" name="v3-cohort" checked={settings.cohortPolicy === "complete"} onChange={() => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); next.cohortPolicy = "complete"; commitScientific(next); }} /><span>{copy.complete}</span></label></fieldset><p>{copy.missing}</p><label><span>{copy.estimandLabel}</span><select value={settings.estimand.kind} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); next.estimand = event.target.value === "weighted-participant" ? { kind: "weighted-participant", metadataField: profile.positiveStableNumericMetadata[0] ?? "" } : { kind: "equal-participant" }; commitScientific(next); }}><option value="equal-participant">{copy.equal}</option><option value="weighted-participant" disabled={profile.positiveStableNumericMetadata.length === 0}>{copy.weighted}</option></select></label>{settings.estimand.kind === "weighted-participant" ? <label><span>{copy.weightField}</span><select value={settings.estimand.metadataField} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); if (next.estimand.kind === "weighted-participant") next.estimand.metadataField = event.target.value; commitScientific(next); }}>{profile.positiveStableNumericMetadata.map((field) => <option key={field}>{field}</option>)}</select></label> : null}</section>

          <section data-trajectory-step="7"><h3><b>7</b>{copy.dimensions}</h3><div className="ena-longitudinal-v3-three">{([0, 1, 2] as const).map((index) => <label key={index}><span>{["X", "Y", "Z"][index]}</span><select value={settings.selectedDimensions[index]} onChange={(event) => { const next = cloneOpenEnaLongitudinalSettingsV3(settings); next.selectedDimensions[index] = event.target.value; commitScientific(next); }}>{dimensionOptions.map((dimension) => <option key={dimension} disabled={settings.selectedDimensions.some((selected, selectedIndex) => selectedIndex !== index && selected === dimension)}>{dimension}</option>)}</select></label>)}</div><p>{copy.fullDistance}</p></section>

          <section data-trajectory-step="8"><h3><b>8</b>{copy.projection}</h3><label><span>{copy.projection}</span><select value={display.projection} onChange={(event) => setDisplay((current) => ({ ...current, projection: event.target.value as DisplayStateV3["projection"] }))}>{["3d", "xy", "xz", "yz", "yx", "zx", "zy"].map((projection) => <option key={projection} value={projection}>{projection.toUpperCase()}</option>)}</select></label><fieldset><legend>{copy.axisFlipsLegend}</legend>{([0, 1, 2] as const).map((axis) => <label key={axis} className="ena-longitudinal-v3-check"><input type="checkbox" checked={display.axisFlips[axis]} onChange={(event) => setDisplay((current) => { const flips: [boolean, boolean, boolean] = [...current.axisFlips]; flips[axis] = event.target.checked; return { ...current, axisFlips: flips }; })} /><span>{copy.flipAxis} {["X", "Y", "Z"][axis]}</span></label>)}</fieldset></section>

          <section data-trajectory-step="9"><h3><b>9</b>{copy.paths}</h3><p>{copy.codeNodesHint}</p>{([['participants', copy.participantPoints], ['individualPaths', copy.individualPaths], ['paths', copy.centroids], ['directionArrows', copy.arrows], ['labels', copy.labels]] as const).map(([field, label]) => <label key={field} className="ena-longitudinal-v3-check"><input type="checkbox" checked={field === "paths" ? display.traces.paths && display.traces.centroids : display.traces[field]} onChange={(event) => setDisplay((current) => ({ ...current, traces: field === "paths" ? { ...current.traces, paths: event.target.checked, centroids: event.target.checked } : { ...current.traces, [field]: event.target.checked } }))} /><span>{label}</span></label>)}</section>

          <section data-trajectory-step="10"><h3><b>10</b>{copy.status}</h3>{modelResultStale ? <p className="ena-longitudinal-v3-banner" role="status">{copy.modelStale}</p> : null}{stale ? <p className="ena-longitudinal-v3-banner" role="status">{copy.stale}</p> : null}{status === "remote-confirmation" && routeDecision ? <div className="ena-longitudinal-v3-remote" role="alert"><strong>{copy.remoteTitle}</strong><p>{copy.remoteText}</p><dl><div><dt>{copy.predictedTime}</dt><dd>{routeDecision.predictedMilliseconds} ms</dd></div><div><dt>{copy.predictedMemory}</dt><dd>{(routeDecision.predictedMemoryBytes / 1024 / 1024).toFixed(1)} MB</dd></div><div><dt>{copy.hardDeadline}</dt><dd>60 s</dd></div></dl><button type="button" disabled={remoteWaitSeconds > 0} onClick={() => pendingRun && void runPrepared(pendingRun, { allowRemote: true })}>{copy.confirmRemote}</button><button type="button" onClick={() => pendingRun && void runPrepared(pendingRun, { forceLocal: true })}>{copy.continueLocal}</button><button type="button" onClick={() => void runWithoutInference()}>{copy.disableHeavy}</button></div> : null}{status === "remote-recovery" && routeDecision && remoteFailure ? <div className="ena-longitudinal-v3-remote" role="alert"><strong>{copy.remoteRecoveryTitle}</strong><p>{copy.remoteRecoveryText}</p><p>{remoteRecoveryReason(copy, remoteFailure, remoteWaitSeconds)}</p>{remoteFailure.code === "REMOTE_AUTH_REQUIRED" ? <><a href={`/${locale}/open-ena`} target="_blank" rel="noopener noreferrer">{copy.signInAgain}</a><button type="button" disabled={remoteWaitSeconds > 0} onClick={() => pendingRun && void runPrepared(pendingRun, { allowRemote: true })}>{copy.resumeAfterSignIn}</button></> : null}{remoteFailure.canRetryRemote || remoteFailure.code === "REMOTE_RATE_LIMITED" ? <button type="button" disabled={remoteWaitSeconds > 0} onClick={() => pendingRun && void runPrepared(pendingRun, { allowRemote: true })}>{copy.retryRemote}</button> : null}{remoteFailure.canContinueLocally ? <button type="button" onClick={() => pendingRun && void runPrepared(pendingRun, { forceLocal: true })}>{copy.continueLocal}</button> : null}{remoteFailure.canDisableInference ? <button type="button" onClick={() => void runWithoutInference()}>{copy.disableHeavy}</button> : null}</div> : null}{remoteWaitSeconds > 0 && remoteFailure?.code !== "REMOTE_RATE_LIMITED" ? <p className="ena-longitudinal-v3-banner" role="status">{copy.remoteRateLimitedWait(remoteWaitSeconds)}</p> : null}<OpenEnaLongitudinalWorkbenchStatusLine copy={copy} status={status} progress={progress.progress} cacheHit={cacheHit} />{error && status !== "remote-recovery" ? <p className="ena-longitudinal-v3-error" role="alert">{error}</p> : null}<div className="ena-longitudinal-v3-run-actions"><button type="button" className="ena-longitudinal-v3-primary" onClick={() => void run()} disabled={status === "running" || status === "preparing" || settings.participantColumns.length === 0 || (status === "remote-recovery" && !!remoteFailure && !remoteFailure.canRetryRemote && remoteFailure.code !== "REMOTE_RATE_LIMITED")}>{bundle ? copy.recompute : copy.run}</button>{status === "running" || status === "preparing" ? <button type="button" onClick={cancelRun}>{copy.cancel}</button> : null}{status === "error" ? <button type="button" onClick={() => void run()}>{copy.retry}</button> : null}</div></section>

          <section data-trajectory-step="11"><h3><b>11</b>{copy.downloads}</h3><div className="ena-longitudinal-v3-downloads">{([['bundle', copy.bundleZip], ['path', copy.pathCsv], ['metadata', copy.metadataCsv], ['inference', copy.inferenceCsv], ['analysis', copy.analysisJson], ['plotly', copy.plotlyJson], ['participant', copy.participantZip]] as const).map(([kind, label]) => <button type="button" key={kind} disabled={!bundle || stale} onClick={() => void download(kind)}>{label}</button>)}</div></section>
              </>
            )}
          />
        </aside>

        <main className="ena-longitudinal-v3-output">
          <header className="ena-longitudinal-v3-output-header"><div><p>{copy.kicker}</p><h2>{copy.plotTitle}</h2><span>{headerDimensions.join(" × ")} · {bundle?.identity.resultHash.slice(0, 12) ?? copy.notRun}</span></div><div><label><span>{copy.camera}</span><select value={display.cameraPreset} disabled={display.projection !== "3d"} onChange={(event) => setDisplay((current) => ({ ...current, cameraPreset: event.target.value as CameraPreset }))}>{(["isometric", "xy", "xz", "yz", "yx", "zx", "zy"] as CameraPreset[]).map((preset) => <option key={preset} value={preset}>{preset.toUpperCase()}</option>)}</select></label></div></header>
          {!bundle || !plotlySpec ? <div className="ena-longitudinal-v3-empty"><strong>{status === "initializing" ? copy.initializing : copy.noResult}</strong><p>jENA {result.set.modelType} · {result.set.rotation.rotationColumns.length} {copy.emptyPlotSummary} · {dataset.rows.length} {copy.sourceRowsWord}</p></div> : <><div data-stale={stale ? "true" : "false"} className="ena-longitudinal-v3-presenter"><TrajectoryPlotlyPresenterV3 spec={plotlySpec} cameraPreset={display.cameraPreset} labels={copy} />{stale ? <p className="ena-longitudinal-v3-stale-overlay">{copy.staleOverlay}</p> : null}</div><AuditCards profile={profile} settings={settings} bundle={bundle} copy={copy} /><ResultsTablesV3 bundle={bundle} copy={copy} /></>}
        </main>
      </div>
    </section>
  );
}
