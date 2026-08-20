import type { Locale } from "./i18n";

export const OPEN_ENA_CONTACT_EMAIL = "sandy0692@gmail.com";

export interface OpenEnaAuthCopy {
  eyebrow: string;
  title: string;
  intro: string;
  username: string;
  usernamePlaceholder: string;
  password: string;
  passwordPlaceholder: string;
  signIn: string;
  signOut: string;
  invalidCredentials: string;
  collaborationNotice: string;
  privacyNote: string;
  workspaceLabel: string;
  researchFlow: [string, string, string];
}

const en: OpenEnaAuthCopy = {
  eyebrow: "Restricted research workspace",
  title: "Sign in to Open ENA",
  intro: "Authenticate to access the browser-based epistemic network analysis workspace.",
  username: "Account name",
  usernamePlaceholder: "Enter your account name",
  password: "Password",
  passwordPlaceholder: "Enter your password",
  signIn: "Sign in",
  signOut: "Sign out",
  invalidCredentials: "The account name or password is incorrect. Please try again.",
  collaborationNotice:
    "Registration will be available in the future. For academic collaboration, please contact Professor Sandy TU Yun-Fang (sandy0692@gmail.com).",
  privacyNote: "Your source data remains in this browser workspace unless you intentionally export it.",
  workspaceLabel: "Epistemic Network Analysis Research Workspace",
  researchFlow: ["Data", "Model", "Evidence"],
};

const zhHant: OpenEnaAuthCopy = {
  eyebrow: "受限研究工作區",
  title: "登入 Open ENA",
  intro: "完成身分驗證後，即可使用瀏覽器端認知網絡分析工作區。",
  username: "帳戶名稱",
  usernamePlaceholder: "請輸入帳戶名稱",
  password: "密碼",
  passwordPlaceholder: "請輸入密碼",
  signIn: "登入",
  signOut: "登出",
  invalidCredentials: "帳戶名稱或密碼不正確，請重試。",
  collaborationNotice:
    "未來會開放註冊。學術合作請聯絡Professor Sandy TU Yun-Fang(sandy0692@gmail.com)",
  privacyNote: "除非您主動匯出，來源資料只會保留在此瀏覽器工作區。",
  workspaceLabel: "認知網絡分析研究工作區",
  researchFlow: ["資料", "模型", "證據"],
};

const zhHans: OpenEnaAuthCopy = {
  eyebrow: "受限研究工作区",
  title: "登录 Open ENA",
  intro: "完成身份验证后，即可使用浏览器端认知网络分析工作区。",
  username: "账户名称",
  usernamePlaceholder: "请输入账户名称",
  password: "密码",
  passwordPlaceholder: "请输入密码",
  signIn: "登录",
  signOut: "退出登录",
  invalidCredentials: "账户名称或密码不正确，请重试。",
  collaborationNotice:
    "未来会开放注册。学术合作请联系Professor Sandy TU Yun-Fang(sandy0692@gmail.com)",
  privacyNote: "除非您主动导出，源数据只会保留在此浏览器工作区。",
  workspaceLabel: "认知网络分析研究工作区",
  researchFlow: ["数据", "模型", "证据"],
};

export function getOpenEnaAuthCopy(locale: Locale): OpenEnaAuthCopy {
  if (locale === "zh-hant") return zhHant;
  if (locale === "zh-hans") return zhHans;
  return en;
}
