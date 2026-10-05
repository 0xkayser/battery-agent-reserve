# BATTERY

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

## Offline verification

Python 3.10+ and Node 22+; no package dependencies, accounts, models or money required.

```sh
python3 -m unittest -v test_battery.py test_live_agent.py
python3 paper_replay.py
python3 verify_evidence.py
node --test devnet/anchor.test.mjs
cd site
node --test test-network.mjs
```

Offline tests use named fixtures. Evidence verification checks hashes and event/task relationships; it does not authenticate the model or reconstruct an unpublished machine.

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

Open production gates: authenticated paid billing/headroom, customer task-quality acceptance, distributed leases and a reviewed USDC vault. No token or contract address exists. Browser lab and 72 logical-hour replay are simulations. The separate hourly observer had gaps; uninterrupted 72h uptime is unverified. [BRIEF.md](BRIEF.md) records the original finite research sample and limitations.
