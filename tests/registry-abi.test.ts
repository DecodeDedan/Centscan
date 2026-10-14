import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registryAbi } from "@/lib/registry";

const ARTIFACT = join(__dirname, "..", "contracts", "out", "CentscanRegistry.sol", "CentscanRegistry.json");

const param = z.object({ name: z.string(), type: z.string(), indexed: z.boolean().optional() });
const item = z.object({
  type: z.string(),
  name: z.string().optional(),
  stateMutability: z.string().optional(),
  anonymous: z.boolean().optional(),
  inputs: z.array(param).optional(),
  outputs: z.array(param).optional(),
});
type AbiItem = z.infer<typeof item>;

/** Order-insensitive comparison key: kind, name, mutability and the typed parameter lists. */
function normalise(items: readonly AbiItem[]): string[] {
  const params = (ps: AbiItem["inputs"]): string =>
    (ps ?? []).map((p) => `${p.type} ${p.name}${p.indexed ? " indexed" : ""}`).join(", ");
  return items
    .map((i) => `${i.type} ${i.name ?? ""}(${params(i.inputs)}) ${i.stateMutability ?? ""} -> (${params(i.outputs)})`)
    .sort();
}

describe("registryAbi", () => {
  it("matches the compiled CentscanRegistry artifact", () => {
    // Arrange
    const artifact = z.object({ abi: z.array(item) }).parse(JSON.parse(readFileSync(ARTIFACT, "utf8")));
    const local = z.array(item).parse(registryAbi);

    // Act / Assert
    expect(normalise(local)).toEqual(normalise(artifact.abi));
  });
});
