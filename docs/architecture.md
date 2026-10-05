# Architecture / v0.3

```text
POLICY -> RESERVE -> DISPATCH -> LOCAL OLLAMA
                       |           |
                    UNKNOWN    DURABLE RECEIPT
                       |           |
                   HOLD/STOP   RECONCILE -> CHECKPOINT
                                              |
                                NEW WORKER / SAME LEDGER
```

core.py uses SQLite WAL/FULL synchronization and transactions for paper microUSD, caps, worst-case holds and receipt identity. This is one trusted local operator authority, not a distributed lease or custody system.

adapters.py makes a fixed public devnet read and fixed loopback Ollama structured call. Model output is data, never commands, arbitrary URLs or spending authority. The controller explicitly approves both model routes.

live_agent.py saves inputs, receipts and events durably. Recovery with a saved receipt settles without another call. Recovery without it leaves the dispatched outcome uncertain and halts. Epoch fencing rejects stale ledger operations, but cannot cancel an already issued external HTTP request.

The published experiment crashes **after receipt commit, before ledger settlement**. It demonstrates this identified boundary only. The next task inherits prior completed IDs. Three actual model outputs, tool observations and event timestamps are in evidence/live-agent.json.

The public network endpoint is live and read-only. AI evidence is a dated local artifact; visitors cannot start remote inference or read its ledger. Fixed devnet genesis and schema, 30s cache, bounded timeout and explicit failures. No arbitrary RPC method/URL or signing API.

Optional test memo keys live privately in devnet-state. Lamport fee policy is separate from paper microUSD. The published experiment has no confirmed transaction or deployed custody program.

## v0.3 / separate bounded financial canary

An explicit mainnet cluster option pins genesis and immutable ledger cluster. Mainnet research remains local inference with a paper USD ledger. chain/reserve.mjs uses the existing Subscriptions fixed-delegation program for USDC; no new custody program. chain/settlement.mjs persists signed bytes before send and reconciles identical signatures/finalized bytes/token deltas. chain/canary.py supplies a kernel single-operator lock. The bounded mainnet canary finalized8 transactions, including3 saved-result settlements,financial exit74 recovery,revoke and full5USDC return; see mainnet.md. Local inference ran before settlement, not paid-model billing. The public /api/mainnet is fixed read-only with an isolated cache, never a signing endpoint.


## Direct paid resource controller / prepared v0.4
`paid_resource.py` authoritative SQLite ledger and kernel lock; `chain/resource.mjs`
private signed payment outbox plus raw response journal; `run_paid_resource.py` finite
planned-crash supervisor. Exact USDC purchases use the vendor's x402 SVM scheme;
message guards run before wallet signatures. Finalized RPC bytes/signatures/deltas
prove actual vendor expense. Source-list gate is deterministic and separate from
payment. Known charged failures book expense then halt; unknown outcomes remain held.
No hidden free-model substitution or OpenAI fiat billing estimate is used. See
`docs/paid-resource.md`. Hosted multiuser execution remains unavailable.
