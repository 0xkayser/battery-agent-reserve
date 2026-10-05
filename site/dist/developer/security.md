# Security boundary

- Trusted local operator and one SQLite ledger. Local file access implies authority. No sandbox for malicious workers, distributed finance or custody guarantee.
- Model output is data. No generated shell command, URL, transaction, spending policy or credential is executed.
- Public API is fixed read-only devnet GET, no parameters, no signing, no paid calls. Cluster/schema validation, timeout, bounded response, 30s cache; errors omit upstream stack traces.
- Local Ollama endpoint is fixed loopback; responses are bounded/schema checked. Operators must review their own task artifacts before sharing.
- Hashes prove internal integrity, not factual truth/provider authenticity. Events are operator-controlled records; reproduction is stronger evidence than trusting a coherent log.
- Unknown effects stay held. Receipt recovery only covers a receipt already saved durably. Stronger paid-provider claims require idempotency/outbox/authenticated billing.
- Optional test signer hard-locks devnet, quotes fees and protects a balance. Never import/fund with mainnet assets. Persisted transaction retries reuse one signature; expiry does not authorize automatic replacement.
- No custody vault, token mint, withdrawal service, paid provider or distributed lease is deployed.

Optional `paid_provider.py` is local only, fixed OpenAI HTTPS with redirects/proxies/retries disabled. Keys stay in private env. Request/response IDs and usage are API evidence, not signed billing or credit balance. Full allocation stays held; unknown requests are never automatically repeated. Journal is not an account-wide cap; trusted operator can bypass it. [Runbook](paid-provider.md).

Sensitive reports must not include secrets in public issues. No dedicated private disclosure channel is configured yet. Public reproducible bugs can use the repository issue template with redacted logs.

## Pending mainnet canary

Separate fresh local owner/worker keys; program/mint/genesis/bytecode hash pinned. Fixed cumulative USDC allowance and expiry/revoke are onchain; floor applies only under the isolated no-other-delegations assumption. Owner/file access retains authority. Program upgradeability and broad underlying token delegation are material boundaries. No malicious-worker isolation, paid-provider guarantee or hosted custody. Default tests never broadcast; financial CLI requires an explicit budget flag and reviewed funding. Signed bytes remain held on ambiguity/expiry. See mainnet.md for confirmed canary scope, refund path and still-unpassed hosted paid-service gates.

## Direct x402 resource security

Dedicated local operator wallet; software floor is not an onchain constraint against
its own compromised signing key. Search output never sets destinations or policy.
Pin endpoint/mint/genesis/seller; validate the offered isolated sponsor. Validate exact signed instructions and the
original wallet signature in finalized bytes; sponsor cannot change the message.
No public key files or live spend authorizations. Persist dispatch intent before POST;
unknown HTTP outcome never authorizes another purchase. Missing delivery can remain
held even after money moves: provider has no documented result retrieval API.
Public site shows sanitized dated reports, never a browser custody wallet or keys.


## Read-only public power check
GET /api/wallet accepts only one canonical 32-byte base58 wallet. Fixed methods/RPC/asset/genesis, no external URL inputs or secrets. Response stream bounded to 256 KiB, 10s timeout, redirects disallowed. Bounded cache and in-flight coalescing reduce repeat traffic; no per-user signing or payments. Public RPC/provider and CDN remain trusted availability/data boundaries; validation does not prove RPC honesty. Malformed/duplicate RPC IDs, wrong network/mint/program/account owner/decimals or unsafe amounts fail closed. Frozen tokens do not fund estimates. Reports use escaped text and fixed keys; copy/share requires explicit user action. No unbounded wallet history or durable server storage. Report links expose wallet/estimates to recipients; do not use confidential wallets. This is not an agent-health attestation.
