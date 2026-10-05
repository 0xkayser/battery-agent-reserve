# Direct paid resource researcher

Version0.4, prepared2026-10-05. Live unsigned Exa Solana offer checked; the new
paid run is awaiting separate funding/approval. Historical canary capital was returned.

## What runs

A finite agent buys three primary-source web searches directly from Exa with Solana
USDC via x402 V2. It verifies the signed message and actual finalized token deltas,
accepts bounded source lists, books real integer USDC expense and returns remaining
principal. A supervisor deliberately exits after the second response has been saved,
restarts the same retained journal and verifies a closed replay makes no new purchase.
No paid model/OpenAI key is needed for these purchases. Search is a paid agent tool,
not paid inference. It produces source lists, not an invented model interpretation.

## Monetary contract

- Fresh dedicated reserve:1USDC. Software protected floor0.97USDC.
- Exactly0.007USDC per query; three queries0.021USDC; maximum authorized vendor
  expense0.03USDC. Vendor recipient is pinned in source/policy.
- The advertised distinct funded facilitator pays purchase gas. Its address can rotate.
  The chosen address must match the actual signed and finalized transaction.
- Owner needs0.00002SOL to return USDC; maximum refund transaction fee0.00001SOL.
  Sender funding fees/possible ATA rent are extra and belong to the sender.
- Normal successful return:0.979USDC to the explicitly bound owner address.
  Remaining SOL/source-ATA rent stay locally operator-owned. No silent sweep/closure.
- No BATTERY markup/revenue;9USD/month managed plan is still a pricing hypothesis.

The trusted local wallet owner can bypass a software floor. This route does not
promise adversarial-worker delegation or hosted noncustodial vault enforcement.

## Install and unsigned check

Python3.10+, Node22+, npm. From the extracted kit root:

```
cd chain
npm ci
npm test
cd ..
python3 -m unittest -v test_paid_resource.py
python3 paid_resource.py prepare
python3 paid_resource.py probe
python3 paid_resource.py status
```

Preparation creates a local private wallet and immutable plan. Probe buys nothing.
Never delete state to repeat a purchase. Never share private keys or API credentials.
The public website cannot collect deposits, sign or run customer tasks.

## One authorized finite run

After approving that specific wallet/budget and verifying its funding:

```
python3 run_paid_resource.py --approve-max-0.03-usdc
python3 paid_resource.py status
python3 paid_resource.py export > evidence/paid-resource.json
node chain/verify-resource.mjs evidence/paid-resource.json --live
```

The execution flag is an operator confirmation, not a substitute for human funding
approval. Do not use it against a previously closed budget. Supervisor restarts only
for the deliberate exit76 after a saved response, never for arbitrary failures.

## Recovery / cancellation

`authorized -> dispatching -> response_saved -> paid -> complete`

Before the paid POST, exact partially signed bytes and dispatch intent are on disk.
After response, raw body/payment header commit before further validation. Restart
uses the saved response, re-reads finality and never repurchases a completed task.
Missing response remains held: Exa has no documented bought-result retrieval API.
If the provider charged but the result fails its gate, expense is still booked and
later purchases stop. Known completed/rejected or unattempted jobs may be cancelled
and remaining principal returned with `paid_resource.py cancel` plus the budget flag.
Unknown/unfinished payment prevents automatic refund until reconciled.

This is a single trusted local operator/journal, not a multiuser Vercel runtime,
provider failover, a custody contract, a 72-hour uptime guarantee or an atomic
pay-only-if-useful delivery protocol. The provider may be paid for a rejected result.

## Evidence boundaries

`resource-readiness.json` is dated live HTTP402 offer evidence with zero purchases.
Offline fault fixtures test actual subprocess exit/restart and cryptographic message
checks, but fixture vendor/chain values are not mainnet BATTERY payment evidence.
A completed proof must contain the original provider response, three matching
finalized payments, selected results, retained runtime events and principal return.
Offline hash/byte checks establish consistency; `--live` independently reads RPC.
