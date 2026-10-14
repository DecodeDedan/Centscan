"use client";

import Link from "next/link";
import { Button } from "@/components/Button";
import ui from "@/components/ui.module.css";
import styles from "./state.module.css";

export default function ReportError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className={styles.state} role="alert" aria-labelledby="report-crash-title">
      <h1 id="report-crash-title" className={styles.title}>
        <span className={ui.fail} aria-hidden="true">
          ✕
        </span>{" "}
        This report could not be shown
      </h1>
      <p>Something went wrong while loading it. Retry, or scan another address.</p>
      <div className={ui.copy}>
        <Button onClick={reset}>Retry</Button>
        <Link className={`${ui.button} ${ui.secondary}`} href="/app">
          Scan another address
        </Link>
      </div>
    </section>
  );
}
