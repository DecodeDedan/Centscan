// Generates outlined Centscan brand SVGs (text converted to paths so logos render identically everywhere).
// Usage: node brand.mjs <fontDir> <outDir>
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const [fontDir, outDir] = process.argv.slice(2);
const require = createRequire(join(fontDir, "package.json"));
const opentype = require("opentype.js");
const semi = opentype.loadSync(join(fontDir, "IBMPlexSans-SemiBold.ttf"));
const reg = opentype.loadSync(join(fontDir, "IBMPlexSans-Regular.ttf"));

const C = { ink: "#14201C", paper: "#FAF8F3", green: "#0B6E4F", greenOnInk: "#3FBF8F", stone600: "#5C574D", stone300: "#C9C2B4" };
const TAGLINE = "Every Arc contract, priced to the cent.";

// The mark: an open arc (the "C" of cent, and Arc) crossed by a vertical bar — together a cent sign (¢).
// The bar carries a node at the centre: the "reading" point of the scan.
const mark = (x, y, s, arc, bar) => {
  const k = s / 64;
  return `<g transform="translate(${x} ${y}) scale(${k})" fill="none" stroke-linecap="round">
    <path d="M47.32 19.14 A20 20 0 1 0 47.32 44.86" stroke="${arc}" stroke-width="7"/>
    <path d="M34 5 V59" stroke="${bar}" stroke-width="6"/>
    <rect x="29" y="27" width="10" height="10" rx="2" fill="${bar}" stroke="none"/>
  </g>`;
};

const text = (font, str, x, y, size, fill) =>
  `<path d="${font.getPath(str, x, y, size).toPathData(2)}" fill="${fill}"/>`;
const width = (font, str, size) => font.getAdvanceWidth(str, size);

const svg = (w, h, body, title, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">
  <title>${title}</title>${bg ? `\n  <rect width="${w}" height="${h}" fill="${bg}"/>` : ""}
  ${body}
</svg>
`;

const write = (name, content) => writeFileSync(join(outDir, name), content);

// 1. Mark only (app icon / favicon)
write("centscan-mark.svg", svg(64, 64, mark(0, 0, 64, C.ink, C.green), "Centscan"));
write("centscan-mark-dark.svg", svg(64, 64, mark(0, 0, 64, C.paper, C.greenOnInk), "Centscan", C.ink));

// 2. Horizontal logo
const WORD = "centscan", WS = 44;
const logo = (arc, bar, ink) => {
  const ww = width(semi, WORD, WS);
  const w = Math.ceil(64 + 14 + ww + 4);
  return svg(w, 64, mark(0, 0, 64, arc, bar) + text(semi, WORD, 78, 47, WS, ink), "Centscan");
};
write("centscan-logo.svg", logo(C.ink, C.green, C.ink));

// 3. Logo with tagline
const lockup = (arc, bar, ink, sub, bg) => {
  const ww = width(semi, WORD, WS), tw = width(reg, TAGLINE, 15);
  const w = Math.ceil(64 + 14 + Math.max(ww, tw) + 4);
  return svg(w, 84, mark(0, 4, 64, arc, bar) + text(semi, WORD, 78, 44, WS, ink) + text(reg, TAGLINE, 79, 72, 15, sub),
    `Centscan — ${TAGLINE}`, bg);
};
write("centscan-logo-tagline.svg", lockup(C.ink, C.green, C.ink, C.stone600));
write("centscan-logo-tagline-dark.svg", lockup(C.paper, C.greenOnInk, C.paper, C.stone300, C.ink));

// 4. README badge example (the app renders these dynamically; this is the reference design)
const badge = (value) => {
  const label = "centscan", ls = 11;
  const lw = Math.ceil(22 + width(semi, label, ls) + 8), vw = Math.ceil(width(semi, value, ls) + 16);
  return svg(lw + vw, 22, `<clipPath id="r"><rect width="${lw + vw}" height="22" rx="4"/></clipPath>
  <g clip-path="url(#r)"><rect width="${lw}" height="22" fill="${C.ink}"/><rect x="${lw}" width="${vw}" height="22" fill="${C.green}"/></g>
  ${mark(4, 3, 16, C.paper, C.greenOnInk)}
  ${text(semi, label, 22, 15, ls, C.paper)}
  ${text(semi, value, lw + 8, 15, ls, "#FFFFFF")}`, `centscan: ${value}`);
};
write("badge-example.svg", badge("verified · live · 0.04¢/call"));
console.log("ok");
