"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import s from "./Sections.module.css";

const STATUS_MS = 2_000;
type CopyState = "idle" | "copied" | "failed";

/** The badge Markdown with a copy button. On a clipboard failure the text stays selectable and the reader is told. */
export function CopySnippet({ value }: { value: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  const isReduced = useReducedMotion();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Permission denied or an insecure context: the status line tells the reader to copy by hand.
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), STATUS_MS);
  }

  return (
    <div className={s.snippetBlock}>
      <pre className={s.snippet} id="badge-markdown">
        <code>{value}</code>
      </pre>
      <div className={s.snippetActions}>
        <motion.button
          type="button"
          className={s.copyButton}
          onClick={handleCopy}
          aria-describedby="badge-markdown"
          whileTap={isReduced ? undefined : { scale: 0.96 }}
          transition={{ type: "spring", stiffness: 600, damping: 34 }}
        >
          Copy Markdown
        </motion.button>
        <span role="status" className={state === "failed" ? s.statusFail : s.status}>
          {state === "copied" && "✓ Copied"}
          {state === "failed" && "✕ Copy failed. Select the text and copy it by hand."}
        </span>
      </div>
    </div>
  );
}
