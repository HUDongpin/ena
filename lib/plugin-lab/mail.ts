import nodemailer from "nodemailer";
import { connect, type Socket } from "node:net";
import type { PluginLabEnvironment } from "./config";
import { pluginLabProposalIntakeEnabled } from "./config";
import { normalizePluginLabEmail } from "./workflow-security";

export interface PluginLabMailConfiguration {
  host: string; port: number; secure: boolean; requireTLS: true;
  user: string; password: string; from: string; operatorEmail: string; origin: string;
}

export function readPluginLabMailConfiguration(environment: PluginLabEnvironment = process.env): PluginLabMailConfiguration | null {
  const existingResend = !environment.ENA_PLUGIN_LAB_SMTP_HOST && Boolean(environment.RESEND_API_KEY);
  const host = environment.ENA_PLUGIN_LAB_SMTP_HOST?.trim() || (existingResend ? "smtp.resend.com" : undefined);
  const port = Number(environment.ENA_PLUGIN_LAB_SMTP_PORT?.trim() || (existingResend ? "465" : "587"));
  const user = environment.ENA_PLUGIN_LAB_SMTP_USER || (existingResend ? "resend" : undefined);
  const password = environment.ENA_PLUGIN_LAB_SMTP_PASSWORD || (existingResend ? environment.RESEND_API_KEY : undefined);
  const sender = environment.ENA_PLUGIN_LAB_MAIL_FROM?.trim() || (existingResend ? environment.OPEN_ENA_ACCOUNT_MAIL_FROM : undefined);
  const from = typeof sender === "string" && !/[\r\n]/u.test(sender) ? normalizePluginLabEmail(/^[^<>\r\n]+<([^<>]+)>$/u.exec(sender)?.[1] ?? sender) : null;
  const operatorEmail = normalizePluginLabEmail(environment.ENA_PLUGIN_LAB_OPERATOR_EMAIL);
  if (!host || !/^[a-z0-9.-]+$/iu.test(host) || !Number.isInteger(port) || !([465, 587].includes(port) || (port >= 1024 && port <= 65535)) || !user || !password || !from || !operatorEmail) return null;
  try {
    const origin = new URL(environment.OPEN_ENA_PUBLIC_ORIGIN ?? "https://www.ena.hk");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if ((origin.protocol !== "https:" && !(loopback && origin.protocol === "http:")) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return null;
    return { host, port, secure: port === 465, requireTLS: true, user, password, from, operatorEmail, origin: origin.origin };
  } catch { return null; }
}

export function pluginLabWorkflowIntakeEnabled(environment: PluginLabEnvironment = process.env) {
  return pluginLabProposalIntakeEnabled(environment) && readPluginLabMailConfiguration(environment) !== null
    && (environment.ENA_PLUGIN_LAB_WORKER_TOKEN?.length ?? 0) >= 32;
}

type Mail = { from: string; to: string; subject: string; text: string; messageId?: string; headers?: Record<string, string> };
type MailResult = { accepted: unknown[]; rejected: unknown[] };
export type PluginLabMailSender = (mail: Mail) => Promise<MailResult>;

async function deliver(mail: Mail, configuration: PluginLabMailConfiguration, sender?: PluginLabMailSender) {
  const controller = new AbortController();
  let socket: Socket | undefined;
  const transport = sender ? null : nodemailer.createTransport({
    host: configuration.host, port: configuration.port, secure: configuration.secure, requireTLS: true,
    auth: { user: configuration.user, pass: configuration.password }, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    // Retain the TCP connection so the absolute deadline also cancels an active
    // SMTP exchange. Nodemailer's non-pooled close() alone does not do that.
    getSocket(_options, callback) {
      let returned = false;
      const finish = (error: Error | null) => {
        if (returned) return;
        returned = true;
        callback(error, error ? undefined : { connection: socket });
      };
      try {
        socket = connect({ host: configuration.host, port: configuration.port, signal: controller.signal });
        socket.once("connect", () => finish(null));
        socket.once("error", finish);
      } catch (error) { finish(error instanceof Error ? error : new Error("SMTP connection failed.")); }
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { reject(new Error("Plugin Lab email timed out.")); controller.abort(); socket?.destroy(); transport?.close(); }, 15_000);
    });
    const result = await Promise.race([sender ? sender(mail) : transport!.sendMail(mail), deadline]);
    if (!result.accepted.some((address) => String(address).toLowerCase() === mail.to.toLowerCase()) || result.rejected.length) {
      throw new Error("Plugin Lab email recipient was not accepted.");
    }
  } finally { if (timer) clearTimeout(timer); controller.abort(); socket?.destroy(); transport?.close(); }
}

