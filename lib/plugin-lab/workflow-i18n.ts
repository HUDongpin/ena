import type { Locale } from "@/lib/i18n";
import type { PluginProposalState } from "./proposal";
import { getPluginProposalFormCopy, getPluginProposalStatusCopy } from "./i18n";

const en = {
  yourIdea: "Your idea", contact: "Contact", extras: "Extra details (optional)",
  formIntro: "Tell us what you would like ENA to do. You do not need to write code.",
  titleExample: "For example: Compare how discussion networks change across lessons.",
  questionExample: "What would you like to investigate with ENA? A short question is enough.",
  changeExample: "Describe what you want to see or do, and how it would help your research.",
  requiredHint: "Fields marked * are required. Everything else is optional.",
  optional: "Optional", requiredError: "Please complete this field.",
  consentRequired: "Please confirm this before submitting.",
  invalidField: "Please check this field and its length. Use plain text without credentials.",
  linksHint: "One public HTTPS link per line; up to 8. Do not include private or access-bearing links.",
  linksError: "Use up to 8 distinct HTTPS links, one per line, without usernames or passwords.",
  visibilityPrivate: "Keep my proposal private",
  visibilityPublic: "Consider a public summary after review",
  visibilityHint: "Your proposal stays private. Publishing a title and summary requires a separate review and your confirmation of the exact text.",
  safetyNotice: "Text only: do not include participant or student data, raw research records, credentials, or restricted materials. Private review is not an NDA. Submission does not guarantee acceptance; funding does not buy scientific verification or authorship.",
  sendCode: "Send verification code", sendingCode: "Sending code…", resendCode: "Send a new code",
  resendIn: "Resend in {seconds}s", codeLabel: "6-digit email code", verifyEmail: "Verify email", verifying: "Verifying…",
  codeSent: "A code was sent to {email}. It expires in 10 minutes. Check your spam folder if needed.",
  codeExpires: "Code expires in {minutes}:{seconds}.", codeExpired: "This code has expired. Send a new code; your draft is still here.",
  verified: "Email verified", checkingSession: "Checking email session…", verifyHint: "Verifying your email does not submit this form.",
  verifyFirst: "Verify this email before submitting. Your draft will stay on this page.",
  sessionExpired: "Your email session has expired. Verify again to continue; your text has been kept.",
  emailInvalid: "Enter a valid email address.", codeInvalid: "Enter the current 6-digit code from your email.",
  rateLimited: "Please wait before trying again.", emailUnavailable: "Email verification is temporarily unavailable. Keep this page open and try again later.",
  unavailable: "The service is temporarily unavailable. Your text is still here; please try again.",
  requestFailed: "The request could not be completed. Please try again.",
  closedTitle: "New proposals are temporarily unavailable", closedText: "Please return later to submit a new idea. You can still check an existing proposal.",
  intakeAvailable: "Email verification is required before submitting. Existing proposals remain available through My proposals.",
  intakeUnavailable: "New submissions are temporarily unavailable. You can still check an existing proposal.",
  backCatalog: "Back to Plugin Lab", myProposals: "View my proposals", downloadReceipt: "Download receipt (.txt)",
  receiptIntro: "Your idea is recorded. Keep the proposal ID below; verify the same email to return to it.",
  receiptNote: "This receipt contains your proposal ID and status link only. It contains no access code or private proposal text.",
  pendingSubmission: "We could not confirm whether this submission was recorded. Your original submission is preserved for a safe retry. Retry below or check My proposals before starting another idea.",
  retrySubmission: "Retry this submission", submissionConflict: "This submission needs to be checked in My proposals before you submit again.",
  statusIntro: "Verify the email you used to submit, then read updates and reply to review questions.",
  loading: "Loading proposals…", refresh: "Refresh", refreshing: "Refreshing…", signOut: "Sign out", signingOut: "Signing out…",
  allProposals: "All my proposals", viewProposal: "Open proposal", noProposals: "No proposals for this email yet.",
  newIdea: "Propose an idea", legacyTitle: "Have an older proposal ID and access code?",
  legacyIntro: "Use the code from your original receipt. Codes are never placed in the URL.",
  legacyInvalid: "The proposal ID or access code could not be verified. Check both and try again.",
  legacyAccess: "Access is limited to this proposal.", opening: "Opening…", notFound: "This proposal is unavailable for the current session.",
  nextStep: "Next step", timeline: "Status history", conversation: "Conversation", noMessages: "There are no review messages yet.",
  team: "Plugin Lab team", researcher: "You", researcherLabel: "Researcher", originalSubmission: "Your submitted idea", noValue: "Not supplied",
  replyTitle: "The team needs a little more information", replyIntro: "Read the team's question and send a plain-text reply. Please keep participant data and credentials out of your response.",
  replyLabel: "Your reply", sendReply: "Send reply", sendingReply: "Sending reply…", replySent: "Reply received. Your proposal is back under review.",
  replyLimit: "Up to 5,000 characters.", replyInvalid: "Enter a plain-text reply of 1–5,000 characters without credentials.",
  pendingReply: "We could not confirm receipt. Your reply is kept unchanged so you can safely retry it.",
  retryReply: "Retry this reply", replyConflict: "The proposal changed. Refresh its status to check whether your reply was recorded.",
  receiptState: "Received", receivedNext: "The team will review your idea. You can return here for updates.",
  reviewNext: "Your idea is being reviewed. No action is needed from you right now.",
  informationNext: "Please read the team's question and send a reply below.",
  selectedNext: "Your idea is selected for co-design. Read the team's message for the next step; this does not mean a plugin is scientifically verified or available in Production.",
  notSelectedNext: "Read the team's feedback below. You may submit a new idea when intake is open.",
  withdrawnNext: "This proposal has been withdrawn. Its record remains available here.",
  operatorEyebrow: "Restricted operator surface", operatorTitle: "Plugin proposal inbox",
  operatorIntro: "Review proposals, ask researchers for information, and track email delivery.",
  operatorUnavailable: "Operator access unavailable", operatorAccessHint: "Sign in to Open ENA with the authorized operator account, then return here.",
  openSignIn: "Open ENA sign in", search: "Search title or proposal ID", stateFilter: "Status", allStates: "All statuses",
  awaitingOnly: "Awaiting reply review", noMatches: "No proposals match these filters.",
  internalReason: "Internal reason", internalReasonHint: "Only operators can see this note.",
  researcherMessage: "Message to the researcher", researcherMessageHint: "Required when requesting information or declining an idea. This text appears in their conversation.",
  nextState: "Next status", selectState: "Select…", recordTransition: "Save status and message", transitionSaved: "Status and message saved.",
  transitionFailed: "The update could not be saved. Refresh the inbox and try again.", terminal: "This proposal has no further status transitions.",
  emailConfirmedLabel: "Email verified", yes: "Yes", no: "No", moderation: "Summary review", publicConsent: "Publication consent",
  pendingLabel: "Pending", approvedLabel: "Approved", notRequestedLabel: "Not requested", requestedLabel: "Requested", confirmedLabel: "Confirmed", withdrawnLabel: "Withdrawn",
  delivery: "Email delivery", deliveryFailed: "An email could not be delivered. Review delivery status before relying on the notification.",
  attempts: "Attempts", notificationReceived: "Receipt", notificationStatus: "Status update", notificationReply: "Reply alert",
  deliveryPending: "Pending", deliverySending: "Sending", deliverySent: "Sent", deliveryFailure: "Failed",
  copyEmail: "Copy manual email", copied: "Email template copied.", copyUnavailable: "Copy was unavailable.",
  rotateCode: "Rotate legacy access code", replacementCode: "Copy this replacement code now.", replacementHint: "The previous code is no longer valid. Keep this code separate from private proposal details.",
  recordVerified: "Record verified email reply", requestConsent: "Approve summary and request consent",
  retentionTitle: "Retention preview", retentionHint: "Lists terminal proposals not updated for 180 days. This check never deletes proposal content.",
  retentionAction: "Preview retention candidates", retentionResult: "{count} candidates. No deletion was performed.",
} as const;

