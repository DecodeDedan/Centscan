import { keccak256, stringToBytes } from "viem";
import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalJson } from "@/lib/canonical";
import { makeReport } from "./helpers/report";

describe("canonicalJson", () => {
  it("sorts object keys recursively and emits no whitespace", () => {
    // Arrange
    const value = { b: 1, a: { d: [3, 1], c: "x" } };

    // Act
    const json = canonicalJson(value);

    // Assert
    expect(json).toBe('{"a":{"c":"x","d":[3,1]},"b":1}');
  });

  it("keeps array order and serialises primitives exactly like JSON", () => {
    expect(canonicalJson([true, null, "é\n", 1.5, -0, [{ z: 1, y: 2 }]])).toBe('[true,null,"é\\n",1.5,0,[{"y":2,"z":1}]]');
  });

  it("orders keys by UTF-16 code unit, not locale", () => {
    expect(canonicalJson({ b: 1, B: 2, a: 3, _: 4 })).toBe('{"B":2,"_":4,"a":3,"b":1}');
  });

  it.each([
    ["undefined", undefined],
    ["a bigint", 1n],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a function", () => 1],
    ["a nested undefined", { a: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });
});

describe("canonicalHash", () => {
  it("is keccak256 of the canonical UTF-8 bytes", () => {
    expect(canonicalHash({ b: 2, a: 1 })).toBe(keccak256(stringToBytes('{"a":1,"b":2}')));
  });

  it("does not depend on key insertion order", () => {
    // Arrange
    const report = makeReport();
    const reordered = Object.fromEntries(Object.entries(report).reverse());

    // Act / Assert
    expect(canonicalHash(reordered)).toBe(canonicalHash(report));
  });

  it("changes when any value changes", () => {
    const report = makeReport();
    const changed = makeReport({ reverted: { calls: 1, totalMicroUsd: "1" } });
    expect(canonicalHash(changed)).not.toBe(canonicalHash(report));
  });
});
