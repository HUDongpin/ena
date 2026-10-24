export type OpenEnaCloudLimits = { projects: number; bytes: number; snapshotBytes: number };
export const OPEN_ENA_CLOUD_LIMITS: Readonly<OpenEnaCloudLimits> = Object.freeze({ projects: 50, bytes: 200 * 1024 * 1024, snapshotBytes: 16 * 1024 * 1024 });
export const OPEN_ENA_CLOUD_PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type OpenEnaCloudProjectSummary = {
  id: string; title: string; revision: number; bytes: number; createdAt: string; updatedAt: string; archived: boolean;
};
export type OpenEnaCloudProject = OpenEnaCloudProjectSummary & { snapshot: string };
export type OpenEnaCloudProjectList = { projects: OpenEnaCloudProjectSummary[]; usedBytes: number; projectCount: number; limits: typeof OPEN_ENA_CLOUD_LIMITS };

export function openEnaCloudProjectTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title.length > 0 && title.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(title) ? title : null;
}
