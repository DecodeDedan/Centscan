"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { normaliseAddress } from "./chainStatus";
import s from "./Observatory.module.css";

export interface ScanExample {
  address: string;
  label: string;
  detail: string;
  href: string;
}

/** Paste an address, go straight to its report. Validation runs here and again on the server route. */
export function ScanForm({ examples }: { examples: readonly ScanExample[] }) {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get("address") ?? "");
    const result = normaliseAddress(raw);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    startTransition(() => router.push(`/c/${result.address}`));
  }

  return (
    <div className={s.scan}>
      <form className={s.form} onSubmit={handleSubmit} noValidate>
        <label htmlFor={inputId} className={s.formLabel}>
          Arc contract address
        </label>
        <div className={s.formRow}>
          <input
            id={inputId}
            name="address"
            className={s.input}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={66}
            placeholder="0x…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            onChange={() => error && setError(null)}
          />
          <button type="submit" className={s.submit} disabled={isPending} aria-live="polite">
            {isPending ? "Opening…" : "Scan"}
          </button>
        </div>
        {error && (
          <p id={errorId} className={s.formError} role="alert">
            ✕ {error}
          </p>
        )}
        <p id={hintId} className={s.formHint}>
          42 characters, starting 0x. The report opens at /c/&lt;address&gt;.
        </p>
      </form>
      {examples.length > 0 && (
        <div className={s.chips}>
          <p className={s.chipsLabel} id={`${hintId}-chips`}>
            Try a contract
          </p>
          <ul aria-labelledby={`${hintId}-chips`}>
            {examples.map((example) => (
              <li key={example.address}>
                <Link href={example.href} className={s.chip}>
                  <span className={s.chipName}>{example.label}</span>
                  <span className={s.chipDetail}>{example.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
