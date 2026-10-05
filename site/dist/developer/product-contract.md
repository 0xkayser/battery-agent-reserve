# BATTERY / integrated execution contract

October 5, 2026. Buyer: the operator of a useful agent whose runtime they control.

The operator approves a bounded Solana USDC allowance and a separate SOL gas allocation. Before each useful mainnet operator brief, the controller reads the real reserve, allowance, expiry and worker gas. It then executes one local-model task, commits its input and result, settles exactly that result through the existing Subscriptions program, waits for finalized exact USDC deltas and only then advances to the next task. A restart preserves both the inference receipt and signed transaction outbox. Unknown model requests and expired uncertain transactions stop execution.

Authoritative stores: SQLite for local tasks; persisted signed bytes for dispatch intent; finalized Solana accounts and transactions for money. Local microUSD bookkeeping is paper, not USDC custody. Model output never authorizes money.

Current boundary: one trusted operator, three bounded jobs, 0.01 USDC per result, fixed 1 USDC allowance, 2 USDC worker-isolated reserve floor on a 3 USDC deposit. No BATTERY custody contract, token, automatic gas swap, external provider credit top-up, distributed worker lease or hosted customer execution. The previously finalized canary generated all tasks before settlement; it is not evidence for the new interleaved runner.

## Acceptance criteria

1. Real mainnet pre-task authorization precedes each model call and finalized payment precedes the next model call; output hashes and exact USDC deltas match.
2. After a process exit, inference is not duplicated and the same signed payment is reconciled. Concurrent runners and changed inputs are rejected; an unknown result remains held.
3. Devnet evidence includes a real confirmed/finalized signature and an independently re-read fee/payer/Memo, or remains explicitly unverified if faucet/RPC fails.
4. Service pricing separates SDK licence, operator compute/provider bills, network fees, reserve capital and BATTERY fee; no local $0 inference or refunded canary payment is revenue.
5. Public source, tests, documentation and site agree. Live execution is not claimed from offline fixtures; no secret/private state enters public artifacts.

## Acceptance review / October 5

1. PASS: actual three-task mainnet run; independently re-read finalized payment bytes, result Memo and exact USDC deltas; observed authorization/model/result/payment ordering.
2. PASS for the recorded boundary: actual exit74, unchanged second signature/wire hash after resume, three unique model calls; replay zero calls/transfers; actual kernel-lock contention refused a concurrent CLI. Unknown outcomes/tampered results rejected in offline tests. This is not proof at every crash boundary.
3. UNVERIFIED: Node devnet RPC returned429 before signing; official PoW faucet discovery found the recommended faucet empty and initial requestAirdrop was rejected as rate-limited. No signed devnet proof is claimed.
4. PASS for clarity: free MIT SDK; proposed $9/active-agent/month operations fee; operator compute/gas/principal separated. Pricing willingness to pay and operating margin remain unvalidated; no checkout.
5. Release gate: exact public source kit, CI, production pages, mobile layout and hashes must match the selected dated artifacts. Verify after deployment; offline checks alone cannot establish it.

## Direct paid resource cycle — 2026-10-05

One trusted operator owns a dedicated1USDC reserve and runs a three-task researcher.
BATTERY obtains an Exa x402 quote, validates canonical mainnet USDC, pinned recipient
and an isolated sponsor, available balance/protected0.97USDC floor/0.03USDC cumulative cap,
signs that payment, buys real search, verifies finalized money movement, accepts a
primary-source list, persists the actual charge and continues. Exit after the second
saved response must recover that same response; full replay makes no new purchase.
Sponsor pays purchase gas: this is not a swap or OpenAI credit refill. Old experiments
stay immutable and closed. No BATTERY fee/customer revenue is fabricated.

Acceptance criteria:
1. Three actual provider purchases, three accepted usable source lists and independently
   re-read finalized direct-to-provider USDC deltas.
2. Integer reserve floor/cumulative cap checked before purchase; wrong mint/network/
   recipient/sponsor/price and malformed result fail closed.
3. Actual exit after durable response, restart and replay cause zero extra purchases.
   Missing response stays uncertain rather than being repurchased.
4. Authoritative private journal, kernel exclusion, immutable policy/inputs, durable
   intent before dispatch and distinct provider/chain/result states.
5. Public source/runbook/dated proof accurately report actual vendor expense and
   boundaries, with no multiuser/atomic delivery/production claims.

New capital/API spending require a fresh explicitly bounded budget. Implement/probe/
test before money. Returned canary funds are not reusable. Hosted multiuser runtime
and adversarial-worker custody remain separate launch gates.
