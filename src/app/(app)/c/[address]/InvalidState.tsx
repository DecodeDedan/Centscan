import Link from "next/link";
import ui from "@/components/ui.module.css";
import styles from "./state.module.css";

type Props = {
  title: string;
  message: string;
  /** What the reader typed, echoed back (React escapes it) so they can spot the typo. */
  detail: string | null;
};

export function InvalidState({ title, message, detail }: Props) {
  return (
    <section className={styles.state} aria-labelledby="state-title">
      <h1 id="state-title" className={styles.title}>
        <span className={ui.fail} aria-hidden="true">
          ✕
        </span>{" "}
        {title}
      </h1>
      {detail && (
        <p className={styles.detail}>
          <span className="visually-hidden">You entered: </span>
          {detail}
        </p>
      )}
      <p>{message}</p>
      <Link className={`${ui.button} ${ui.primary}`} href="/app">
        Scan another address
      </Link>
    </section>
  );
}
