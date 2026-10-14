"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type RefObject } from "react";
import { DEFAULT_WINDOW_HOURS, type WindowHours } from "@/lib/report";
import styles from "./AddressForm.module.css";
import { Button } from "./Button";
import { ExampleChips } from "./ExampleChips";
import type { ScanExample } from "./examples";
import ui from "./ui.module.css";
import { WindowRadios } from "./WindowPicker";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_DIGITS = 40;
/** How long each example address stays in the empty field's placeholder. */
const PLACEHOLDER_CYCLE_MS = 2_600;

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

/** Cycles real example addresses through the placeholder while the field is empty and unfocused. */
function useCyclingPlaceholder(examples: readonly ScanExample[], paused: boolean): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused || examples.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % examples.length), PLACEHOLDER_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [paused, examples.length]);
  return examples[index % Math.max(1, examples.length)]?.address ?? "0x…";
}

/** "/" focuses the command bar from anywhere on the page, unless the reader is already typing somewhere. */
function useSlashFocus(target: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable)) return;
      event.preventDefault();
      target.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target]);
}

export function AddressForm({ examples }: { examples: readonly ScanExample[] }) {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState<WindowHours>(DEFAULT_WINDOW_HOURS);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pending, startTransition] = useTransition();
  const placeholder = useCyclingPlaceholder(examples, focused || address !== "");
  useSlashFocus(inputRef);

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
        <div className={styles.labelRow}>
          <label htmlFor={inputId} className={styles.label}>
            Contract address
          </label>
          <span className={styles.shortcut} aria-hidden="true">
            press <kbd>/</kbd> to focus
          </span>
        </div>
        <div className={styles.bar} data-invalid={error ? "true" : undefined}>
          <span className={styles.prompt} aria-hidden="true">
            ›
          </span>
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
            placeholder={placeholder}
            value={address}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              setAddress(event.target.value);
              if (touched) setError(validate(event.target.value));
            }}
          />
          <span className={`${styles.readout} ${readoutTone ?? ""}`} aria-hidden="true">
            {complete && "✓ "}
            {Math.max(count, 0)}/{HEX_DIGITS}
          </span>
          <Button type="submit" className={styles.submit} disabled={pending} magnetic>
            {pending ? "Opening…" : "Scan"}
          </Button>
        </div>
        <p id={hintId} className={ui.caption}>
          Any Arc mainnet contract, checksummed or lowercase. The placeholder cycles real addresses you can try.
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
        {examples.length > 0 && (
          <div className={styles.examples}>
            <p className={styles.legend} id={`${id}-examples`}>
              Try
            </p>
            <ExampleChips examples={examples} hours={hours} labelledBy={`${id}-examples`} />
          </div>
        )}
      </div>
    </form>
  );
}
