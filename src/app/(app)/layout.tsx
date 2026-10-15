import Link from "next/link";
import type { ReactNode } from "react";
import { ChainTicker } from "@/components/ChainTicker";
import { MotionRoot } from "@/components/MotionRoot";
import { AppNav } from "./AppNav";
import styles from "./layout.module.css";

/** Chrome for the scanner console (/app and /c/*): an app bar with the live chain ticker, the main region, a footer line. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MotionRoot>
      <div className={styles.shell}>
        <header className={styles.bar}>
          <div className={styles.barInner}>
            <Link href="/" className={styles.brand}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static vector mark; next/image adds nothing for SVG */}
              <img src="/brand/centscan-mark-dark.svg" alt="" width={24} height={24} className={styles.mark} />
              <span className={styles.wordmark}>centscan</span>
              <span className="visually-hidden"> home</span>
            </Link>
            <AppNav />
            <ChainTicker />
          </div>
        </header>
        <main id="main" tabIndex={-1} className={styles.main}>
          {children}
        </main>
        <footer className={styles.footer}>
          <p className={styles.footerInner}>
            Centscan prices Arc contracts from real transaction receipts, never estimates. Built on Arc; not an official Arc or Circle product. Built by <a href="https://okwaretech.com" target="_blank" rel="noopener noreferrer">okwaretech.com</a>.
          </p>
        </footer>
      </div>
    </MotionRoot>
  );
}
