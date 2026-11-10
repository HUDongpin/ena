import type { Locale } from "@/lib/i18n";
import ar from "./locales/ar.json";
import bn from "./locales/bn.json";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import hi from "./locales/hi.json";
import id from "./locales/id.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import zhHans from "./locales/zh-hans.json";
import zhHant from "./locales/zh-hant.json";

export type NovaCopy = typeof en;

const dictionaries: Record<Locale, NovaCopy> = {
  en, "zh-hans": zhHans, "zh-hant": zhHant, es, fr, pt, de, ar, ko, ja, hi, ru, id, bn,
};

export function getNovaCopy(locale: Locale): NovaCopy {
  return dictionaries[locale];
}
