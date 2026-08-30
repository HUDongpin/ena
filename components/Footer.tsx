import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { getOpenEnaNavLabel } from "@/lib/open-ena-i18n";
import { siteConfig } from "@/lib/site";
import AnalyticsConsentControl from "./AnalyticsConsentControl";
import Logo from "./Logo";

interface FooterProps {
  locale: Locale;
  dictionary: Dictionary;
}

const analyticsDisclosure = {
  en: {
    title: "Analytics and data boundaries",
    paragraphs: [
      "Provider and purpose: this site can use Vercel Web Analytics for aggregate page-view measurement. It is disabled by default and starts only after an explicit choice below; browser-smoke testing disables it unconditionally. Vercel documents the default service as not using third-party cookies; its visitor session hash is discarded after 24 hours.",
      "Data scope: a page-view data point sent to Vercel servers may include a timestamp, the same-origin path (filtered query parameters are removed: this app strips query strings and fragments before sending), referrer, approximate location, operating system, browser, and device.",
      "Retention, region, and receipt boundary: Vercel documents the 24-hour visitor-session-hash disposal, but this repository does not claim a fixed retention period for aggregate event records or a fixed processing region; the deployed provider configuration remains authoritative. Vercel does not expose a per-event audit receipt in this interface; the local opt-in/opt-out preference is the only consent record held by this browser and contains no account or dataset identifier. The authenticated Open ENA workspace keeps analytics disabled.",
    ],
    consent: {
      enable: "Allow aggregate analytics",
      disable: "Disable analytics",
      enabled: "Aggregate analytics is enabled for this browser.",
      disabled: "Aggregate analytics is disabled for this browser.",
      undecided: "Aggregate analytics is not enabled.",
    },
  },
  "zh-hant": {
    title: "分析服務與資料界線",
    paragraphs: [
      "供應商與目的：本站可使用 Vercel Web Analytics 作彙總頁面瀏覽量度；預設關閉，只有在下方明確選擇後才會啟用，瀏覽器 smoke 測試則一律停用。Vercel 將預設服務描述為不使用第三方 Cookie；訪客工作階段雜湊會在 24 小時後丟棄。",
      "資料範圍：傳送至 Vercel 伺服器的頁面瀏覽資料點可能包括時間戳、同源路徑（本站會在傳送前移除查詢字串及片段）、referrer、概略位置、作業系統、瀏覽器及裝置。",
      "保留期、地區及回執界線：Vercel 說明訪客工作階段雜湊會在 24 小時後丟棄，但本程式庫不宣稱彙總事件記錄有固定保留期或固定處理地區。Vercel 不會在此介面提供逐事件審計回執；瀏覽器只保存本地啟用／停用選擇，不含帳戶或資料集識別碼。已登入的 Open ENA 工作區會停用分析。",
    ],
    consent: {
      enable: "允許彙總分析",
      disable: "停用分析",
      enabled: "此瀏覽器已啟用彙總分析。",
      disabled: "此瀏覽器已停用彙總分析。",
      undecided: "尚未啟用彙總分析。",
    },
  },
  "zh-hans": {
    title: "分析服务与数据边界",
    paragraphs: [
      "供应商与目的：本站可使用 Vercel Web Analytics 进行聚合页面测量；默认关闭，只有在下方明确选择后才会启用，浏览器 smoke 测试则始终停用。Vercel 将默认服务描述为不使用第三方 Cookie；访客会话哈希会在 24 小时后丢弃。",
      "数据范围：发送至 Vercel 服务器的页面浏览数据点可能包括时间戳、同源路径（本网站会在发送前移除查询字符串和片段）、referrer、粗略位置、操作系统、浏览器及设备。",
      "保留期、地区与回执边界：Vercel 说明访客会话哈希会在 24 小时后丢弃，但本代码库不宣称聚合事件记录有固定保留期或固定处理地区。Vercel 不会在此界面提供逐事件审计回执；浏览器只保存本地启用／停用选择，不含账户或数据集标识符。已登录的 Open ENA 工作区会停用分析。",
    ],
    consent: {
      enable: "允许聚合分析",
      disable: "停用分析",
      enabled: "此浏览器已启用聚合分析。",
      disabled: "此浏览器已停用聚合分析。",
      undecided: "尚未启用聚合分析。",
    },
  },
} as const;

export default function Footer({ locale, dictionary }: FooterProps) {
  const privacy = locale === "zh-hant" || locale === "zh-hans"
    ? analyticsDisclosure[locale]
    : analyticsDisclosure.en;
  const navItems = [
    { href: `/${locale}`, label: dictionary.nav.home },
    { href: `/${locale}/mission`, label: dictionary.nav.mission },
    { href: `/${locale}/open-ena`, label: getOpenEnaNavLabel(locale) },
    { href: `/${locale}/news`, label: dictionary.nav.news },
    { href: `/${locale}/academy`, label: dictionary.nav.academy },
    { href: `/${locale}/about`, label: dictionary.nav.about },
  ];
  const resourceItems = [
    { href: `/${locale}/open-ena`, label: dictionary.common.openWebtool, external: false },
    { href: siteConfig.officialWebtoolUrl, label: "Official webENA", external: true },
    { href: siteConfig.officialResourcesUrl, label: dictionary.common.browseResources, external: true },
    { href: siteConfig.tutorialUrl, label: dictionary.footer.tutorialTitle, external: true },
  ];

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo locale={locale} />
          <p>{dictionary.footer.description}</p>
        </div>
        <div>
          <h2>{dictionary.footer.navigation}</h2>
          <div className="footer-links">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} prefetch={item.href.endsWith("/about") ? false : undefined}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2>{dictionary.footer.primaryResources}</h2>
          <div className="footer-links">
            {resourceItems.map((item) => item.external ? (
              <a key={item.href} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
            ) : (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </div>
        </div>
      </div>
      <details className="footer-privacy-disclosure" open>
        <summary>{privacy.title}</summary>
        {privacy.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <AnalyticsConsentControl copy={privacy.consent} />
      </details>
      <div className="footer-bottom">{dictionary.footer.copyright}</div>
    </footer>
  );
}