type WorkflowStrings = { [K in keyof typeof en]: string };

const zhHans: WorkflowStrings = {
  yourIdea: "你的构想", contact: "联系方式", extras: "补充详情（选填）",
  formIntro: "告诉我们您希望 ENA 增加什么功能。无需编写代码。", titleExample: "例如：比较不同课次中讨论网络的变化。",
  questionExample: "你希望用 ENA 研究什么问题？简短说明即可。", changeExample: "描述你希望看到或完成的操作，以及它如何帮助你的研究。",
  requiredHint: "标有 * 的项目为必填，其余可选。", optional: "选填", requiredError: "请填写此项。", consentRequired: "请先确认此项。",
  invalidField: "请检查此项及其长度。只使用纯文本，勿包含凭证。", linksHint: "每行一个公开 HTTPS 链接，最多 8 个。勿填写私密或含访问凭证的链接。",
  linksError: "请每行填写一个不同的 HTTPS 链接，最多 8 个，且不能包含用户名或密码。",
  visibilityPrivate: "保持提案私密", visibilityPublic: "审查后考虑公开摘要", visibilityHint: "提案保持私密。公开标题和摘要须经过独立审核，并由你确认将公开的确切文字。",
  safetyNotice: "只接受文字：请勿包含参与者或学生数据、原始研究记录、凭证或受限制材料。私密审查不构成保密协议。提交不保证入选，资金也不会购得科学验证或论文署名。",
  sendCode: "发送验证码", sendingCode: "正在发送…", resendCode: "发送新验证码", resendIn: "{seconds} 秒后可重发",
  codeLabel: "6 位邮箱验证码", verifyEmail: "验证邮箱", verifying: "正在验证…", codeSent: "验证码已发送至 {email}，10 分钟内有效。如未收到，请检查垃圾邮件。",
  codeExpires: "验证码将在 {minutes}:{seconds} 后失效。", codeExpired: "验证码已过期。请获取新验证码，你的草稿仍保留在此。",
  verified: "邮箱已验证", checkingSession: "正在检查邮箱验证状态…", verifyHint: "验证邮箱不会提交此表单。", verifyFirst: "请先验证此邮箱再提交，草稿将保留在本页。",
  sessionExpired: "邮箱验证会话已过期。请重新验证后继续，已填写的文字仍保留。", emailInvalid: "请输入有效的邮箱地址。", codeInvalid: "请输入邮件中当前有效的 6 位验证码。",
  rateLimited: "请稍等后再试。", emailUnavailable: "邮箱验证暂时不可用。请保留此页面并稍后重试。", unavailable: "服务暂时不可用。你的文字仍保留，请稍后重试。",
  requestFailed: "未能完成请求，请重试。", closedTitle: "暂时无法接收新提案", closedText: "请稍后回来提交新构想。你仍可查看已有提案。",
  intakeAvailable: "提交前需要验证邮箱。已有提案可通过“我的提案”查看。", intakeUnavailable: "暂时无法接收新提案，你仍可查看已有提案。",
  backCatalog: "返回插件实验室", myProposals: "查看我的提案", downloadReceipt: "下载回执（.txt）", receiptIntro: "构想已记录。请保存下方提案编号，之后验证同一邮箱即可再次查看。",
  receiptNote: "回执仅包含提案编号和状态页面链接，不含访问码或私密提案文字。", pendingSubmission: "我们未能确认是否已记录本次提交。原始提交已保留，可安全重试。请点击下方重试，或先查看“我的提案”再提交其他构想。",
  retrySubmission: "重试本次提交", submissionConflict: "请先在“我的提案”中核对本次提交，再尝试提交。", statusIntro: "验证提交时使用的邮箱，即可查看进展并回复审查问题。",
  loading: "正在加载提案…", refresh: "刷新", refreshing: "正在刷新…", signOut: "退出", signingOut: "正在退出…", allProposals: "我的全部提案", viewProposal: "打开提案",
  noProposals: "此邮箱尚无提案。", newIdea: "提交新构想", legacyTitle: "持有旧版提案编号和访问码？", legacyIntro: "请使用原始回执中的访问码。访问码不会放入网址。",
  legacyInvalid: "无法验证提案编号或访问码，请检查后重试。", legacyAccess: "本次访问仅限此提案。", opening: "正在打开…", notFound: "当前会话无法访问此提案。",
  nextStep: "下一步", timeline: "状态记录", conversation: "交流记录", noMessages: "暂时没有审查消息。", team: "插件实验室团队", researcher: "你", researcherLabel: "研究者", originalSubmission: "已提交的构想", noValue: "未提供",
  replyTitle: "团队需要你补充一些信息", replyIntro: "请阅读团队的问题，并以纯文本回复。请勿在回复中包含参与者数据或凭证。", replyLabel: "你的回复", sendReply: "发送回复", sendingReply: "正在发送回复…",
  replySent: "回复已收到，提案已回到审查中。", replyLimit: "最多 5,000 个字符。", replyInvalid: "请输入 1–5,000 个字符的纯文本回复，且不含凭证。",
  pendingReply: "未能确认是否收到回复。原文已保留，你可以安全重试。", retryReply: "重试此回复", replyConflict: "提案状态已变化。请刷新后确认回复是否已记录。",
  receiptState: "已收到", receivedNext: "团队将审查你的构想。你可以返回此处查看进展。", reviewNext: "构想正在审查中，目前无需你操作。", informationNext: "请阅读团队的问题，并在下方回复。",
  selectedNext: "构想已入选共同设计。请阅读团队消息了解下一步；这不代表插件已通过科学验证或已可在生产环境使用。", notSelectedNext: "请阅读下方团队反馈。征集开放时，你可提交新构想。", withdrawnNext: "此提案已撤回，你仍可在此查看记录。",
  operatorEyebrow: "受限的管理界面", operatorTitle: "提案审查收件箱", operatorIntro: "审查提案、向研究者提问，并查看邮件投递情况。", operatorUnavailable: "无法使用管理员访问", operatorAccessHint: "请用获授权的管理员账号登录 Open ENA，然后返回此页。",
  openSignIn: "登录 Open ENA", search: "搜索标题或提案编号", stateFilter: "状态", allStates: "全部状态", awaitingOnly: "等待审阅回复", noMatches: "没有符合筛选条件的提案。",
  internalReason: "内部原因", internalReasonHint: "此备注仅管理员可见。", researcherMessage: "给研究者的消息", researcherMessageHint: "要求补充信息或不予入选时必填。此文字将显示在研究者的交流记录中。",
  nextState: "下一状态", selectState: "请选择…", recordTransition: "保存状态和消息", transitionSaved: "状态和消息已保存。", transitionFailed: "未能保存更新，请刷新收件箱后重试。", terminal: "此提案没有后续状态变更。",
  emailConfirmedLabel: "邮箱已验证", yes: "是", no: "否", moderation: "摘要审核", publicConsent: "公开同意", pendingLabel: "待处理", approvedLabel: "已批准", notRequestedLabel: "未请求", requestedLabel: "已请求", confirmedLabel: "已确认", withdrawnLabel: "已撤回",
  delivery: "邮件投递", deliveryFailed: "有邮件未能送达，请检查投递状态后再依赖通知。", attempts: "尝试次数", notificationReceived: "回执", notificationStatus: "状态更新", notificationReply: "回复通知",
  deliveryPending: "等待发送", deliverySending: "发送中", deliverySent: "已发送", deliveryFailure: "失败", copyEmail: "复制人工邮件模板", copied: "已复制邮件模板。", copyUnavailable: "暂时无法复制。",
  rotateCode: "更换旧版访问码", replacementCode: "请立即复制此替代访问码。", replacementHint: "原访问码已失效。请勿将此码与私密提案内容放在一起。", recordVerified: "记录已验证的邮件回复", requestConsent: "批准摘要并请求公开同意",
  retentionTitle: "保留期限预览", retentionHint: "列出已结束且 180 天内未更新的提案。此检查不会删除提案内容。", retentionAction: "预览待处理记录", retentionResult: "共 {count} 条记录，未执行删除。",
};

