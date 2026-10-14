import { formatMicroUsd } from "@/lib/format";
import type { Report } from "@/lib/report";

const INK = "#14201C";
const PAPER = "#FAF8F3";
const GREEN_ON_INK = "#3FBF8F";
const TONE = { pass: "#0B6E4F", warn: "#B45309", fail: "#B42318", none: "#5C574D" } as const;

const LABEL = "centscan";
const HEIGHT = 20;
const MARK_WIDTH = 18;
const PADDING = 6;
/** Verdana 11px averages ~6.3 px per glyph; textLength pins the drawn width to the box either way. */
const CHAR_WIDTH = 6.3;

export interface BadgeContent {
  value: string;
  tone: keyof typeof TONE;
}

const escapeXml = (text: string): string =>
  text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string);

/** "verified · live · 0.111¢/call", toned by the weakest verdict. */
export function badgeContent(report: Report | null): BadgeContent {
  if (!report) return { value: "not scanned", tone: "none" };
  const source = { pass: "verified", warn: "verified?", fail: "unverified", unknown: "source unknown" }[report.source.verdict];
  const activity = { pass: "live", warn: "quiet", fail: "no calls", unknown: "activity unknown" }[report.activity.verdict];
  const parts = [source, activity];
  if (report.headline.medianMicroUsd !== null) parts.push(`${formatMicroUsd(report.headline.medianMicroUsd)}/call`);
  const verdicts = [report.source.verdict, report.activity.verdict];
  const tone = verdicts.includes("fail") ? "fail" : verdicts.every((v) => v === "pass") ? "pass" : "warn";
  return { value: parts.join(" · "), tone };
}

const textWidth = (text: string): number => Math.round(text.length * CHAR_WIDTH);

/** Shields-style SVG: ink label with the cent mark, verdict-toned value. All text is XML-escaped. */
export function renderBadge({ value, tone }: BadgeContent): string {
  const labelWidth = MARK_WIDTH + textWidth(LABEL) + PADDING * 2;
  const valueWidth = textWidth(value) + PADDING * 2;
  const width = labelWidth + valueWidth;
  const title = escapeXml(`${LABEL}: ${value}`);
  const text = (x: number, content: string): string =>
    `<text x="${x}" y="14" textLength="${textWidth(content)}" lengthAdjust="spacingAndGlyphs">${escapeXml(content)}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    `<clipPath id="r"><rect width="${width}" height="${HEIGHT}" rx="4"/></clipPath>`,
    `<g clip-path="url(#r)"><rect width="${labelWidth}" height="${HEIGHT}" fill="${INK}"/><rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${TONE[tone]}"/></g>`,
    `<g transform="translate(4 2) scale(0.25)" fill="none" stroke-linecap="round">`,
    `<path d="M47.32 19.14 A20 20 0 1 0 47.32 44.86" stroke="${PAPER}" stroke-width="7"/>`,
    `<path d="M34 5 V59" stroke="${GREEN_ON_INK}" stroke-width="6"/>`,
    `<rect x="29" y="27" width="10" height="10" rx="2" fill="${GREEN_ON_INK}" stroke="none"/></g>`,
    `<g font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" fill="#FFFFFF">`,
    text(MARK_WIDTH + PADDING, LABEL),
    text(labelWidth + PADDING, value),
    `</g></svg>`,
  ].join("");
}
