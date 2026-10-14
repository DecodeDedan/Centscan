import Link from "next/link";
import type { ReactNode } from "react";
import { MotionRoot } from "@/components/MotionRoot";
import { AppNav } from "./AppNav";
import styles from "./layout.module.css";

/** Chrome for the scanner surface (/app and /c/*): a slim app bar, the main region, a footer line. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MotionRoot>
      <div className={styles.shell}>
        <header className={styles.bar}>
          <div className={styles.barInner}>
            <Link href="/" className={styles.brand}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static vector mark; next/image adds nothing for SVG */}
              <img src="/brand/centscan-mark.svg" alt="" width={24} height={24} className={styles.mark} />
              <span className={styles.wordmark}>centscan</span>
              <span className="visually-hidden"> home</span>
            </Link>
            <AppNav />
          </div>
        </header>
        <main id="main" tabIndex={-1} className={styles.main}>
          {children}
        </main>
        <footer className={styles.footer}>
          <p className={styles.footerInner}>
            Centscan prices Arc contracts from real transaction receipts, never estimates. Built on Arc; not an official Arc or Circle product.
          </p>
        </footer>
      </div>
    </MotionRoot>
  );
}
