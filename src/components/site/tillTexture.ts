import type { TillLine, TillReceipt, TillTone } from "./tillReceipt";

/**
 * Lays the hero receipt out for the 3D till's paper texture and paints it with the canvas 2D API.
 * Layout is pure (text measuring is injected) so it is testable without a canvas; painting is a thin pass over the ops.
 * Sizes are canvas pixels in a 1024-wide design space: CSS tokens cannot reach a texture, so they live here.
 */

export type FontRole = "mono" | "sans";
export type InkRole = "text" | "muted" | "accent" | "accentText" | "warning" | "danger";

export interface FontSpec {
  role: FontRole;
  weight: 400 | 600;
  size: number;
}

export type MeasureText = (text: string, font: FontSpec) => number;

export type PaintOp =
  | { kind: "mark"; x: number; y: number; size: number }
  | { kind: "text"; x: number; y: number; text: string; font: FontSpec; ink: InkRole; align: "left" | "right" }
  | { kind: "rule"; y: number };

export interface ReceiptLayout {
  width: number;
  height: number;
  /** Bottom of the printed head (mark, title, caption): the paper the till shows before any scrolling. */
  headBottom: number;
  ops: PaintOp[];
  /** Centre of the rubber stamp over the total, or null when the report is not attested. */
  stampCenter: { x: number; y: number } | null;
}

export const PAPER_WIDTH = 1024;
const PAD_X = 72;
const TOP = 72;
const INNER = PAPER_WIDTH - 2 * PAD_X;
const MARK = 72;
const ROW = { role: "mono", weight: 400, size: 32 } as const satisfies FontSpec;
const ROW_HEIGHT = 56;
const COLUMN_GAP = 32;
const RULE_HEIGHT = 40;
const TITLE = { role: "sans", weight: 600, size: 46 } as const satisfies FontSpec;
const CAPTION = { role: "mono", weight: 400, size: 26 } as const satisfies FontSpec;
const TOTAL_TERM = { role: "sans", weight: 600, size: 32 } as const satisfies FontSpec;
const TOTAL_VALUE = { role: "mono", weight: 600, size: 104 } as const satisfies FontSpec;
const TOTAL_SUB = { role: "mono", weight: 400, size: 28 } as const satisfies FontSpec;
const FOOTER = { role: "mono", weight: 400, size: 28 } as const satisfies FontSpec;
/** Blank paper under the last line: room for the stamp's lower edge and the stretch still inside the slot. */
const TAIL = 150;
const ELLIPSIS = "…";

const TONE_INK: Record<TillTone, InkRole> = {
  plain: "text",
  pass: "accentText",
  warn: "warning",
  fail: "danger",
  unknown: "muted",
};

/** Shortens text from the end until it fits, keeping at least the ellipsis. */
export function fitText(text: string, maxWidth: number, font: FontSpec, measure: MeasureText): string {
  if (measure(text, font) <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && measure(text.slice(0, end) + ELLIPSIS, font) > maxWidth) end -= 1;
  return text.slice(0, end) + ELLIPSIS;
}

/** Splits footer prose into lines that fit, word by word; a single word longer than the line is fitted with an ellipsis. */
export function wrapWords(words: readonly string[], maxWidth: number, font: FontSpec, measure: MeasureText): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, font) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = fitText(word, maxWidth, font, measure);
  }
  if (current) lines.push(current);
  return lines;
}

function rowOps(line: Extract<TillLine, { kind: "row" }>, y: number, measure: MeasureText): PaintOp[] {
  const valueText = line.mark ? `${line.mark} ${line.value}` : line.value;
  // The value is the number the reader came for: it keeps up to two thirds of the line, the term gets the rest.
  const value = fitText(valueText, (INNER * 2) / 3, ROW, measure);
  const termRoom = INNER - measure(value, ROW) - COLUMN_GAP;
  const term = fitText(line.term, termRoom, ROW, measure);
  return [
    { kind: "text", x: PAD_X, y, text: term, font: ROW, ink: "muted", align: "left" },
    { kind: "text", x: PAPER_WIDTH - PAD_X, y, text: value, font: ROW, ink: TONE_INK[line.tone], align: "right" },
  ];
}

