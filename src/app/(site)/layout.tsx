import Link from "next/link";
import type { ReactNode } from "react";
import { PressLink } from "@/components/site/PressLink";
import "@/styles/tokens.css";
import s from "@/components/site/SiteChrome.module.css";

const NAV = [
  { href: "/#method", label: "Method" },
  { href: "/#proof", label: "Proof" },
  { href: "/#badge", label: "Badge" },
] as const;

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={s.site}>
      <header className={s.header}>
        <div className={s.bar}>
          <Link href="/" className={s.logo}>
            {/* eslint-disable-next-line @next/next/no-img-element -- outlined brand SVG; next/image adds nothing for a vector logo */}
            <img src="/brand/centscan-logo.svg" alt="Centscan home" width={134} height={32} />
          </Link>
          <nav aria-label="Site" className={s.nav}>
            <ul>
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
            <PressLink href="/app" variant="primary">
              Launch app
            </PressLink>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={s.main}>
        {children}
      </main>
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerCta}>
            <p className={s.footerLine}>Paste an address. Get the receipt.</p>
            <PressLink href="/app" variant="primary" isMagnetic>
              Launch app
            </PressLink>
          </div>
          <div className={s.footerMeta}>
            {/* eslint-disable-next-line @next/next/no-img-element -- outlined brand SVG */}
            <img src="/brand/centscan-mark.svg" alt="" width={24} height={24} />
            <p>
              Centscan is built on Arc. It is an independent tool, not an Arc or Circle product. The method, attestation protocol and
              limits are written up in <code>docs/WHITEPAPER.md</code> and <code>docs/ARCHITECTURE.md</code> in the repository.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
