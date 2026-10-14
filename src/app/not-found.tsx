import Link from "next/link";
import ui from "@/components/ui.module.css";
import styles from "./not-found.module.css";

/** Rendered under the bare root layout, so it carries its own minimal chrome. */
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className={styles.page}>
      <Link href="/" className={styles.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static vector mark; next/image adds nothing for SVG */}
        <img src="/brand/centscan-mark-dark.svg" alt="" width={32} height={32} className={styles.mark} />
        <span>centscan</span>
        <span className="visually-hidden"> home</span>
      </Link>
      <p className={styles.code}>404 · no receipt</p>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.text}>There is nothing at this address. To price a contract, paste its address into the scanner.</p>
      <Link className={`${ui.button} ${ui.primary}`} href="/app">
        Open the scanner
      </Link>
    </main>
  );
}
