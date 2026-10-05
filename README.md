# BATTERY

## Direct USDC-paid researcher / v0.4 preparation

New finite controller: reserve -> buy Exa search via Solana x402 -> verify actual
payment and primary-source result -> book USDC expense -> recover -> return capital.
Actual unpaid HTTP402/0.007USDC offer checked. New purchases are **not yet executed**;
separate funding required.17 new fault/message checks pass (10 Python,7 Node).

- [Runbook and monetary boundaries](docs/paid-resource.md)
- [Data contract](docs/data-contract.md)
- `python3 paid_resource.py prepare`: private dedicated wallet, no signing/payment.
- `python3 paid_resource.py probe`: unsigned provider quote, no purchase.
- `python3 run_paid_resource.py --approve-max-0.03-usdc`: finite funded run, deliberate
  saved-response exit, restart, finality/result checks and remaining-principal return.
- `node chain/verify-resource.mjs evidence/paid-resource.json --live`: independently
  re-read the completed run. No completed proof is claimed before actual execution.

Hosted multiuser service, paid model inference and adversarial-worker reserve controls
are not provided by this trusted local x402 route. See the runbook before funding.


**Keep completed work when an agent loses its runtime. Bound what it may spend next.**

Reserve policy + durable local receipts + controlled recovery for agents whose runtime you own. A treasury can have money while a provider key cannot authorize the next request. A reserve alone does not solve that boundary.

