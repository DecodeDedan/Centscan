import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "@/server/arc/client";
import { CHAIN_STATUS_TTL_MS, createChainStatusReader, toChainStatus } from "@/server/chain";

const block = (n: bigint, baseFee: bigint | null) => ({ number: n, baseFeePerGas: baseFee, timestamp: 1_791_979_100n });

describe("toChainStatus", () => {
  it("prices a 21,000-gas transfer at Arc's 20 gwei floor as 420 µ$ (0.042¢)", () => {
    expect(toChainStatus(block(25_920_512n, 20_000_000_000n))).toEqual({
      blockNumber: "25920512",
      baseFeeGwei: "20",
      timestamp: 1_791_979_100,
      transferMicroUsd: "420",
    });
  });

  it("keeps fractional gwei exact and treats a missing base fee as zero", () => {
    expect(toChainStatus(block(1n, 24_000_001_249n)).baseFeeGwei).toBe("24.000001249");
    expect(toChainStatus(block(1n, null))).toMatchObject({ baseFeeGwei: "0", transferMicroUsd: "0" });
  });
});

describe("createChainStatusReader", () => {
  it("shares one RPC read between concurrent callers and caches it for the TTL", async () => {
    // Arrange
    let t = 0;
    const getBlock = vi.fn(async () => block(10n, 20_000_000_000n));
    const read = createChainStatusReader(async () => ({ getBlock }) as unknown as ArcClient, () => t);

    // Act
    const [a, b] = await Promise.all([read(), read()]);
    t = CHAIN_STATUS_TTL_MS - 1;
    await read();
    t = CHAIN_STATUS_TTL_MS + 1;
    await read();

    // Assert
    expect(a).toEqual(b);
    expect(getBlock).toHaveBeenCalledTimes(2);
  });

  it("propagates RPC failures and retries on the next call", async () => {
    const getBlock = vi.fn().mockRejectedValueOnce(new Error("rate limit")).mockResolvedValue(block(11n, 20_000_000_000n));
    const read = createChainStatusReader(async () => ({ getBlock }) as unknown as ArcClient);

    await expect(read()).rejects.toThrow("rate limit");
    await expect(read()).resolves.toMatchObject({ blockNumber: "11" });
  });
});
