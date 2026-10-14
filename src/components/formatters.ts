import { formatInt, formatMicroUsd } from "@/lib/format";

/** CountUp formatters: a spring passes through fractions, real readouts never show them. */
export const microUsdText = (value: number): string => formatMicroUsd(BigInt(Math.max(0, Math.round(value))));
export const intText = (value: number): string => formatInt(Math.max(0, Math.round(value)));