[Website](https://usebattery.xyz) / [Docs](https://usebattery.xyz/docs) / [Actual recovery evidence](https://usebattery.xyz/evidence) / [Live devnet](https://usebattery.xyz/live) / [Agent research brief](https://usebattery.xyz/agents.md).

## What runs

| Component | Verified scope |
| --- | --- |
| SQLite ledger | Paper microUSD, protected floor, worst-case reservation, daily/job caps, supplied provider headroom, receipt deduplication, stale-worker fencing, unknown outcomes held |
| Owned AI researcher | Actual public devnet data + local Ollama generation; durable receipt, forced process exit, Qwen -> Llama recovery and continuation |
| Public network API | Fixed read-only devnet RPC batch, validated genesis/schema, actual slot/epoch/performance sample, 30s cache, explicit upstream failures |
| ASCII product | Live console, evidence, docs, browser-local policies, simulation journal, import/export, source and brand downloads |
| Devnet memo tool | Implemented and offline tested. Published run has no confirmed signature: faucet refused test SOL. Not an onchain vault. |

October 5, 2026: **3 tasks / 3 inference calls / 0 duplicate calls**. Receipt survived exit 73; approved fallback inherited both prior results. Restart through completion: **5.641 seconds** in this one local run. Actual model generation and RPC reads; paper USD reserves. Zero provider charge; hardware/electricity not measured. Not an uptime SLA or a hosted AI service.

## Mainnet canary / confirmed, revoked, principal returned

October5,2026: **8 finalized mainnet transactions /3 settlements /5USDC returned**. Fixed1USDC worker allowance on a3USDC reserve, three0.01USDC payments bound to actual saved research results. Forced exit74 after the second dispatch; the same signature reconciled, and a repeated run created no new signatures or transfers. Delegation revoked and all principal returned. BATTERY fees:40,000lamports (0.00004SOL). Small SOL/account rents remain locally operator-owned.

The owned research run used local Qwen/Llama and actual mainnet reads before settlement:3 tasks,0 duplicate inference,5.938s restart through completion. Payments do not buy inference. Three negative mainnet preflight simulations rejected excess allowance, a wrong delegate and the revoked worker; those failures were not broadcast. Existing mainnet executable also passes15 local LiteSVM fixture checks.

Inspect [financial proof](https://usebattery.xyz/evidence/mainnet-canary.json), [runbook](docs/mainnet.md), [mainnet console](https://usebattery.xyz/mainnet). Verify without signing:

```sh
node chain/verify-canary.mjs          # artifact integrity and relationships only
node chain/verify-canary.mjs --live   # finalized RPC bytes, USDC deltas and final accounts
```

This closes the bounded owned-agent financial canary; hosted customer execution, authenticated paid-provider billing and a BATTERY custody/token deployment are still absent.

## Interleaved controller / actual mainnet run

`integrated_runtime.py` now checks real mainnet reserve/allowance/expiry/gas before each local-model task, persists its result, then verifies the finalized USDC settlement before the next task. Saved outputs and signed payment bytes are reused after a crash; unknown outcomes remain held. Nine offline failure checks passed. A separate funded live run completed three actual model calls and three finalized USDC settlements, with exit74 after the second send, same-signature recovery and zero replay calls/transfers. The historical eight transactions above remain a separate, closed canary. [Execution runbook](docs/integrated-runtime.md), [independent public verifier](chain/verify-integrated.mjs), [product contract](docs/product-contract.md).

## Offline verification

Python 3.10+ and Node 22+; no package dependencies, accounts, models or money required.

```sh
python3 -m unittest -v test_battery.py test_live_agent.py test_integrated_runtime.py test_paid_provider.py
python3 paper_replay.py
python3 verify_evidence.py
node --test devnet/anchor.test.mjs
cd site
node --test test-network.mjs
```

Offline tests use named fixtures. Evidence verification checks hashes and event/task relationships; it does not authenticate the model or reconstruct an unpublished machine.

## Paid-provider adapter / billing gate remains open

`paid_provider.py` implements one bounded OpenAI operator brief: immutable request, durable API receipt, forced-exit recovery, unknown-outcome holds and authenticated response readback. Sixteen offline fault/content/proof checks pass. Token-price calculation stays an estimate, never an invoice, available credit or Solana payment. One actual API generation survived exit75 and two receipt recoveries; authenticated readback matched. Its operator report was rejected for factual errors. Authoritative billing remains unverified. [Runbook](docs/paid-provider.md) explains local credentials, explicit authorization and remaining billing gates.

## Run real local inference

Install/start [Ollama](https://docs.ollama.com/quickstart). Models require local memory and several GB of disk. Install both before running:

```sh
ollama pull qwen2.5:7b
ollama pull llama3.2:3b
python3 run_recovery.py --state-dir live-state/my-first-proof
python3 verify_evidence.py live-state/my-first-proof/live-agent.json
```

The bounded controller runs three tasks, deliberately exits after task 2's durable receipt, starts the fallback and checks recovery. Use a fresh state directory; existing ledgers are not overwritten. To resume manually, preserving completed tasks:

```sh
python3 live_agent.py --state-dir live-state/my-first-proof --model llama3.2:3b --jobs 3
```

No durable receipt after dispatch = unknown outcome, held until operator reconciliation. Restart refuses another inference call. This does not claim exactly-once execution at every crash boundary.

## Optional devnet checkpoint

Fresh local test key only; no mainnet imports. Free faucet SOL may be unavailable/rate limited. A failure never becomes a simulated signature.

```sh
node devnet/anchor.mjs anchor live-state/my-first-proof/live-agent.json devnet-state/my-first-proof --airdrop
node devnet/anchor.mjs verify devnet-state/my-first-proof/anchor.json
```

Exact devnet genesis required; protected floor 0.5 test SOL; max fee 10,000 lamports; daily fees 30,000 lamports. Signed bytes persist before send; retries reuse the same signature. Expired uncertain transactions require inspection, not automatic re-signing. A confirmed Memo would bind a hash/fee payer to a devnet slot, not prove model truth, deploy custody, transfer USDC or launch a token. Keys stay outside the public kit and Vercel.

## Integration / boundaries

Read [architecture](docs/architecture.md), [adapter contract](docs/adapters.md), [security](docs/security.md) and core.py. Supply a bounded quote and authoritative provider allowance; reserve, dispatch, persist receipt/output, reconcile. A new worker keeps the same ledger and increments its epoch. Copying a checkpoint does not transfer money or reserve authority.

One working owned-agent adapter, not universal framework/browser migration. Model output is text, never executable commands or financial authority. Local QA server: `cd site && node dev-server.mjs`, loopback only, port 4183.

Open production gates: authenticated paid billing/headroom, customer task-quality acceptance, distributed leases and a reviewed USDC vault. No BATTERY custody program or token exists. The completed canary used the existing Solana Subscriptions program. Browser lab and 72 logical-hour replay are simulations. The separate hourly observer had gaps; uninterrupted 72h uptime is unverified. [BRIEF.md](BRIEF.md) records the original finite research sample and limitations.

## Costs and revenue status
Free MIT self-hosted SDK. Proposed managed operations: **$9 per active agent per month**, for budget checks, durable receipts, recovery reconciliation and alerts. This is an unvalidated reference price; no plan or checkout is available for purchase. Local experiment provider charge0 does not include hardware/electricity and is not a service tariff. Operator total cost separates provider bills, network fees and a proposed fixed monthly service fee. No paid-provider unit economics, BATTERY revenue or paying customer is demonstrated. [Costs and commercial hypothesis](docs/pricing.md).
