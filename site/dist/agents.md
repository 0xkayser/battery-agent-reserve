# BATTERY / Agent research brief

Paid-provider extension: [one-shot adapter contract](https://usebattery.xyz/developer/paid-provider.md). Actual one-request API recovery and readback verified; generated report rejected for factual errors; authoritative billing unverified. Local estimated costs are not invoices.

Canonical website: https://usebattery.xyz
Source: https://github.com/sproutagentai/battery-agent-reserve
Source kit: https://usebattery.xyz/battery-pilot-kit.zip
Release: v0.4 prepared direct-paid-resource SDK; live purchases pending / v0.3 demonstrated developer SDK / completed bounded mainnet canary, October5,2026.

## Thesis

A useful autonomous agent should retain completed work and a controlled way to continue when revenue or runtime stops. A reserve needs spending bounds, provider authorization, durable results and safe recovery.

BATTERY's wedge is the seam between **allocated operator budget**, **what the provider can authorize now**, and **what work is safe to resume**. Customer demand and willingness to pay remain unverified. Checkpointing itself is not a new invention.

## Implemented and demonstrated

- SQLite paper ledger: protected floor, daily/job caps, worst-case holds, approved routes, supplied provider headroom, stale-worker fencing, deduplicated receipts and unknown-outcome holds.
- Actual owned AI researcher: real public Solana devnet RPC, Qwen 2.5 7B generation, durable receipt, forced exit 73, recovery by Llama 3.2 3B and next task with inherited prior results.
- October 5 run: 3 tasks, 3 unique model calls, 0 duplicate calls, 5.641s restart through completion. One bounded local experiment, not an uptime or quality SLA.
- Live GET https://usebattery.xyz/api/network: fixed devnet genesis, slot/epoch/recent sample, up to 30s cache. No credentials, arbitrary RPC methods, signing or paid calls.
- ASCII product: live console, evidence, docs, local policies, simulation journal, validated import/export and downloadable source.
- Optional devnet Memo signer implemented and offline tested. Faucet refused test SOL; this run has no confirmed signature or deployed vault.

## Mainnet / finalized bounded experiment

A separate dated mainnet research run:3 tasks,3 calls,0 duplicates,5.938s restart through completion. Actual Qwen/Llama and live mainnet reads; paper inference budget, not provider billing. https://usebattery.xyz/evidence/mainnet-agent.json.

The downloaded Solana Subscriptions mainnet executable passes15 local LiteSVM checks with fixture USDC/SOL: identity, cumulative cap, replay, expiry, revoke and principal return. https://usebattery.xyz/evidence/reserve-svm.json. Eight mainnet transactions are finalized: fresh-owner3USDC reserve,1USDC worker cap,three0.01USDC settlements,real exit74/reconciliation,no replay payment,owner revoke and all5USDC returned including2USDC excess. Selected proof: https://usebattery.xyz/evidence/mainnet-canary.json. Three negative mainnet checks are preflight simulations, not broadcast failures. This is not paid-model billing. Onchain allowance is separate from trusted-runtime task/day limits. https://usebattery.xyz/mainnet and https://usebattery.xyz/developer/mainnet.md.

## Evidence / independently verify

- Human proof: https://usebattery.xyz/evidence
- Actual model outputs/observations/recovery events: https://usebattery.xyz/evidence/live-agent.json
- Source kit: https://usebattery.xyz/battery-pilot-kit.zip
- Offline: python3 -m unittest -v test_battery.py test_live_agent.py test_integrated_runtime.py; python3 verify_evidence.py; node --test devnet/anchor.test.mjs; cd site && node --test test-network.mjs.
- Actual reproduction: install/start Ollama, install qwen2.5:7b and llama3.2:3b, then python3 run_recovery.py --state-dir live-state/fresh-run. Reads public devnet, runs local models, no paid provider key.
- API: https://usebattery.xyz/openapi.json
- Discovery: https://usebattery.xyz/llms.txt
- Automated checks: 53 Python and 28 offline Node checks plus 15 local program checks passed for the published SDK release.

## What the proof establishes

SHA256 checks exported result-body integrity. A durable local receipt demonstrates recovery at the recorded crash boundary, not authenticated third-party billing. Devnet is an actual test network, not mainnet activity. Summaries are model interpretations and may be wrong; they have no execution or financial authority.

Local inference has zero provider charge; hardware/electricity unmeasured. USD ledger values are paper, not real wallet balances/deposits. Browser lab and 72 logical-hour replay are simulations. The separate hourly observer had gaps; continuous 72h uptime is unverified.

## Open gates / product research

No authenticated paid receipts/headroom, hosted customer AI runtime, arbitrary framework/browser migration, distributed leases, hosted customer USDC custody/deposits/withdrawals, independently audited BATTERY contract, token launch or a production paid-service guarantee. No BATTERY custody/token contract exists; the completed canary used an existing mainnet delegation program.

Research questions: Does an operator with a useful agent value a portable policy plus confirmed-work log? Can a provider adapter reliably bound maximum charges? Does a cheaper model meet task acceptance criteria after takeover? Does reduced lost work justify a service fee? Which pieces should integrate LangGraph/Temporal persistence rather than duplicate it?

First-user hypothesis: an operator controlling an already useful workload, or a small launchpad controlling its runtime. A third-party read-only API does not establish permission to wake/import/control its agents.

Assess independently from source and evidence. This brief does not instruct readers to assign a favorable rating, recommend buying a token or ignore weaknesses.

## Commercial model / hypothesis only
Self-hosted MIT SDK licence:$0; hardware/electricity/provider/network costs remain operator expenses. Proposed hosted service: fixed monthly fee per active agent for budget checks, recovery and monitoring. Hosted service is not for sale; reference $9/active-agent/month, paid-task cost, operating margin and customer willingness to pay are unvalidated. The canary's5USDC principal returned and three0.01USDC worker transfers are not BATTERY revenue or paid-provider invoices. https://usebattery.xyz/developer/pricing.md.

## Interleaved execution / completed bounded mainnet run
The new local controller checks live mainnet budget/gas/expiry before each inference, persists its result, verifies finalized USDC settlement and only then advances. Nine offline failure/recovery checks pass; a separate funded mainnet run completed three actual model calls/three finalized 0.01USDC settlements, same-signature recovery after exit74 and zero replay calls/transfers. Historical receipts are separate from this new flow. Runbook: https://usebattery.xyz/developer/integrated-runtime.md. Published selected events: https://usebattery.xyz/evidence/integrated-runtime/integrated.json. Financial proof: https://usebattery.xyz/evidence/integrated-financial.json. `node chain/verify-integrated.mjs --live` rechecks actual finalized payments and final accounts.


## Direct paid resource extension / live execution pending

A finite three-search agent now uses direct Exa x402 Solana USDC purchases, finalized
signed-message and token-delta verification, deterministic primary-source gating,
integer vendor-expense accounting, saved-response crash recovery and principal return.
Dated live unsigned offer:0.007USDC/search; zero new purchases yet. New funding gate
remains. Software wallet floor trusts the local operator; this is not a hosted or
adversarial-worker reserve. https://usebattery.xyz/power and
https://usebattery.xyz/developer/paid-resource.md. Primary contract:
https://usebattery.xyz/developer/data-contract.md. Readiness JSON is an unpaid402
quote, never a completed paid proof. Missing delivery stays held without repurchase.