function language(locale: string) { return locale === "zh-hans" ? "zh-hans" : locale === "zh-hant" ? "zh-hant" : "en"; }

export async function sendPluginLabVerificationEmail(
  input: { email: string; code: string; locale: string },
  environment: PluginLabEnvironment = process.env,
  sender?: PluginLabMailSender,
) {
  const configuration = readPluginLabMailConfiguration(environment);
  if (!configuration || !normalizePluginLabEmail(input.email) || !/^\d{6}$/u.test(input.code)) throw new Error("Plugin Lab email is unavailable.");
  const copy = {
    en: ["Open ENA — your verification code", `Your verification code is ${input.code}.\n\nIt expires in 10 minutes and can be used once. If you did not request it, ignore this email.`],
    "zh-hans": ["Open ENA — 您的邮箱验证码", `您的验证码是 ${input.code}。\n\n验证码在 10 分钟内有效，仅可使用一次。如果您没有申请验证码，请忽略此邮件。`],
    "zh-hant": ["Open ENA — 您的電郵驗證碼", `您的驗證碼是 ${input.code}。\n\n驗證碼在 10 分鐘內有效，只可使用一次。如果您沒有申請驗證碼，請忽略此郵件。`],
  }[language(input.locale)];
  await deliver({ from: configuration.from, to: input.email, subject: copy[0], text: copy[1] }, configuration, sender);
}

export function buildPluginLabNotification(input: { proposalId: string; kind: "received" | "status" | "reply"; locale: string; target: "researcher" | "operator" }, origin: string) {
  const lang = language(input.locale);
  const messages = {
    en: { received: "Your proposal has been received.", status: "There is an update to your proposal. Sign in to read the review and any questions.", reply: "A researcher has replied. Open the operator inbox to review the response.", subject: "Open ENA — proposal update", reference: "Proposal reference" },
    "zh-hans": { received: "您的提案已收到。", status: "您的提案有新进展。请验证邮箱后查看审查意见及需要补充的信息。", reply: "研究者已回复，请前往审核收件箱查看。", subject: "Open ENA — 提案更新", reference: "提案编号" },
    "zh-hant": { received: "您的提案已收到。", status: "您的提案有新進展。請驗證電郵後查看審查意見及需要補充的資料。", reply: "研究者已回覆，請前往審核收件箱查看。", subject: "Open ENA — 提案更新", reference: "提案編號" },
  }[lang];
  const path = input.target === "operator" ? "operator" : "status";
  const link = new URL(`/${lang}/plugins/${path}`, origin).toString();
  const intro = input.target === "operator" && input.kind === "received"
    ? ({ en: "A new proposal is awaiting review.", "zh-hans": "收到新提案，请前往审核收件箱查看。", "zh-hant": "收到新提案，請前往審核收件箱查看。" })[lang]
    : messages[input.kind];
  return { subject: messages.subject, text: `${intro}\n\n${messages.reference}: ${input.proposalId}\n${link}` };
}

export async function sendPluginLabNotificationEmail(
  input: { id: string; email: string; proposalId: string; kind: "received" | "status" | "reply"; locale: string; target: "researcher" | "operator" },
  environment: PluginLabEnvironment = process.env,
  sender?: PluginLabMailSender,
) {
  const configuration = readPluginLabMailConfiguration(environment);
  if (!configuration || !normalizePluginLabEmail(input.email)) throw new Error("Plugin Lab email is unavailable.");
  const content = buildPluginLabNotification(input, configuration.origin);
  const domain = configuration.from.split("@")[1];
  await deliver({ from: configuration.from, to: input.email, ...content, messageId: `<plugin-${input.id}@${domain}>`,
    ...(configuration.host === "smtp.resend.com" ? { headers: { "Resend-Idempotency-Key": `plugin-lab-${input.id}` } } : {}),
  }, configuration, sender);
}
