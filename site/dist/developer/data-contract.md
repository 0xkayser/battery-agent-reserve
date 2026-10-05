# Paid resource data contract — 2026-10-05

Source: direct https://api.exa.ai/search, x402 V2 Solana exact USDC.
Reference: https://exa.ai/docs/integrations/payments/x402/quickstart
Actual unsigned discovery returned HTTP402, 7000 USDC base units, recipient
12Ec2cJmfR1C9uwejzxcuMhUgEC7wDrLgm1wBvvR5w9E, sponsored fee payer
BENrLoUbndxoNMUS5JXApGMtNykLjFXXixMtpDwDR9SP. A price offer is not a purchase.
Pinned SDK core/svm2.28.0 and Kit7.1.1; inspected SDK constructs TransferChecked,
compute-budget instructions and a random memo. No automatic wrapper/retry is used.

Money authority: finalized transaction, original signed message and wallet signature,
exact source/destination token balance changes. HTTP payment headers alone cannot
prove payment. Three immutable requests, primary-domain allowlist, bounded response.
Result gate: at least two unique HTTPS source URLs with nonempty titles on approved
primary domains. This proves a usable source list, not truth of every source claim.
Discovery limits require no polling. Persist quote/payment/dispatch intent/raw response
before next stage. Missing paid response stays held: Exa has no documented purchased
result retrieval endpoint. Recovery from a saved response makes no new paid request.
No OpenAI key, account credit or estimated fiat invoice participates in this route.

A later actual quote returned sponsor BFK9TLC3edb13K6v4YyH3DwPb5DSUpkWvb7XnqCL9b4F. Sponsor rotates. The fixed HTTPS offer chooses a funded system account distinct from the payer/source/destination; the same sponsor must appear in signed/finalized bytes. Vendor and amount stay pinned.


## Power check source
Fixed https://api.mainnet-beta.solana.com, finalized getGenesisHash/getBalance/getAccountInfo/getTokenAccountsByOwner. Mainnet genesis 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d; USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v, legacy token program, 6 decimals. SOL reported as integer lamports; USDC as decimal integer strings. Frozen USDC excluded from spendable; delegated balance flagged. Each response slot retained; batch is not an atomic same-slot snapshot. ObservedAt is server read completion; 15s bounded cache, no stale fallback. HTTP timeout/size limits and validation failures produce unavailable. Free public RPC has no SLA and may throttle; wallet observation is not wallet ownership, oracle price, agent liveness, provider headroom or guarantee. Daily spend and floor are supplied explicitly by operator and never estimated from transfers. Links refresh data; downloaded reports are dated observations. Official schemas: https://solana.com/docs/rpc/http/getbalance and https://solana.com/docs/rpc/http/gettokenaccountsbyowner.
