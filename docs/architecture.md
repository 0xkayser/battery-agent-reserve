# Architecture / v0.2

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
