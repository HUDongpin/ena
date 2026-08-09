export const ACADEMY_TRACKS = [
  "research-design",
  "data-preparation",
  "modeling",
  "interpretation",
] as const;

export const ACADEMY_LEVELS = ["beginner", "intermediate"] as const;

export const ACADEMY_VISUALS = ["frame", "prepare", "model", "interpret"] as const;

export type AcademyTrack = (typeof ACADEMY_TRACKS)[number];
export type AcademyLevel = (typeof ACADEMY_LEVELS)[number];
export type AcademyVisual = (typeof ACADEMY_VISUALS)[number];

export interface AcademySource {
  label: string;
  url: string;
}

export interface AcademyStep {
  title: string;
  text: string;
  checkpoint: string;
}

export interface AcademyLesson {
  id: string;
  slug: string;
  sequence: number;
  title: string;
  track: AcademyTrack;
  level: AcademyLevel;
  durationMinutes: number;
  publishedAt: string;
  tags: string[];
  visual: AcademyVisual;
  visualAlt: string;
  shortSummary: string;
  introduction: string[];
  learningObjectives: string[];
  caseStudy: {
    title: string;
    text: string;
  };
  steps: AcademyStep[];
  coreIdeas: string[];
  analysisChecks: string[];
  methodBoundary: string;
  sources: AcademySource[];
  downloads?: Array<{
    label: string;
    href: string;
    note: string;
  }>;
}

export interface AcademyFilterOptions {
  q?: string;
  track?: string;
  level?: string;
  page?: number;
  pageSize?: number;
}

export interface AcademyFilterResult {
  items: AcademyLesson[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
