import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Variable names avoid the token names (--font-text, --font-mono); globals.css maps tokens onto these.
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-plex-sans", display: "swap" });
const plexCondensed = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["600"], variable: "--font-plex-condensed", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Centscan — Every Arc contract, priced to the cent.",
  description:
    "Paste an Arc contract address and see whether its source is verified, whether anyone uses it, and what each function actually costs to call, in cents. The verdict is recorded on Arc mainnet.",
};

/** Shell shared by the marketing site, (site), and the scanner, (app); each group renders its own chrome. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${plexSans.variable} ${plexCondensed.variable} ${plexMono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
