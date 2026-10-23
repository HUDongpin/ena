import type { OpenEnaCloudSnapshot } from "./cloud-workspace";
export type OpenEnaCloudWorkbenchBridge = {
  capture(): Promise<OpenEnaCloudSnapshot>;
  running: boolean;
  defaultTitle: string | null;
};
