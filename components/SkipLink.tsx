"use client";

import { useEffect, useState, type MouseEvent } from "react";

const WORKSPACE_TARGET_ID = "open-ena-workspace";

/**
 * The only skip link in the locale shell. Server HTML keeps "Skip to content"
 * and #main-content, which is correct for every page that is not the signed-in
 * workspace. Once the workspace landmark is in the tree the same link points at
 * it, including when that landmark renders after the shell. Login has no
 * landmark, so it keeps #main-content, and the workspace does not render a
 * second skip link.
 */
export function SkipLink({
  skipToContent,
  skipToWorkspace,
}: {
  skipToContent: string;
  skipToWorkspace: string;
}) {
  const [workspaceLabel, setWorkspaceLabel] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const workspace = document.getElementById(WORKSPACE_TARGET_ID);
      setWorkspaceLabel(workspace instanceof HTMLElement ? workspace.dataset.skipLabel || skipToWorkspace : null);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [skipToWorkspace]);

  const targetId = workspaceLabel ? WORKSPACE_TARGET_ID : "main-content";
  const label = workspaceLabel ?? skipToContent;

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const workspace = document.getElementById(WORKSPACE_TARGET_ID);
    const target = workspace instanceof HTMLElement ? workspace : document.getElementById("main-content");
    if (!(target instanceof HTMLElement) || target.tabIndex < 0) return;
    event.preventDefault();
    target.focus();
  }

  return (
    <a href={`#${targetId}`} className="skip-link" onClick={onClick}>
      {label}
    </a>
  );
}
