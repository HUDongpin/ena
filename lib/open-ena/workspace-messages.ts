import type { Locale } from "../i18n";
import zhHant from "./workspace-locales/zh-hant.json";
import zhHans from "./workspace-locales/zh-hans.json";
import es from "./workspace-locales/es.json";
import fr from "./workspace-locales/fr.json";
import pt from "./workspace-locales/pt.json";
import de from "./workspace-locales/de.json";
import ar from "./workspace-locales/ar.json";
import ko from "./workspace-locales/ko.json";
import ja from "./workspace-locales/ja.json";
import hi from "./workspace-locales/hi.json";
import ru from "./workspace-locales/ru.json";
import id from "./workspace-locales/id.json";
import bn from "./workspace-locales/bn.json";

const dictionaries: Partial<Record<Locale, Readonly<Record<string, string>>>> = {
  "zh-hant": zhHant, "zh-hans": zhHans, es, fr, pt, de, ar, ko, ja, hi, ru, id, bn,
};

/** Only fixed UI templates enter this lookup. Insert user text after translation. */
export function workspaceMessage(locale: Locale, template: string, values?: Readonly<Record<string, string | number>>): string {
  const dictionary = dictionaries[locale];
  const message = dictionary && Object.hasOwn(dictionary, template) ? dictionary[template] : template;
  if (!values) return message;
  return message.replace(/\{(\w+)\}/gu, (token, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : token);
}

/** Translate display copy only. Object keys, callbacks and other typed values retain their meaning. */
export function localizeWorkspaceCopy<T>(locale: Locale, value: T): T {
  if (typeof value === "string") return workspaceMessage(locale, value) as T;
  if (Array.isArray(value)) return value.map(entry => localizeWorkspaceCopy(locale, entry)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
      [key, localizeWorkspaceCopy(locale, entry)])) as T;
  }
  return value;
}
