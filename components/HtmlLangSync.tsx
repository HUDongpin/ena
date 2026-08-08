"use client";

import { useEffect } from "react";

interface HtmlLangSyncProps {
  lang: string;
  dir: "ltr" | "rtl";
}

export default function HtmlLangSync({ lang, dir }: HtmlLangSyncProps) {
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [dir, lang]);

  return null;
}
