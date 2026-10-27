import type { Locale } from "./i18n";
import type { OpenEnaAttributionCopy } from "./open-ena-attribution-types";
import { westernAttributionCopy } from "./open-ena-attribution-western";
import { asianGlobalAttributionCopy } from "./open-ena-attribution-asian-global";

export type { OpenEnaAttributionCopy } from "./open-ena-attribution-types";

export const attributionSources = {
  lab: "https://www.epistemicanalytics.org/",
  university: "https://www.wisc.edu/",
  webena: "https://app.epistemicnetwork.org/",
  qe: "https://www.quantitativeethnography.org/",
  tutorial: "https://doi.org/10.18608/jla.2016.33.3",
  theory: "https://doi.org/10.18608/hla17.015",
  visualization: "https://doi.org/10.1007/978-3-030-93859-8_9",
} as const;

const en: OpenEnaAttributionCopy = {
  aboutTitle: "About Open ENA",
  metaDescription: "Explore Open ENA's QE and ENA foundations, acknowledgements and webENA design origins. A non-commercial platform for education and research, free forever.",
  purposeTitle: "Education and research, free forever",
  purpose: "Open ENA is a non-commercial platform for educational and research purposes and will remain free forever.",
  acknowledgementsTitle: "Acknowledgements and academic origins",
  acknowledgements: "Open ENA builds on the theory and methods of Quantitative Ethnography (QE) and Epistemic Network Analysis (ENA). We gratefully acknowledge the University of Wisconsin–Madison, Professor David Williamson Shaffer, and the researchers, software developers and collaborators of the Epistemic Analytics Lab at the Wisconsin Center for Education Research for their foundational and continuing contributions to QE, ENA and the webENA tool.",
  theoryTitle: "Theoretical foundations: QE and ENA",
  theoryQe: "QE combines contextual, qualitative understanding of human activity with quantitative analysis.",
  theoryEna: "ENA models connections by analyzing the co-occurrence of coded elements in meaningful contexts, supporting both network visualization and statistical comparison.",
  theoryUse: "Grounded in this research, Open ENA brings coded data, model settings and network comparisons into a browser-based research workflow. Researchers must interpret results in relation to their research questions, coding decisions and original qualitative evidence.",
  designTitle: "The webENA origins of our initial interface",
  designOrigin: "The Open ENA team used and referred to the webENA tool when establishing this platform's initial visual appearance and layout. We explicitly acknowledge that this initial interface reference originated with the original ENA research team and its webENA design work in Madison, Wisconsin, USA.",
  designTheory: "ENA network visualization is also informed by research on visual design and interpretation.",
  independence: "Open ENA is an independent platform maintained by the Open ENA team.",
  referencesTitle: "Foundational references",
  researchTeamLink: "Epistemic Analytics Lab: the original research team",
  officialWebenaLink: "Official webENA",
  aboutLink: "About Open ENA",
  fullAcknowledgementsLink: "Full acknowledgements and references",
  shortCredit: "QE/ENA and webENA: with acknowledgement to UW–Madison, David Williamson Shaffer and the Epistemic Analytics Lab.",
  shortPurpose: "Non-commercial · Education and research · Free forever",
};

