# Integrated local agent + mainnet settlement

Implemented October 5, 2026. **The first interleaved mainnet run completed on October 5, 2026; see published evidence below.** The previous eight finalized transactions remain a separate canary; its USDC was returned and its delegation revoked.

`integrated_runtime.py` runs each task only after a real onchain budget/gas/expiry check. It saves the input/model receipt/result, settles that result using the existing Subscriptions program, verifies finalized signed bytes and exact token deltas, then starts the next task. It cannot create provider credit or gas funds.

The same kernel-locked runtime and signed outbox resume after a crash. A saved inference result is reused. A pending transaction retains the same bytes/signature. Expired unknown transfers and unknown model calls stop for operator reconciliation. A paper SQLite balance never authorizes the mainnet transfer.

## Prepare and inspect, without signing

Python 3.10+, Node 22+, the pinned `chain` dependencies and an installed Ollama model are required. Keep signing keys on the operator machine; never upload `mainnet-state` or `live-state`.

```sh
cd chain
npm ci --ignore-scripts --omit=dev
cd ..
export BATTERY_CANARY_NAME=integrated-20261005
python3 chain/canary.py prepare
python3 chain/canary.py return-address YOUR_PUBLIC_RETURN_WALLET
python3 chain/canary.py status
python3 integrated_runtime.py --name integrated-20261005
```

Default runtime command is read-only. It refuses to generate if no confirmed setup exists. Read the generated plan and exact funding bound before execution. Preparation generates fresh private signers but sends no transaction. Isolated state names prevent replaying or relabelling the old completed canary.

## Execute only after funding and approval

The reviewed canary requires exactly 3 USDC and 0.008 SOL in its dedicated operator wallet, no unexpected delegation/worker balances, a user-bound return wallet, matching mainnet genesis and reviewed program binary. Existing Ollama must be running. The allowance is fixed at 1 USDC for 24 hours; the worker-isolated reserve floor is 2 USDC.

```sh
python3 chain/canary.py setup --execute-budget-5-usdc
python3 integrated_runtime.py --name integrated-20261005 --execute-budget-5-usdc --crash-after-send 2
# Expected exit74 after the second signed transfer dispatch; retain all state.
python3 integrated_runtime.py --name integrated-20261005 --model llama3.2:3b --execute-budget-5-usdc
# Verify finalized receipts and reconcile before closing the allowance.
python3 verify_integrated.py live-state/integrated-20261005/integrated.json --name integrated-20261005 --live
python3 chain/canary.py revoke --execute-budget-5-usdc
python3 chain/canary.py withdraw --execute-budget-5-usdc
```

Result: private `live-state/integrated-20261005/integrated.json`, with authorization/result/finality ordering and the local model checkpoint. It is not automatically published. Never claim that an offline fixture or a funded preparation is a completed integrated run.

## What the payment means

Each 0.01 USDC payment is a bounded test settlement to the owned worker, not an AI-provider bill or established BATTERY revenue. Local inference still has hardware/electricity costs that this experiment does not measure. The integrated controller is one trusted operator, not hosted multiuser production, a distributed lease or independently audited custody.

## Dated completed run

Three actual Qwen/Llama model calls interleaved with three finalized 0.01 USDC settlements. Exit74 after the second send; its original signed bytes/signature were reconciled after restart, and the third task followed finality. Replay added zero signatures, transfers or model calls. The independent verifier checked actual finalized wire bytes, result Memo and exact USDC deltas. Actual kernel-lock contention rejected a second CLI runner before model/signing.

This proves the recorded bounded local flow, not provider billing, continuous hosted operations or automatic gas refilling. Published selected artifacts: https://usebattery.xyz/evidence/integrated-runtime/integrated.json and https://usebattery.xyz/evidence/integrated-financial.json. Public verifier: `node chain/verify-integrated.mjs --live`.
