"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./layout.module.css";

/** Scanner link: the current page on /app, and the section the reader is in on a report. */
export function AppNav() {
  const pathname = usePathname();
  const current = pathname === "/app" ? "page" : pathname.startsWith("/c/") ? "true" : undefined;
  return (
    <nav aria-label="App" className={styles.nav}>
      <Link href="/app" className={styles.navLink} aria-current={current}>
        Scanner
      </Link>
    </nav>
  );
}
