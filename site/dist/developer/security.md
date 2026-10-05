# Security boundary

- Trusted local operator and one SQLite ledger. Local file access implies authority. No sandbox for malicious workers, distributed finance or custody guarantee.
- Model output is data. No generated shell command, URL, transaction, spending policy or credential is executed.
- Public API is fixed read-only devnet GET, no parameters, no signing, no paid calls. Cluster/schema validation, timeout, bounded response, 30s cache; errors omit upstream stack traces.
- Local Ollama endpoint is fixed loopback; responses are bounded/schema checked. Operators must review their own task artifacts before sharing.
- Hashes prove internal integrity, not factual truth/provider authenticity. Events are operator-controlled records; reproduction is stronger evidence than trusting a coherent log.
- Unknown effects stay held. Receipt recovery only covers a receipt already saved durably. Stronger paid-provider claims require idempotency/outbox/authenticated billing.
- Optional test signer hard-locks devnet, quotes fees and protects a balance. Never import/fund with mainnet assets. Persisted transaction retries reuse one signature; expiry does not authorize automatic replacement.
- No custody vault, token mint, withdrawal service, paid provider or distributed lease is deployed.

Sensitive reports must not include secrets in public issues. No dedicated private disclosure channel is configured yet. Public reproducible bugs can use the repository issue template with redacted logs.

## Pending mainnet canary

Separate fresh local owner/worker keys; program/mint/genesis/bytecode hash pinned. Fixed cumulative USDC allowance and expiry/revoke are onchain; floor applies only under the isolated no-other-delegations assumption. Owner/file access retains authority. Program upgradeability and broad underlying token delegation are material boundaries. No malicious-worker isolation, paid-provider guarantee or hosted custody. Default tests never broadcast; financial CLI requires an explicit budget flag and reviewed funding. Signed bytes remain held on ambiguity/expiry. See mainnet.md for confirmed canary scope, refund path and still-unpassed hosted paid-service gates.
