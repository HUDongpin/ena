import type { Locale } from "./i18n";

export interface MissionNavigationCopy {
  onThisPage: string;
  model: string;
  principles: string;
  coCreate: string;
  resources: string;
}

export const missionNavigationCopy: Record<Locale, MissionNavigationCopy> = {
  en: { onThisPage: "On this page", model: "Research design", principles: "Interpretation", coCreate: "Co-creation", resources: "Resources" },
  "zh-hant": { onThisPage: "本頁目錄", model: "研究設計", principles: "解釋原則", coCreate: "共同創作", resources: "資源" },
  "zh-hans": { onThisPage: "本页目录", model: "研究设计", principles: "解释原则", coCreate: "共同创作", resources: "资源" },
  es: { onThisPage: "En esta página", model: "Diseño de investigación", principles: "Interpretación", coCreate: "Cocreación", resources: "Recursos" },
  fr: { onThisPage: "Sur cette page", model: "Conception de recherche", principles: "Interprétation", coCreate: "Cocréation", resources: "Ressources" },
  pt: { onThisPage: "Nesta página", model: "Desenho de pesquisa", principles: "Interpretação", coCreate: "Cocriação", resources: "Recursos" },
  de: { onThisPage: "Auf dieser Seite", model: "Forschungsdesign", principles: "Interpretation", coCreate: "Gemeinsame Entwicklung", resources: "Ressourcen" },
  ar: { onThisPage: "في هذه الصفحة", model: "تصميم البحث", principles: "التفسير", coCreate: "الإبداع المشترك", resources: "الموارد" },
  ko: { onThisPage: "이 페이지의 내용", model: "연구 설계", principles: "해석", coCreate: "공동 창작", resources: "자료" },
  ja: { onThisPage: "このページの内容", model: "研究設計", principles: "解釈", coCreate: "共創", resources: "リソース" },
  hi: { onThisPage: "इस पृष्ठ पर", model: "शोध की रूपरेखा", principles: "व्याख्या", coCreate: "सह-निर्माण", resources: "संसाधन" },
  ru: { onThisPage: "На этой странице", model: "Дизайн исследования", principles: "Интерпретация", coCreate: "Совместная разработка", resources: "Ресурсы" },
  id: { onThisPage: "Di halaman ini", model: "Desain penelitian", principles: "Interpretasi", coCreate: "Kreasi bersama", resources: "Sumber daya" },
  bn: { onThisPage: "এই পৃষ্ঠায়", model: "গবেষণার নকশা", principles: "ব্যাখ্যা", coCreate: "সহ-সৃষ্টি", resources: "উপকরণ" },
};
