import { describe, expect, it } from "vitest";
import { explorerAddress, explorerTx, formatInt, formatMicroUsd, formatUsd, shortHex } from "@/lib/format";

describe("formatMicroUsd", () => {
  it.each([
    [0n, "0¢"],
    ["0", "0¢"],
    [4399n, "0.440¢"],
    ["4399", "0.440¢"],
    [1n, "0.000100¢"],
    [123_456n, "12.3¢"],
    [999_999n, "$1.00"],
    [1_000_000n, "$1.00"],
    [123_456_789n, "$123.46"],
  ])("formats %s µ$ as %s", (input, expected) => {
    expect(formatMicroUsd(input)).toBe(expected);
  });

  it("throws on a non-integer string", () => {
    expect(() => formatMicroUsd("1.5")).toThrow(SyntaxError);
  });
});

describe("formatUsd", () => {
  it.each([
    ["0.440000", "$0.44"],
    ["0.004399", "<$0.01"],
    ["0", "$0.00"],
    ["12.345", "$12.35"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatUsd(input)).toBe(expected);
  });
});

describe("formatInt", () => {
  it("groups thousands for numbers and decimal strings", () => {
    expect(formatInt(1234567)).toBe("1,234,567");
    expect(formatInt("25920512")).toBe("25,920,512");
    expect(formatInt(0)).toBe("0");
  });
});

describe("shortHex", () => {
  it("elides the middle of long values", () => {
    expect(shortHex("0x3600000000000000000000000000000000000000")).toBe("0x3600…0000");
    expect(shortHex("0x1234567890", 4, 2)).toBe("0x12…90");
  });

  it("returns values that would not get shorter unchanged", () => {
    expect(shortHex("0x12345678")).toBe("0x12345678");
    expect(shortHex("0x123456789")).toBe("0x123456789");
  });
});

describe("explorer links", () => {
  it("points at the Arc explorer", () => {
    expect(explorerTx("0xabc")).toBe("https://explorer.arc.io/tx/0xabc");
    expect(explorerAddress("0xdef")).toBe("https://explorer.arc.io/address/0xdef");
  });
});