const zhHant: WorkflowStrings = {
  yourIdea: "你的構想", contact: "聯絡方式", extras: "補充詳情（選填）",
  formIntro: "告訴我們您希望 ENA 增加甚麼功能。無需編寫程式碼。", titleExample: "例如：比較不同課次中討論網絡的變化。",
  questionExample: "你希望用 ENA 研究甚麼問題？簡短說明即可。", changeExample: "描述你希望看到或完成的操作，以及它如何幫助你的研究。",
  requiredHint: "標有 * 的項目為必填，其餘可選。", optional: "選填", requiredError: "請填寫此項。", consentRequired: "請先確認此項。",
  invalidField: "請檢查此項及其長度。只使用純文字，勿包含憑證。", linksHint: "每行一個公開 HTTPS 連結，最多 8 個。勿填寫私密或含存取憑證的連結。",
  linksError: "請每行填寫一個不同的 HTTPS 連結，最多 8 個，且不能包含使用者名稱或密碼。",
  visibilityPrivate: "保持提案私密", visibilityPublic: "審查後考慮公開摘要", visibilityHint: "提案保持私密。公開標題和摘要須經過獨立審核，並由你確認將公開的確切文字。",
  safetyNotice: "只接受文字：請勿包含參與者或學生資料、原始研究紀錄、憑證或受限制材料。私密審查不構成保密協議。提交不保證入選，資金也不會購得科學驗證或論文署名。",
  sendCode: "傳送驗證碼", sendingCode: "正在傳送…", resendCode: "傳送新驗證碼", resendIn: "{seconds} 秒後可重發",
  codeLabel: "6 位電郵驗證碼", verifyEmail: "驗證電郵", verifying: "正在驗證…", codeSent: "驗證碼已傳送至 {email}，10 分鐘內有效。如未收到，請檢查垃圾郵件。",
  codeExpires: "驗證碼將在 {minutes}:{seconds} 後失效。", codeExpired: "驗證碼已過期。請取得新驗證碼，你的草稿仍保留在此。",
  verified: "電郵已驗證", checkingSession: "正在檢查電郵驗證狀態…", verifyHint: "驗證電郵不會提交此表單。", verifyFirst: "請先驗證此電郵再提交，草稿將保留在本頁。",
  sessionExpired: "電郵驗證工作階段已過期。請重新驗證後繼續，已填寫的文字仍保留。", emailInvalid: "請輸入有效的電郵地址。", codeInvalid: "請輸入郵件中目前有效的 6 位驗證碼。",
  rateLimited: "請稍等後再試。", emailUnavailable: "電郵驗證暫時無法使用。請保留此頁面並稍後重試。", unavailable: "服務暫時無法使用。你的文字仍保留，請稍後重試。",
  requestFailed: "未能完成請求，請重試。", closedTitle: "暫時無法接收新提案", closedText: "請稍後回來提交新構想。你仍可查看已有提案。",
  intakeAvailable: "提交前需要驗證電郵。已有提案可透過「我的提案」查看。", intakeUnavailable: "暫時無法接收新提案，你仍可查看已有提案。",
  backCatalog: "返回插件實驗室", myProposals: "查看我的提案", downloadReceipt: "下載收據（.txt）", receiptIntro: "構想已記錄。請保存下方提案編號，之後驗證同一電郵即可再次查看。",
  receiptNote: "收據僅包含提案編號和狀態頁面連結，不含存取碼或私密提案文字。", pendingSubmission: "我們未能確認是否已記錄本次提交。原始提交已保留，可安全重試。請按下方重試，或先查看「我的提案」再提交其他構想。",
  retrySubmission: "重試本次提交", submissionConflict: "請先在「我的提案」中核對本次提交，再嘗試提交。", statusIntro: "驗證提交時使用的電郵，即可查看進展並回覆審查問題。",
  loading: "正在載入提案…", refresh: "重新整理", refreshing: "正在重新整理…", signOut: "登出", signingOut: "正在登出…", allProposals: "我的全部提案", viewProposal: "開啟提案",
  noProposals: "此電郵尚無提案。", newIdea: "提交新構想", legacyTitle: "持有舊版提案編號和存取碼？", legacyIntro: "請使用原始收據中的存取碼。存取碼不會放入網址。",
  legacyInvalid: "無法驗證提案編號或存取碼，請檢查後重試。", legacyAccess: "本次存取僅限此提案。", opening: "正在開啟…", notFound: "目前工作階段無法存取此提案。",
  nextStep: "下一步", timeline: "狀態紀錄", conversation: "交流紀錄", noMessages: "暫時沒有審查訊息。", team: "插件實驗室團隊", researcher: "你", researcherLabel: "研究者", originalSubmission: "已提交的構想", noValue: "未提供",
  replyTitle: "團隊需要你補充一些資料", replyIntro: "請閱讀團隊的問題，並以純文字回覆。請勿在回覆中包含參與者資料或憑證。", replyLabel: "你的回覆", sendReply: "傳送回覆", sendingReply: "正在傳送回覆…",
  replySent: "回覆已收到，提案已回到審查中。", replyLimit: "最多 5,000 個字元。", replyInvalid: "請輸入 1–5,000 個字元的純文字回覆，且不含憑證。",
  pendingReply: "未能確認是否收到回覆。原文已保留，你可以安全重試。", retryReply: "重試此回覆", replyConflict: "提案狀態已變化。請重新整理後確認回覆是否已記錄。",
  receiptState: "已收到", receivedNext: "團隊將審查你的構想。你可以返回此處查看進展。", reviewNext: "構想正在審查中，目前無需你操作。", informationNext: "請閱讀團隊的問題，並在下方回覆。",
  selectedNext: "構想已入選共同設計。請閱讀團隊訊息了解下一步；這不代表插件已通過科學驗證或已可在生產環境使用。", notSelectedNext: "請閱讀下方團隊回饋。徵集開放時，你可提交新構想。", withdrawnNext: "此提案已撤回，你仍可在此查看紀錄。",
  operatorEyebrow: "受限的管理介面", operatorTitle: "提案審查收件箱", operatorIntro: "審查提案、向研究者提問，並查看郵件投遞情況。", operatorUnavailable: "無法使用管理員存取", operatorAccessHint: "請用獲授權的管理員帳戶登入 Open ENA，然後返回此頁。",
  openSignIn: "登入 Open ENA", search: "搜尋標題或提案編號", stateFilter: "狀態", allStates: "全部狀態", awaitingOnly: "等待審閱回覆", noMatches: "沒有符合篩選條件的提案。",
  internalReason: "內部原因", internalReasonHint: "此備註僅管理員可見。", researcherMessage: "給研究者的訊息", researcherMessageHint: "要求補充資料或不予入選時必填。此文字將顯示在研究者的交流紀錄中。",
  nextState: "下一狀態", selectState: "請選擇…", recordTransition: "儲存狀態和訊息", transitionSaved: "狀態和訊息已儲存。", transitionFailed: "未能儲存更新，請重新整理收件箱後重試。", terminal: "此提案沒有後續狀態變更。",
  emailConfirmedLabel: "電郵已驗證", yes: "是", no: "否", moderation: "摘要審核", publicConsent: "公開同意", pendingLabel: "待處理", approvedLabel: "已批准", notRequestedLabel: "未請求", requestedLabel: "已請求", confirmedLabel: "已確認", withdrawnLabel: "已撤回",
  delivery: "郵件投遞", deliveryFailed: "有郵件未能送達，請檢查投遞狀態後再依賴通知。", attempts: "嘗試次數", notificationReceived: "收據", notificationStatus: "狀態更新", notificationReply: "回覆通知",
  deliveryPending: "等待傳送", deliverySending: "傳送中", deliverySent: "已傳送", deliveryFailure: "失敗", copyEmail: "複製人工郵件範本", copied: "已複製郵件範本。", copyUnavailable: "暫時無法複製。",
  rotateCode: "更換舊版存取碼", replacementCode: "請立即複製此替代存取碼。", replacementHint: "原存取碼已失效。請勿將此碼與私密提案內容放在一起。", recordVerified: "記錄已驗證的郵件回覆", requestConsent: "批准摘要並請求公開同意",
  retentionTitle: "保留期限預覽", retentionHint: "列出已結束且 180 天內未更新的提案。此檢查不會刪除提案內容。", retentionAction: "預覽待處理紀錄", retentionResult: "共 {count} 條紀錄，未執行刪除。",
};

