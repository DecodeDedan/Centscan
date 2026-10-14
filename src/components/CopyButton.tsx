"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import ui from "./ui.module.css";

const COPY_STATUS_MS = 2_000;

type CopyState = "idle" | "copied" | "failed";

type Props = {
  value: string;
  /** Accessible name, e.g. "Copy address". */
  label: string;
  /** Shown when copying fails; the value stays selectable on the page. */
  failHint?: string;
};

export function CopyButton({ value, label, failHint = "Copy failed. Select the text and copy it by hand." }: Props) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Clipboard permission denied or insecure context: the failure is shown, not swallowed.
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), COPY_STATUS_MS);
  }

  return (
    <span className={ui.copy}>
      <Button variant="ghost" onClick={copy} aria-label={label} className={ui.compact}>
        {state === "copied" ? "Copied" : "Copy"}
      </Button>
      <span role="status" className={state === "failed" ? `${ui.status} ${ui.fail}` : ui.status}>
        {state === "copied" && <span className="visually-hidden">Copied to clipboard</span>}
        {state === "failed" && (
          <>
            <span aria-hidden="true">✕</span> {failHint}
          </>
        )}
      </span>
    </span>
  );
}
