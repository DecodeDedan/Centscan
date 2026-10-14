# Centscan brand

**Name:** Centscan (always written `centscan` in the wordmark and `Centscan` in prose).
**Tagline:** Every Arc contract, priced to the cent.
**One-liner:** Paste an Arc contract address and see whether its source is verified, whether anyone uses it, and what each function actually costs to call, in cents. The verdict is recorded on Arc mainnet.

Visual reference: open [brand-sheet.html](brand-sheet.html) through a local server (`python3 -m http.server` in this folder), because it loads the SVGs by relative path.

## Logo

| File | Use |
|---|---|
| [centscan-logo.svg](centscan-logo.svg) | Default horizontal logo: site header, README header |
| [centscan-logo-tagline.svg](centscan-logo-tagline.svg) | Landing hero, DoraHacks cover, social cards |
| [centscan-logo-tagline-dark.svg](centscan-logo-tagline-dark.svg) | Dark surfaces (slides, video end card) |
| [centscan-mark.svg](centscan-mark.svg) | Favicon, app icon, avatar |
| [centscan-mark-dark.svg](centscan-mark-dark.svg) | Avatar on dark surfaces, X/Farcaster profile |
| [badge-example.svg](badge-example.svg) | Reference design for the README badge the app generates |

**The mark:** an open arc crossed by a vertical bar forms a cent sign (¢). The arc is the C of "cent" and a nod to Arc. The square node on the bar is the reading point of the scan.

**Rules**
- All text in the logo files is converted to outlines, so no font is needed to render them.
- Clear space is the height of the mark's square node on every side.
- Minimum size: 16 px for the mark, 96 px wide for the horizontal logo.
- Never recolour the arc green or the bar ink. Never add shadows, gradients or outlines.
- Do not use Arc's or Circle's logos or brand colours in a way that suggests Centscan is an official product. In copy, use "built on Arc".

Regenerate the SVGs with the generator script (it uses opentype.js and IBM Plex Sans; see `docs/PROMPTS.md`, prompt B1).

## Colour

Light, receipt-paper surfaces with one accent: ledger green. Amber and red appear only as status signals.

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--paper` | `#FAF8F3` | Page background | — |
| `--surface` | `#FFFFFF` | Cards, receipts | — |
| `--ink` | `#14201C` | Text, logo arc, dark surfaces | 15.79:1 on paper |
| `--green` | `#0B6E4F` | Accent: primary actions, pass state, links | 5.89:1 on paper; white on green 6.25:1 |
| `--green-on-ink` | `#3FBF8F` | Accent on dark surfaces | 7.23:1 on ink |
| `--amber` | `#B45309` | Warning or partial state | 4.73:1 on paper |
| `--red` | `#B42318` | Fail state, errors | 6.19:1 on paper |
| `--stone-100` | `#F2EFE8` | Subtle fills, table stripes | — |
| `--stone-300` | `#C9C2B4` | Dividers, card borders (decorative) | — |
| `--stone-500` | `#8A8375` | Input borders, large secondary text | 3.54:1 (UI boundaries and large text only) |
| `--stone-600` | `#5C574D` | Secondary body text, captions | 6.76:1 on paper |

Contrast ratios were computed with the WCAG 2 relative-luminance formula. Status is never shown by colour alone: it always pairs an icon and a word (✓ Verified, ! Partial, ✕ Not found).

## Type

One family: **IBM Plex** (open source, OFL). Use **Sans** for everything and **Mono** for addresses, hashes, gas and selectors.
Use two weights only: 400 Regular and 600 SemiBold.

| Style | Size / line height | Weight |
|---|---|---|
| Display | 40 / 44 | 600 |
| Heading | 24 / 32 | 600 |
| Body | 16 / 24 | 400 |
| Caption | 13 / 20 | 400, stone-600 |
| Data | 14 / 20 Mono | 400 |

## Shape and space
- Radius: 8 px everywhere. Pills use 999 px.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.
- No decorative shadows. Separate surfaces with a 1 px stone-300 border.
- The signature pattern is the **receipt**: a mono, dashed-rule list of line items ending in a total, the same shape as a till receipt. Every report renders as one.

## Motion
- Interaction feedback (hover, press, toggle) takes 200 ms or less.
- One signature moment: when a report finishes, receipt lines print in sequence with a 40 ms stagger (Framer Motion, transform and opacity only). The stylesheet never sets a hidden start state, so the report is fully readable without JavaScript.
- `prefers-reduced-motion` turns all of it off.

## Voice
- Plain, exact, numerate. Say "0.042¢ per transfer", not "ultra-low fees".
- Never claim a check the tool did not run. Write "Not verified on Sourcify", not "Unsafe".
- No hype words: revolutionary, seamless, next-gen, web3-native, unlock.

| Do | Don't |
|---|---|
| "41 calls in the last 24 hours" | "Thriving contract!" |
| "Median cost 0.104¢ across 41 calls" | "Super cheap to use" |
| "Source not verified. Publish it to Sourcify to get a pass." | "This contract is suspicious" |