export function layoutReceipt(receipt: TillReceipt, measure: MeasureText): ReceiptLayout {
  const ops: PaintOp[] = [];
  let y = TOP;

  ops.push({ kind: "mark", x: PAD_X, y, size: MARK });
  const textX = PAD_X + MARK + 24;
  ops.push({ kind: "text", x: textX, y: y + 44, text: fitText(receipt.title, PAPER_WIDTH - PAD_X - textX, TITLE, measure), font: TITLE, ink: "text", align: "left" });
  ops.push({ kind: "text", x: textX, y: y + 82, text: fitText(receipt.caption, PAPER_WIDTH - PAD_X - textX, CAPTION, measure), font: CAPTION, ink: "muted", align: "left" });
  y += MARK + 32;
  ops.push({ kind: "rule", y });
  const headBottom = y;
  y += RULE_HEIGHT;

  let totalBaseline: number | null = null;
  for (const line of receipt.lines) {
    switch (line.kind) {
      case "rule":
        ops.push({ kind: "rule", y: y + RULE_HEIGHT / 2 - ROW_HEIGHT / 4 });
        y += RULE_HEIGHT;
        break;
      case "row":
        y += ROW_HEIGHT;
        ops.push(...rowOps(line, y - 18, measure));
        break;
      case "total": {
        y += TOTAL_VALUE.size + 8;
        totalBaseline = y;
        const value = fitText(line.value, INNER * 0.7, TOTAL_VALUE, measure);
        const term = fitText(line.term, INNER - measure(value, TOTAL_VALUE) - COLUMN_GAP, TOTAL_TERM, measure);
        ops.push({ kind: "text", x: PAD_X, y, text: term, font: TOTAL_TERM, ink: "text", align: "left" });
        ops.push({ kind: "text", x: PAPER_WIDTH - PAD_X, y, text: value, font: TOTAL_VALUE, ink: "accent", align: "right" });
        if (line.sub) {
          y += 48;
          ops.push({ kind: "text", x: PAPER_WIDTH - PAD_X, y, text: fitText(line.sub, INNER, TOTAL_SUB, measure), font: TOTAL_SUB, ink: "muted", align: "right" });
        }
        y += 16;
        break;
      }
      case "footer": {
        y += 24;
        for (const text of wrapWords(line.text.split(" "), INNER, FOOTER, measure)) {
          y += 44;
          ops.push({ kind: "text", x: PAD_X, y, text, font: FOOTER, ink: "muted", align: "left" });
        }
        y += 44;
        ops.push({ kind: "text", x: PAD_X, y, text: fitText(line.linkText, INNER, FOOTER, measure), font: FOOTER, ink: "accentText", align: "left" });
        break;
      }
    }
  }

  const height = Math.ceil(y + TAIL);
  const stampCenter = receipt.stamp ? { x: PAPER_WIDTH - PAD_X - 230, y: (totalBaseline ?? y) - 150 } : null;
  return { width: PAPER_WIDTH, height, headBottom, ops, stampCenter };
}

export interface ReceiptPalette {
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  warning: string;
  danger: string;
  rule: string;
}

export interface FontFamilies {
  mono: string;
  sans: string;
}

export const cssFont = (font: FontSpec, families: FontFamilies): string => `${font.weight} ${font.size}px ${families[font.role]}`;

/** Paints the ink only: the paper colour and grain come from the shader, so the canvas stays transparent. */
export function paintReceipt(
  ctx: CanvasRenderingContext2D,
  layout: ReceiptLayout,
  palette: ReceiptPalette,
  families: FontFamilies,
  mark: CanvasImageSource | null,
): void {
  ctx.textBaseline = "alphabetic";
  for (const op of layout.ops) {
    switch (op.kind) {
      case "mark":
        if (mark) ctx.drawImage(mark, op.x, op.y, op.size, op.size);
        break;
      case "rule":
        ctx.save();
        ctx.strokeStyle = palette.rule;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(PAD_X, op.y);
        ctx.lineTo(PAPER_WIDTH - PAD_X, op.y);
        ctx.stroke();
        ctx.restore();
        break;
      case "text":
        ctx.font = cssFont(op.font, families);
        ctx.fillStyle = palette[op.ink];
        ctx.textAlign = op.align;
        ctx.fillText(op.text, op.x, op.y);
        break;
    }
  }
}

export const STAMP_SIZE = { width: 460, height: 190 } as const;

/** The rubber stamp: the one place caps are allowed, because a real stamp is caps. */
export function paintStamp(ctx: CanvasRenderingContext2D, color: string, txShort: string, families: FontFamilies): void {
  const { width, height } = STAMP_SIZE;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 7;
  ctx.strokeRect(14, 14, width - 28, height - 28);
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, width - 56, height - 56);
  ctx.textAlign = "center";
  ctx.font = cssFont({ role: "sans", weight: 600, size: 44 }, families);
  ctx.letterSpacing = "4px";
  ctx.fillText("ATTESTED ON ARC", width / 2, 102);
  ctx.letterSpacing = "0px";
  ctx.font = cssFont({ role: "mono", weight: 400, size: 28 }, families);
  ctx.fillText(txShort, width / 2, 146);
}
