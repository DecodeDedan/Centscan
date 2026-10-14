import { describe, expect, it } from "vitest";
import { scrambleFrame } from "@/components/scramble";

const ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11";

describe("scrambleFrame", () => {
  it("keeps the prefix and revealed digits real and fills the rest with hex", () => {
    const frame = scrambleFrame(ADDRESS, 4, () => 0.99);
    expect(frame).toHaveLength(ADDRESS.length);
    expect(frame.slice(0, 6)).toBe("0xca11");
    expect(frame.slice(6)).toMatch(/^f+$/);
  });

  it("resolves to the target once every digit is revealed, and clamps", () => {
    expect(scrambleFrame(ADDRESS, 40, Math.random)).toBe(ADDRESS);
    expect(scrambleFrame(ADDRESS, 99, Math.random)).toBe(ADDRESS);
    expect(scrambleFrame(ADDRESS, -3, () => 0)).toBe(`0x${"0".repeat(40)}`);
  });
});
