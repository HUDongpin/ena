import type { OpenEnaAuthEnvironment } from "../open-ena-auth";
import { normalizeOpenEnaEmail } from "./open-ena-user-credentials";
import { OpenEnaCloudError } from "./open-ena-cloud-db";
import type { OpenEnaAccountMailAction } from "./open-ena-users";

export type OpenEnaAccountEmail = OpenEnaAccountMailAction & { link: string; locale: string };

export function openEnaAccountMailReady(environment: OpenEnaAuthEnvironment = process.env) {
  const key = environment.RESEND_API_KEY, sender = environment.OPEN_ENA_ACCOUNT_MAIL_FROM ?? "";
  const address = sender.match(/^[^<>\r\n]{1,80}<([^<>]+)>$/u)?.[1] ?? sender;
  return Boolean(key && /^re_[A-Za-z0-9_-]{20,}$/u.test(key) && normalizeOpenEnaEmail(address)
    && !/[\r\n]/u.test(sender) && sender.length <= 340);
}

export async function sendOpenEnaAccountMail(
  email: OpenEnaAccountEmail,
  environment: OpenEnaAuthEnvironment = process.env,
  fetcher: typeof fetch = fetch,
) {
  if (!openEnaAccountMailReady(environment) || !normalizeOpenEnaEmail(email.email)) throw new OpenEnaCloudError("unavailable");
  const zh = email.locale === "zh-hans" || email.locale === "zh-hant";
  const subject = email.kind === "verify" ? (zh ? "Open ENA：验证邮箱并创建账号" : "Open ENA: verify your email and create your account")
    : email.kind === "reset" ? (zh ? "Open ENA：重设密码" : "Open ENA: reset your password")
      : (zh ? "Open ENA：账号请求" : "Open ENA: account request");
  const instructions = email.kind === "verify"
    ? (zh ? "打开以下链接验证邮箱，然后设置密码。链接在24小时后失效，且只能使用一次。" : "Open this link to verify your email, then choose your password. It expires in 24 hours and can only be used once.")
    : email.kind === "reset"
      ? (zh ? "打开以下链接重设密码。链接在30分钟后失效，且只能使用一次。重设后，原有登录会话将全部失效。" : "Open this link to reset your password. It expires in 30 minutes and can only be used once. Resetting your password signs out all previous sessions.")
      : email.kind === "existing"
        ? (zh ? "此邮箱已有Open ENA账号。请登录；如忘记密码，可在登录页面申请重设。" : "This email already has an Open ENA account. Sign in, or request a password reset from the sign-in page.")
        : (zh ? "我们收到了密码重设请求。此邮箱尚无可重设的Open ENA账号，可在以下页面注册。" : "We received a password-reset request. This address has no available Open ENA account to reset. You can register from the page below.");
  const text = `${instructions}\n\n${email.link}\n\n${zh ? "若这不是您发起的请求，请忽略此邮件。" : "If you did not request this, you can ignore this message."}\n\nOpen ENA\nena.hk · open-ena.com`;
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(12_000), redirect: "error",
      headers: { Authorization: `Bearer ${environment.RESEND_API_KEY}`, "Content-Type": "application/json", "User-Agent": "OpenENAAccountMail/1.0", "Idempotency-Key": `open-ena-account-${email.actionId}` },
      body: JSON.stringify({ from: environment.OPEN_ENA_ACCOUNT_MAIL_FROM, to: [email.email], subject, text,
        ...(environment.OPEN_ENA_ACCOUNT_MAIL_REPLY_TO && normalizeOpenEnaEmail(environment.OPEN_ENA_ACCOUNT_MAIL_REPLY_TO)
          ? { reply_to: environment.OPEN_ENA_ACCOUNT_MAIL_REPLY_TO } : {}) }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new OpenEnaCloudError("unavailable"); }
    // Acceptance is sufficient for this route; delivery is independently verified with the provider.
    await response.body?.cancel();
  } catch { throw new OpenEnaCloudError("unavailable"); }
}
