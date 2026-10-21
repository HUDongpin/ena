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
  unavailable: string;
  temporarilyUnavailable: string;
  unattributed: string;
  throttled: string;
  throttledWithoutDelay: string;
  logoutUnavailable: string;
  requestRejected: string;
  requestTooLarge: string;
  requestInvalid: string;
  returnToSignIn: string;
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
  temporarilyUnavailable:
    "Open ENA could not connect to its secure sign-in service. Refresh this page and try again in a moment.",
  unattributed:
    "Open ENA could not confirm this sign-in connection, so sign-in stopped. Refresh this page and try again.",
  throttled: "Too many sign-in attempts. Wait {seconds} seconds, then try again from this page.",
  throttledWithoutDelay:
    "Too many sign-in attempts. Wait a few minutes, then try again from this page.",
  logoutUnavailable: "Sign-out did not finish. Return to the page and try again.",
  requestRejected: "This sign-in request was rejected. Return to the sign-in page and try again.",
  requestTooLarge: "The sign-in request was too large to accept. Return to the sign-in page and try again.",
  requestInvalid: "The sign-in request could not be read. Return to the sign-in page and try again.",
  returnToSignIn: "Return to sign in",
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
  temporarilyUnavailable: "Open ENA 暫時無法連線到安全登入服務。請稍後重新整理此頁再試。",
  unattributed: "Open ENA 無法確認這次登入連線，因此已停止登入。請重新整理此頁再試。",
  throttled: "登入嘗試過多。請等待 {seconds} 秒，然後回到此頁再試。",
  throttledWithoutDelay: "登入嘗試過多。請稍候數分鐘，然後回到此頁再試。",
  logoutUnavailable: "登出未能完成。請返回此頁再試。",
  requestRejected: "這次登入請求已被拒絕。請返回登入頁再試。",
  requestTooLarge: "登入請求過大，無法接受。請返回登入頁再試。",
  requestInvalid: "無法讀取這次登入請求。請返回登入頁再試。",
  returnToSignIn: "返回登入",
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
  temporarilyUnavailable: "Open ENA 暂时无法连接到安全登录服务。请稍后刷新此页再试。",
  unattributed: "Open ENA 无法确认这次登录连接，因此已停止登录。请刷新此页再试。",
  throttled: "登录尝试过多。请等待 {seconds} 秒，然后回到此页再试。",
  throttledWithoutDelay: "登录尝试过多。请稍候数分钟，然后回到此页再试。",
  logoutUnavailable: "退出登录未能完成。请返回此页再试。",
  requestRejected: "这次登录请求已被拒绝。请返回登录页再试。",
  requestTooLarge: "登录请求过大，无法接受。请返回登录页再试。",
  requestInvalid: "无法读取这次登录请求。请返回登录页再试。",
  returnToSignIn: "返回登录",
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

export type OpenEnaLoginNotice =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "unavailable" }
  | { kind: "logout-unavailable" }
  | { kind: "unattributed" }
  | { kind: "throttled"; retryAfterSeconds: number | null };

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Accepts only the fixed recovery markers this application sets. */
export function openEnaLoginNotice(
  auth: string | string[] | undefined,
  retryAfter: string | string[] | undefined,
): OpenEnaLoginNotice {
  const marker = firstQueryValue(auth);
  if (marker === "invalid") return { kind: "invalid" };
  if (marker === "unavailable") return { kind: "unavailable" };
  if (marker === "logout-unavailable") return { kind: "logout-unavailable" };
  if (marker === "unattributed") return { kind: "unattributed" };
  if (marker === "throttled") {
    const raw = firstQueryValue(retryAfter) ?? "";
    const parsed = /^[1-9]\d{0,4}$/u.test(raw) ? Number(raw) : null;
    return {
      kind: "throttled",
      retryAfterSeconds: parsed !== null && parsed <= 86_400 ? parsed : null,
    };
  }
  return { kind: "none" };
}

export function openEnaLoginNoticeText(copy: OpenEnaAuthCopy, notice: OpenEnaLoginNotice) {
  if (notice.kind === "invalid") return copy.invalidCredentials;
  if (notice.kind === "unavailable") return copy.temporarilyUnavailable;
  if (notice.kind === "logout-unavailable") return copy.logoutUnavailable;
  if (notice.kind === "unattributed") return copy.unattributed;
  if (notice.kind === "throttled") {
    return notice.retryAfterSeconds
      ? copy.throttled.replaceAll("{seconds}", String(notice.retryAfterSeconds))
      : copy.throttledWithoutDelay;
  }
  return null;
}
