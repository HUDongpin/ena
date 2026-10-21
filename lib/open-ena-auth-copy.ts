import type { Locale } from "./i18n";

export const OPEN_ENA_CONTACT_EMAIL = "sandy0692@gmail.com";

export type OpenEnaAuthFailure = "throttled" | "unavailable" | "request" | "logout-unavailable";

export function parseOpenEnaAuthFailure(value: unknown): OpenEnaAuthFailure | null {
  return value === "throttled" || value === "unavailable" || value === "request" || value === "logout-unavailable"
    ? value : null;
}

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
  unavailable: string;
  throttled: string;
  retryAfter: string;
  temporaryUnavailable: string;
  invalidRequest: string;
  logoutUnavailable: string;
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
  unavailable:
    "Open ENA is unavailable because secure authentication is not configured for this deployment.",
  throttled: "Too many sign-in attempts from this connection. Please try again later.",
  retryAfter: "Wait about {seconds} seconds before trying again.",
  temporaryUnavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
  invalidRequest: "This sign-in or sign-out request could not be processed. Please try again from this page.",
  logoutUnavailable: "Sign-out could not be completed. Please try signing out again.",
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
  unavailable: "此部署尚未設定安全驗證，因此 Open ENA 目前無法使用。",
  throttled: "此連線的登入嘗試過多，請稍後再試。",
  retryAfter: "請等待約 {seconds} 秒後再試。",
  temporaryUnavailable: "登入服務暫時無法使用，請稍後再試。",
  invalidRequest: "無法處理此登入或登出請求，請從此頁重新嘗試。",
  logoutUnavailable: "未能完成登出，請重新嘗試登出。",
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
  unavailable: "此部署尚未配置安全验证，因此 Open ENA 当前不可用。",
  throttled: "此连接的登录尝试过多，请稍后再试。",
  retryAfter: "请等待约 {seconds} 秒后再试。",
  temporaryUnavailable: "登录服务暂时不可用，请稍后再试。",
  invalidRequest: "无法处理此登录或退出登录请求，请从此页重新尝试。",
  logoutUnavailable: "未能完成退出登录，请重新尝试退出登录。",
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

export function getOpenEnaAuthFailureMessage(locale: Locale, failure: OpenEnaAuthFailure, retryAfterSeconds?: number) {
  const copy = getOpenEnaAuthCopy(locale);
  if (failure === "unavailable") return copy.temporaryUnavailable;
  if (failure === "logout-unavailable") return copy.logoutUnavailable;
  if (failure === "request") return copy.invalidRequest;
  const wait = Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds! >= 1 && retryAfterSeconds! <= 900
    ? ` ${copy.retryAfter.replace("{seconds}", String(retryAfterSeconds))}` : "";
  return `${copy.throttled}${wait}`;
}
