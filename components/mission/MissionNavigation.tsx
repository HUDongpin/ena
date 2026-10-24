"use client";

import { useEffect, useState } from "react";
import type { MissionNavigationCopy } from "@/lib/mission-navigation-copy";
import styles from "./Mission.module.css";

const sectionIds = ["model", "principles", "co-create", "resources"] as const;

export default function MissionNavigation({ copy }: { copy: MissionNavigationCopy }) {
  const [active, setActive] = useState<string>(sectionIds[0]);

  useEffect(() => {
    let frame: number | null = null;
    const sections = sectionIds.map((id) => document.getElementById(id));

    function update() {
      let current: string = sectionIds[0];
      sections.forEach((section, index) => {
        if (section && section.getBoundingClientRect().top <= 145) current = sectionIds[index];
      });
      // The last heading may not reach the activation line before the page ends.
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = sectionIds[sectionIds.length - 1];
      }
      setActive(current);
      frame = null;
    }

    function scheduleUpdate() {
      if (frame === null) frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", scheduleUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const labels = [copy.model, copy.principles, copy.coCreate, copy.resources];
  return (
    <nav className={styles.navigation} aria-label={copy.onThisPage}>
      <p>{copy.onThisPage}</p>
      {sectionIds.map((id, index) => (
        <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined}>
          {labels[index]}
        </a>
      ))}
    </nav>
  );
}
