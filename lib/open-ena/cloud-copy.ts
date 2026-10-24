import type { Locale } from "../i18n";

const en = {
  email: "Email", emailHint: "Use an email address you can open.", registerTitle: "Create your Open ENA account",
  registerIntro: "Verify your email, then choose a password. Your private projects are available from ena.hk and open-ena.com.",
  sendVerification: "Send verification link", resetTitle: "Reset your password", resetIntro: "We will email you a one-time link to choose a new password.",
  sendReset: "Send password reset link", password: "New password", confirmPassword: "Confirm password",
  passwordHelp: "Use 15–128 characters. Spaces and passphrases are welcome.", finishRegistration: "Verify email and create account", finishReset: "Save new password",
  verifyTitle: "Choose your password", verifyIntro: "This verifies the email address that received your link and creates your private account.",
  resetLinkIntro: "Saving a new password signs out your previous sessions on both domains.",
  requestSent: "Check your email. We have sent the next step for this address. Please also check your spam folder.",
  verified: "Your email is verified and your account is ready. You can now sign in.", resetDone: "Your password has been changed. Sign in with your new password.",
  signIn: "Sign in", register: "Create an account", recover: "Forgot password?", returnToSignIn: "Back to sign in", working: "Please wait…",
  passwordMismatch: "The passwords do not match.", invalidInput: "Check your email or password and try again.", invalidToken: "This link has expired or has already been used. Request a new link.",
  unavailable: "This service is temporarily unavailable. Please try again later.", rateLimited: "Too many requests. Please wait before trying again.",
  cloudLoginLabel: "Email or existing account name", cloudLoginHint: "Enter your email or existing account name",
  cloudLoginIntro: "Sign in to analyze your data and reopen your private cloud projects.", cloudPrivacy: "Your imported source rows stay in this browser until you save a private cloud project or export them. AI sharing uses a separate confirmation.",
  cloudProjects: "My cloud projects", projectTitle: "Project name", untitled: "Untitled project", save: "Save to cloud", saveCopy: "Save as new project",
  newWorkspace: "New local workspace", open: "Open", refresh: "Refresh", archive: "Archive", restore: "Restore", archived: "Archived", showActive: "Active projects",
  close: "Close", rename: "Rename", renameSave: "Save name", empty: "No projects here yet. Save your current workspace to create one.", loading: "Loading projects…",
  local: "Local workspace", unsaved: "Unsaved changes", saved: "Saved {time} · version {revision}", cloudReady: "Private cloud projects",
  disclosure: "Saving includes your data table, both model drafts, ENA/ONA result, statistical report, completed AI interpretation and its evidence, captured comparison sets, historical imports and display choices. Only your account can open this cloud copy on either website.",
  localOnlyDisclosure: "Unfinished requests and imports awaiting confirmation stay in this browser. Complete or cancel them before leaving. Opening a saved project never starts an analysis or AI request.",
  savedAiAvailable: "Your saved AI interpretation is available below.",
  savedAiNote: "Saved AI interpretation based on the evidence at generation time. This record remains available when the model changes. A new interpretation requires recomputed statistics and a new sharing confirmation.",
  localOnlyLabel: "Unfinished work in this browser",
  localOnlyWarning: "Replace this workspace? Unsaved changes, unfinished requests and imports awaiting confirmation will be lost. Complete or cancel pending work, then save the project to keep your changes.",
  unfinishedModelInput: "Finish or correct the visible model inputs before saving. Unfinished text cannot be saved faithfully; your current work is still here.",
  storage: "{count} / {limit} projects · {used} / {total} MiB", limits: "Up to 16 MiB per project. Archived projects still count toward storage.",
  conflict: "A newer version was saved elsewhere. Reopen it, or save your current work as a new project.", sessionExpired: "Your sign-in has expired. Save your local exports before signing in again.",
  projectMissing: "This project is unavailable or no longer belongs to this account.", quota: "Your cloud project or storage limit has been reached. Keep a local export of this work.",
  tooLarge: "This project exceeds the cloud size or complexity limit (at most 16 MiB per project). You can still export locally.", invalidSnapshot: "The saved workspace could not be verified. Your current workspace has not been replaced.",
  waitForAnalysis: "Wait for the analysis, AI request, comparison capture or import to finish before saving.", openWarning: "Replace this workspace? Your unsaved changes will be lost. Save to cloud or export first if you want to keep them.",
  archiveWarning: "Archive this project? It stays private and can be restored from Archived projects.",
  savedStatistics: "Saved statistical report", savedStatisticsNote: "These are the statistics saved with this project. Compute statistics again to use them for a new inference or AI request.",
  savedReference: "Saved Reference", projectLoaded: "Project opened", cloudSaved: "Project saved", restoreDone: "Project restored", archiveDone: "Project archived",
  deleteProject: "Delete permanently", deleteWarning: "Permanently delete the archived cloud project “{name}”? This cloud copy cannot be recovered. Your downloaded files are unaffected.", deleteDone: "Cloud project permanently deleted", downloadStatistics: "Download saved report",
  accountChanged: "The signed-in account changed in another tab. Export this local work before signing in to the original account. This window cannot save into the new account.",
  runtimePrivacy: "ENA computation uses jENA v{version} (GPL-3.0-only); ENA.HK provides the interface, plotting and exports. Cloud Save stores a private copy of the workspace, including completed AI interpretations, comparison sets and historical imports. New AI sharing requires a separate confirmation.",
};
export type OpenEnaCloudCopy = { [K in keyof typeof en]: string };

