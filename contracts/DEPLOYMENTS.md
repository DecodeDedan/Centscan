# Deployments

## Arc mainnet (chain 5042)

| | |
|---|---|
| Contract | `CentscanRegistry` |
| Address | [`0x4b0376Ec9712A7341F5903aeCC725B2a94f30F50`](https://explorer.arc.io/address/0x4b0376Ec9712A7341F5903aeCC725B2a94f30F50) |
| Deploy tx | [`0x3615f792ef020f450c2e482f428b7b55d9380cf9e8d25de26f21cfe5f4a68387`](https://explorer.arc.io/tx/0x3615f792ef020f450c2e482f428b7b55d9380cf9e8d25de26f21cfe5f4a68387) |
| Block | 26,004,839 |
| Deployed | 15 Oct 2026 |
| Gas | 353,122 at 20.000001041 gwei = 0.007062 USDC (0.71¢) |
| Source verification | Sourcify **exact match** (creation and runtime): [sourcify.dev lookup](https://sourcify.dev/#/lookup/0x4b0376Ec9712A7341F5903aeCC725B2a94f30F50) |
| Compiler | Solidity 0.8.30, built with Arc Foundry (`arc-forge`) |

The deployer was a single-use key. The registry has no owner, so the deployer holds no privileges over it.

## Attestations (15 Oct 2026)

| Contract | Median call | Flags | Attestation tx | Block |
|---|---|---|---|---|
| Arc USDC (`0x3600…0000`) | 0.111¢ | live | [`0x3033ac9e…d269b4f8`](https://explorer.arc.io/tx/0x3033ac9eb9c951954a1a0f545e1b350ac7314257eabfa8407bc3c9aad269b4f8) | 26,008,120 |
| Multicall3 (`0xca11…ca11`) | 1.49¢ | live | [`0x5160bb7f…a741c37d`](https://explorer.arc.io/tx/0x5160bb7f206e896a330ac4b6acbd4b47ba9389195d685252682e12fca741c37d) | 26,008,125 |
| Permit2 (`0x0000…8ba3`) | 0.0956¢ | verified + live | [`0x332cb90b…afc62e43`](https://explorer.arc.io/tx/0x332cb90b8bc14382e22291074f87a5ae5d071981a7089deb77483f41afc62e43) | 26,008,129 |

Attester: `0xF05155A3D778101E55fEfA3c516A5789E81A28CB`. Each on-chain `reportHash` was read back with `latest(target, attester)` and matches the hash recomputed from the report JSON. The three attestations cost $0.0043 in total.