export function getPluginWorkflowCopy(locale: Locale) {
  const base = getPluginProposalFormCopy(locale);
  return { ...base, ...getPluginProposalStatusCopy(locale), ...(locale === "zh-hans" ? zhHans : locale === "zh-hant" ? zhHant : en) };
}

export function pluginWorkflowError(code: unknown, locale: Locale) {
  const copy = getPluginWorkflowCopy(locale);
  const errors: Record<string, string> = {
    "invalid-email": copy.emailInvalid, "invalid-code": copy.codeInvalid, "invalid-access": copy.legacyInvalid,
    "rate-limited": copy.rateLimited, "email-unavailable": copy.emailUnavailable, "service-unavailable": copy.unavailable,
    "verification-required": copy.sessionExpired, "invalid-proposal": copy.invalidField, "invalid-field": copy.invalidField,
    "intake-closed": copy.closedText, "submission-conflict": copy.submissionConflict, "reply-conflict": copy.replyConflict,
    "not-found": copy.notFound, "invalid-request": copy.requestFailed,
  };
  return errors[String(code)] ?? copy.requestFailed;
}

export function pluginWorkflowNextStep(state: PluginProposalState, locale: Locale) {
  const copy = getPluginWorkflowCopy(locale);
  return { received: copy.receivedNext, "under-review": copy.reviewNext, "needs-information": copy.informationNext, selected: copy.selectedNext, "not-selected": copy.notSelectedNext, withdrawn: copy.withdrawnNext }[state];
}

export function pluginWorkflowDate(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const language = locale === "zh-hans" ? "zh-CN" : locale === "zh-hant" ? "zh-HK" : "en-GB";
  // An explicit zone keeps server-rendered and browser-rendered timestamps identical.
  return `${new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`;
}

export function pluginWorkflowTemplate(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/gu, (match, key: string) => String(values[key] ?? match));
}