const zhHans: OpenEnaCloudCopy = {
  email: "邮箱", emailHint: "请输入可以接收邮件的邮箱。", registerTitle: "创建 Open ENA 账号",
  registerIntro: "先验证邮箱，再设置密码。登录 ena.hk 或 open-ena.com 后，都能打开自己的云端项目。",
  sendVerification: "发送邮箱验证链接", resetTitle: "找回密码", resetIntro: "我们将发送一次性链接，供你设置新密码。",
  sendReset: "发送密码重设链接", password: "新密码", confirmPassword: "确认密码", passwordHelp: "使用 15–128 个字符，可以包含空格，也可以使用较长的密码短语。",
  finishRegistration: "验证邮箱并创建账号", finishReset: "保存新密码", verifyTitle: "设置密码", verifyIntro: "完成后将验证收到链接的邮箱，并创建你的个人账号。",
  resetLinkIntro: "保存新密码后，此账号在两个网址上的原有登录会话都会失效。", requestSent: "请查收邮件，我们已发送此邮箱的下一步操作。也请检查垃圾邮件文件夹。",
  verified: "邮箱已验证，账号已创建。现在可以登录。", resetDone: "密码已修改。请使用新密码登录。", signIn: "登录", register: "注册账号", recover: "忘记密码？", returnToSignIn: "返回登录", working: "正在处理…",
  passwordMismatch: "两次输入的密码不一致。", invalidInput: "请检查邮箱或密码后重试。", invalidToken: "此链接已过期或已使用，请重新申请链接。", unavailable: "服务暂时不可用，请稍后重试。", rateLimited: "请求过于频繁，请稍后再试。",
  cloudLoginLabel: "邮箱或现有账号名称", cloudLoginHint: "输入邮箱或现有账号名称", cloudLoginIntro: "登录后分析数据，并打开自己的云端项目。", cloudPrivacy: "导入的原始数据行保留在当前浏览器中，只有你主动保存到个人云端或导出时才会复制出去。AI 分享另行确认。",
  cloudProjects: "我的云端项目", projectTitle: "项目名称", untitled: "未命名项目", save: "保存到云端", saveCopy: "另存为新项目", newWorkspace: "新建本地工作区", open: "打开", refresh: "刷新", archive: "归档", restore: "恢复", archived: "已归档", showActive: "使用中的项目", close: "关闭", rename: "重命名", renameSave: "保存名称",
  empty: "这里还没有项目。保存当前工作区即可创建一个。", loading: "正在读取项目…", local: "本地工作区", unsaved: "有未保存的修改", saved: "已保存于 {time} · 版本 {revision}", cloudReady: "个人云端项目",
  disclosure: "云端保存包含数据表、两种模型草稿、ENA/ONA 结果、统计报告、已完成的 AI 解读及其证据、已捕获的比较集、历史导入和显示设置。你的账号在两个网址均可打开这份个人云端副本。", storage: "{count} / {limit} 个项目 · {used} / {total} MiB", limits: "单个项目上限为 16 MiB。已归档项目仍计入存储空间。",
  localOnlyDisclosure: "尚未完成的请求和待确认的导入仅保留在当前浏览器中，请先完成或取消。打开已保存项目不会自动运行分析或发送 AI 请求。",
  savedAiAvailable: "已恢复保存的 AI 解读，可在下方查看。",
  savedAiNote: "这是根据生成时证据保存的 AI 解读，模型变化后仍可查看此记录。如需生成新的解读，请重新计算统计结果并确认分享。",
  localOnlyLabel: "此浏览器中还有未完成的操作",
  localOnlyWarning: "替换当前工作区？未保存的修改、尚未完成的请求和待确认的导入将丢失。请先完成或取消待处理操作，再保存项目以保留修改。",
  unfinishedModelInput: "请先完成或修正模型输入再保存。未完成的文字输入无法完整保存；当前工作仍保留在此页面。",
  conflict: "此项目已在其他窗口保存了新版本。请重新打开，或将当前工作另存为新项目。", sessionExpired: "登录已失效。重新登录前，请先导出需要保留的本地内容。", projectMissing: "此项目不可用，或已不属于当前账号。", quota: "已达到项目数量或存储空间上限。请先将当前工作导出到本地。", tooLarge: "此项目超过云端保存的大小或复杂度上限（单个项目最多 16 MiB），仍可导出到本地。", invalidSnapshot: "无法验证保存的工作区，当前工作区未被替换。", waitForAnalysis: "请等待分析、AI 请求、比较集捕获或导入完成后再保存。",
  openWarning: "替换当前工作区？未保存的修改将丢失。如果需要保留，请先保存到云端或导出。", archiveWarning: "归档此项目？项目仍为私有，可以在“已归档”中恢复。", savedStatistics: "已保存的统计报告", savedStatisticsNote: "这是随项目保存的统计结果。若要用于新的统计推断或 AI 请求，请重新计算统计结果。", savedReference: "已保存的 Reference", projectLoaded: "项目已打开", cloudSaved: "项目已保存", restoreDone: "项目已恢复", archiveDone: "项目已归档",
  deleteProject: "永久删除", deleteWarning: "永久删除已归档的云端项目“{name}”？这份云端副本将无法恢复，已下载的本地文件不受影响。", deleteDone: "云端项目已永久删除", downloadStatistics: "下载已保存的报告",
  accountChanged: "另一个标签页已切换账号。请先导出需要保留的本地工作，再登录原账号；此窗口不会把数据保存到新账号。",
  runtimePrivacy: "ENA 计算由 jENA v{version}（GPL-3.0-only）提供，ENA.HK 提供界面、绘图和导出。云端保存会存储工作区的个人副本，包括已完成的 AI 解读、比较集和历史导入。新的 AI 分享仍需另行确认。",
};
const zhHant: OpenEnaCloudCopy = {
  email: "電郵", emailHint: "請輸入可以接收郵件的電郵地址。", registerTitle: "建立 Open ENA 帳戶",
  registerIntro: "先驗證電郵，再設定密碼。登入 ena.hk 或 open-ena.com 後，都能開啟自己的雲端專案。",
  sendVerification: "傳送電郵驗證連結", resetTitle: "重設密碼", resetIntro: "我們將傳送一次性連結，供你設定新密碼。", sendReset: "傳送密碼重設連結",
  password: "新密碼", confirmPassword: "確認密碼", passwordHelp: "使用 15–128 個字元，可包含空格，也可使用較長的密碼短語。", finishRegistration: "驗證電郵並建立帳戶", finishReset: "儲存新密碼",
  verifyTitle: "設定密碼", verifyIntro: "完成後將驗證收到連結的電郵，並建立你的個人帳戶。", resetLinkIntro: "儲存新密碼後，此帳戶在兩個網址上的原有登入工作階段都會失效。",
  requestSent: "請查收電郵，我們已傳送此地址的下一步操作。亦請檢查垃圾郵件資料夾。", verified: "電郵已驗證，帳戶已建立。現在可以登入。", resetDone: "密碼已修改。請使用新密碼登入。",
  signIn: "登入", register: "註冊帳戶", recover: "忘記密碼？", returnToSignIn: "返回登入", working: "正在處理…", passwordMismatch: "兩次輸入的密碼不一致。", invalidInput: "請檢查電郵或密碼後重試。", invalidToken: "此連結已過期或已使用，請重新申請連結。", unavailable: "服務暫時無法使用，請稍後重試。", rateLimited: "請求過於頻繁，請稍後再試。",
  cloudLoginLabel: "電郵或現有帳戶名稱", cloudLoginHint: "輸入電郵或現有帳戶名稱", cloudLoginIntro: "登入後分析資料，並開啟自己的雲端專案。", cloudPrivacy: "匯入的原始資料列保留在目前瀏覽器中，只有你主動儲存至個人雲端或匯出時才會複製出去。AI 分享另行確認。",
  cloudProjects: "我的雲端專案", projectTitle: "專案名稱", untitled: "未命名專案", save: "儲存至雲端", saveCopy: "另存為新專案", newWorkspace: "新增本地工作區", open: "開啟", refresh: "重新整理", archive: "封存", restore: "還原", archived: "已封存", showActive: "使用中的專案", close: "關閉", rename: "重新命名", renameSave: "儲存名稱",
  empty: "這裡尚未有專案。儲存目前工作區即可建立一個。", loading: "正在讀取專案…", local: "本地工作區", unsaved: "有未儲存的修改", saved: "已儲存於 {time} · 版本 {revision}", cloudReady: "個人雲端專案",
  disclosure: "雲端儲存包含資料表、兩種模型草稿、ENA/ONA 結果、統計報告、已完成的 AI 解讀及其證據、已擷取的比較集、歷史匯入和顯示設定。你的帳戶在兩個網址均可開啟這份個人雲端副本。", storage: "{count} / {limit} 個專案 · {used} / {total} MiB", limits: "單個專案上限為 16 MiB。已封存專案仍計入儲存空間。",
  localOnlyDisclosure: "尚未完成的請求和待確認的匯入僅保留在目前瀏覽器中，請先完成或取消。開啟已儲存專案不會自動執行分析或傳送 AI 請求。",
  savedAiAvailable: "已還原儲存的 AI 解讀，可在下方查看。",
  savedAiNote: "這是根據生成時證據儲存的 AI 解讀，模型變化後仍可查看此記錄。如需產生新的解讀，請重新計算統計結果並確認分享。",
  localOnlyLabel: "此瀏覽器中還有未完成的操作",
  localOnlyWarning: "替換目前工作區？未儲存的修改、尚未完成的請求和待確認的匯入將遺失。請先完成或取消待處理操作，再儲存專案以保留修改。",
  unfinishedModelInput: "請先完成或修正模型輸入再儲存。未完成的文字輸入無法完整儲存；目前工作仍保留在此頁面。",
  conflict: "此專案已在其他視窗儲存了新版本。請重新開啟，或將目前工作另存為新專案。", sessionExpired: "登入已失效。重新登入前，請先匯出需要保留的本地內容。", projectMissing: "此專案無法使用，或已不屬於目前帳戶。", quota: "已達到專案數量或儲存空間上限。請先將目前工作匯出至本地。", tooLarge: "此專案超過雲端儲存的大小或複雜度上限（單個專案最多 16 MiB），仍可匯出至本地。", invalidSnapshot: "無法驗證儲存的工作區，目前工作區未被替換。", waitForAnalysis: "請等待分析、AI 請求、比較集擷取或匯入完成後再儲存。",
  openWarning: "替換目前工作區？未儲存的修改將遺失。如需保留，請先儲存至雲端或匯出。", archiveWarning: "封存此專案？專案仍為私人，可以在「已封存」中還原。", savedStatistics: "已儲存的統計報告", savedStatisticsNote: "這是隨專案儲存的統計結果。若要用於新的統計推論或 AI 請求，請重新計算統計結果。", savedReference: "已儲存的 Reference", projectLoaded: "專案已開啟", cloudSaved: "專案已儲存", restoreDone: "專案已還原", archiveDone: "專案已封存",
  deleteProject: "永久刪除", deleteWarning: "永久刪除已封存的雲端專案「{name}」？這份雲端副本將無法還原，已下載的本地檔案不受影響。", deleteDone: "雲端專案已永久刪除", downloadStatistics: "下載已儲存的報告",
  accountChanged: "另一個分頁已切換帳戶。請先匯出需要保留的本地工作，再登入原帳戶；此視窗不會把資料儲存至新帳戶。",
  runtimePrivacy: "ENA 運算由 jENA v{version}（GPL-3.0-only）提供，ENA.HK 提供介面、繪圖和匯出。雲端儲存會保存工作區的個人副本，包括已完成的 AI 解讀、比較集和歷史匯入。新的 AI 分享仍需另行確認。",
};

export function getOpenEnaCloudCopy(locale: Locale): OpenEnaCloudCopy { return locale === "zh-hans" ? zhHans : locale === "zh-hant" ? zhHant : en; }
export function openEnaCloudErrorCopy(code: unknown, copy: OpenEnaCloudCopy) {
  switch (code) {
    case "invalid-input": return copy.invalidInput;
    case "invalid-token": return copy.invalidToken;
    case "rate-limited": return copy.rateLimited;
    case "unauthenticated": case "registered-account-required": return copy.sessionExpired;
    case "account-changed": return copy.accountChanged;
    case "not-found": return copy.projectMissing;
    case "conflict": return copy.conflict;
    case "quota": return copy.quota;
    case "too-large": return copy.tooLarge;
    case "invalid-snapshot": return copy.invalidSnapshot;
    case "unfinished-model-input": return copy.unfinishedModelInput;
    default: return copy.unavailable;
  }
}