const zhHant: OpenEnaAttributionCopy = {
  aboutTitle: "關於 Open ENA",
  metaDescription: "了解 Open ENA 的 QE 與 ENA 理論基礎、學術致謝和 webENA 介面來源。本平台為非商業的教育與研究平台，並將永久免費。",
  purposeTitle: "服務教育與研究，永久免費",
  purpose: "Open ENA 是非商業平台，專為教育與研究目的而提供，並將永久免費。",
  acknowledgementsTitle: "學術致謝與研究淵源",
  acknowledgements: "Open ENA 建立在 Quantitative Ethnography（QE）與 Epistemic Network Analysis（ENA）的理論及方法研究之上。我們鄭重致謝美國威斯康辛大學麥迪遜分校（University of Wisconsin–Madison）、David Williamson Shaffer 教授，以及位於 Wisconsin Center for Education Research 的 Epistemic Analytics Lab 的研究人員、軟體開發者與合作者，感謝他們在 QE、ENA 和 webENA 工具的創立與持續發展中作出的貢獻。",
  theoryTitle: "理論基礎：QE 與 ENA",
  theoryQe: "QE 將對人類活動的情境化、質性理解與定量分析結合起來。",
  theoryEna: "ENA 透過分析編碼元素在有意義情境中的共同出現，建立連結網絡，並支援網絡的視覺化和統計比較。",
  theoryUse: "Open ENA 以這些研究為理論與方法基礎，將編碼資料、模型設定和網絡比較組織為瀏覽器中的研究流程；研究者仍須結合研究問題、編碼依據及原始質性資料解釋結果。",
  designTitle: "初始介面的 webENA 來源",
  designOrigin: "Open ENA 團隊在建立本平台的初始介面外觀與版面配置時，使用並參考了 webENA 工具。我們明確承認，這一初始介面參考源自美國威斯康辛州麥迪遜市的原始 ENA 研究團隊及其 webENA 設計工作。",
  designTheory: "ENA 網絡視覺化亦參考了視覺設計與解讀方面的研究。",
  independence: "Open ENA 是由 Open ENA 團隊獨立維護的平台。",
  referencesTitle: "基礎參考文獻",
  researchTeamLink: "Epistemic Analytics Lab：原始研究團隊",
  officialWebenaLink: "官方 webENA",
  aboutLink: "關於 Open ENA",
  fullAcknowledgementsLink: "完整致謝與參考文獻",
  shortCredit: "QE／ENA 與 webENA：鄭重致謝 UW–Madison、David Williamson Shaffer 及 Epistemic Analytics Lab。",
  shortPurpose: "非商業 · 教育與研究用途 · 永久免費",
};

const zhHans: OpenEnaAttributionCopy = {
  aboutTitle: "关于 Open ENA",
  metaDescription: "了解 Open ENA 的 QE 与 ENA 理论基础、学术致谢和 webENA 界面来源。本平台为非商业的教育与研究平台，并将永久免费。",
  purposeTitle: "服务教育与研究，永久免费",
  purpose: "Open ENA 是非商业平台，专为教育与研究目的而提供，并将永久免费。",
  acknowledgementsTitle: "学术致谢与研究渊源",
  acknowledgements: "Open ENA 建立在 Quantitative Ethnography（QE）与 Epistemic Network Analysis（ENA）的理论及方法研究之上。我们郑重致谢美国威斯康星大学麦迪逊分校（University of Wisconsin–Madison）、David Williamson Shaffer 教授，以及位于 Wisconsin Center for Education Research 的 Epistemic Analytics Lab 的研究人员、软件开发者与合作者，感谢他们在 QE、ENA 和 webENA 工具的创立与持续发展中作出的贡献。",
  theoryTitle: "理论基础：QE 与 ENA",
  theoryQe: "QE 将对人类活动的情境化、质性理解与定量分析结合起来。",
  theoryEna: "ENA 通过分析编码元素在有意义情境中的共同出现，建立连接网络，并支持网络的可视化和统计比较。",
  theoryUse: "Open ENA 以这些研究为理论与方法基础，将编码数据、模型设置和网络比较组织为浏览器中的研究流程；研究者仍需结合研究问题、编码依据及原始质性资料解释结果。",
  designTitle: "初始界面的 webENA 来源",
  designOrigin: "Open ENA 团队在建立本平台的初始界面外观与布局时，使用并参考了 webENA 工具。我们明确承认，这一初始界面参考源自美国威斯康星州麦迪逊市的原始 ENA 研究团队及其 webENA 设计工作。",
  designTheory: "ENA 网络可视化也参考了视觉设计与解读方面的研究。",
  independence: "Open ENA 是由 Open ENA 团队独立维护的平台。",
  referencesTitle: "基础参考文献",
  researchTeamLink: "Epistemic Analytics Lab：原始研究团队",
  officialWebenaLink: "官方 webENA",
  aboutLink: "关于 Open ENA",
  fullAcknowledgementsLink: "完整致谢与参考文献",
  shortCredit: "QE／ENA 与 webENA：郑重致谢 UW–Madison、David Williamson Shaffer 及 Epistemic Analytics Lab。",
  shortPurpose: "非商业 · 教育与研究用途 · 永久免费",
};

export const openEnaAttributionCopy = {
  en,
  "zh-hant": zhHant,
  "zh-hans": zhHans,
  ...westernAttributionCopy,
  ...asianGlobalAttributionCopy,
} satisfies Record<Locale, OpenEnaAttributionCopy>;

/** All supported site languages have their own reviewed copy; no English fallback. */
export function getOpenEnaAttributionCopy(locale: Locale): OpenEnaAttributionCopy {
  return openEnaAttributionCopy[locale];
}
