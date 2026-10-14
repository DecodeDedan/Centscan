"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { DEFAULT_WINDOW_HOURS, type WindowHours } from "@/lib/report";
import styles from "./AddressForm.module.css";
import { Button } from "./Button";
import ui from "./ui.module.css";
import { WindowRadios } from "./WindowPicker";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_DIGITS = 40;

function validate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "Enter a contract address.";
  if (!trimmed.startsWith("0x")) return "An Arc address starts with 0x.";
  if (!ADDRESS_RE.test(trimmed)) return "An Arc address is 0x followed by 40 hex characters (0-9, a-f).";
  return null;
}

/** The live "n/40" readout beside the field, so a truncated paste is visible before submitting. */
function hexCount(value: string): number {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") ? trimmed.length - 2 : 0;
}

export function AddressForm() {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState<WindowHours>(DEFAULT_WINDOW_HOURS);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  const inputId = `${id}-address`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const count = hexCount(address);
  const complete = ADDRESS_RE.test(address.trim());

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validate(address);
    setTouched(true);
    setError(problem);
    if (problem) {
      inputRef.current?.focus();
      return;
    }
    startTransition(() => router.push(`/c/${address.trim().toLowerCase()}?hours=${hours}`));
  }

  const readoutTone = complete ? ui.pass : count > HEX_DIGITS ? ui.fail : undefined;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-busy={pending}>
      <div className={styles.field}>
        <label htmlFor={inputId} className={styles.label}>
          Contract address
        </label>
        <div className={styles.instrument} data-invalid={error ? "true" : undefined}>
          <input
            ref={inputRef}
            id={inputId}
            className={styles.input}
            name="address"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="0x…"
            value={address}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            onChange={(event) => {
              setAddress(event.target.value);
              if (touched) setError(validate(event.target.value));
            }}
          />
          <span className={`${styles.readout} ${readoutTone ?? ""}`} aria-hidden="true">
            {complete && "✓ "}
            {Math.max(count, 0)}/{HEX_DIGITS}
          </span>
        </div>
        <p id={hintId} className={ui.caption}>
          Any Arc mainnet contract, checksummed or lowercase.
        </p>
        {error && (
          <p id={errorId} className={styles.error}>
            <span aria-hidden="true">✕</span> {error}
          </p>
        )}
      </div>

      <div className={styles.controls}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Window</legend>
          <WindowRadios name="hours" value={hours} onChange={setHours} />
        </fieldset>
        <Button type="submit" className={styles.submit} disabled={pending} magnetic>
          {pending ? "Opening report…" : "Scan"}
        </Button>
      </div>
    </form>
  );
}
