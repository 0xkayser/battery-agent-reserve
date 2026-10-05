# BATTERY / bounded mainnet canary / v0.3

Status, October 5, 2026: **prepared, unfunded, zero confirmed BATTERY mainnet transactions**. No live-ready or custody guarantee. Public console: https://usebattery.xyz/mainnet.

## Demonstrated

- Owned Qwen 2.5 7B researcher reads real mainnet genesis/epoch/performance. Exit73 after the second durable receipt; Llama3.2 3B resumes without another call and completes task3. Three tasks, three calls, zero duplicates; restart through completion5.938s in this dated local run. Evidence: /evidence/mainnet-agent.json.
- Existing mainnet program downloaded and executed in local LiteSVM:15 checks, including cap exhaustion, outsider rejection, replay, expiry, revocation and return of token principal. **Fixture USDC/SOL; zero mainnet broadcasts.** /evidence/reserve-svm.json pins program SHA256 and deployment slot.
- Offline policy/price/transaction-outbox tests exercise crash after send, accepted-but-timed-out dispatch, exact balance proof and expired uncertainty. Live financial recovery is pending.

## Existing program, exact boundary

Solana Foundation [Subscriptions](https://solana.com/docs/payments/subscriptions/overview), fixed delegation, program `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`. Canonical [Circle USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses) on Solana: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, legacy SPL Token,6 decimals. Exact mainnet genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`.

A dedicated fresh operator USDC ATA holds3USDC. A separate worker gets a fixed1USDC cumulative allowance, expiring24h after setup. With **no other delegations**, at least2USDC remains unreachable through that worker allowance. The owner can revoke, withdraw or change authorization. The floor is this arithmetic consequence; it is not a standalone immutable vault rule. Job/daily/extra gas constraints are trusted-runtime checks.

The source ATA delegates to the program authority with a broad SPL allowance; fixed-delegation state bounds the worker. Never attach this test to a wallet with unrelated funds or existing authorizations. Mainnet executable is upgradeable; compare bytecode to the locally tested snapshot before signing. The [repository audit status](https://github.com/solana-foundation/subscriptions/blob/main/audits/AUDIT_STATUS.md) describes specific audited commits, not a blanket audit of BATTERY or every deployed revision.

## Budget and role separation

Private `prepare` quotes actual rent and a serialized unsigned setup-message fee. Current rent:106-byte authority1,188,720 lamports;187-byte delegation1,600,200;165-byte token account1,488,440. Current setup message fee5,000lamports. Values are dated, recheck before funding.

- Operator funding:3USDC plus0.008SOL. Worker receives0.001SOL from that allocation; no additional funding.
- At most three test settlements of0.01USDC, to our worker, with result-hash memos. This is **not provider billing, trading, buying a token or automated gas conversion**.
- Sender allowance:1,528,440lamports for creating the operator USDC ATA and two sender transaction fees of at most20,000lamports each. No priority fees, swaps, exchange withdrawal fees or unknown sender charges are included.
- Conservative total at SOL=$200: **$4.905688** including3USDC principal. The CLI requests a fresh Kraken SOL/USDC ticker, validates the pair/age and blocks above200 before new setup/run operations. It does not trade. Recheck wallet transfer quotes. If price exceeds$200 or sender costs exceed this allowance, stop rather than exceed the authorized$5. The principal can return; rent/fees are separate SOL.
- Owner and worker keys are fresh local files,0600 in a0700 private directory. They stay on the operator machine, never in website/source artifacts. Back them up privately; losing them can lose remaining funds. No seed phrase should be sent in chat.

## Reproduce without money

Python3.10+, Node22+. From repository root:

```sh
python3 -m unittest -v test_battery.py test_live_agent.py
python3 verify_evidence.py evidence/mainnet-agent.json
cd chain
npm ci --ignore-scripts
npm test
npm run test:svm
cd ..
python3 run_recovery.py --cluster mainnet --state-dir mainnet-state/fresh-research
python3 chain/canary.py prepare
python3 chain/canary.py status
```

Ollama and both approved models must already be installed/running for actual inference. Existing state is not overwritten. `prepare` creates private keys and an unsigned reviewed plan, reads public RPC, and does not broadcast. `test:svm` downloads the actual executable and signs fixture transactions only inside LiteSVM. Default CI runs offline tests, not this network experiment.

## Financial execution, after reviewed funding

Only the operator should fund the private plan's owner address, with the exact amounts and network above. This public website is not a deposit service. Do not fund an address from a modified source file or another user's plan.

Bind the original funding wallet for returning principal; no withdrawal address is inferred from a random incoming transfer. Then, from repository root:

```sh
python3 chain/canary.py return-address ORIGINAL_FUNDING_WALLET
python3 chain/canary.py setup --execute-budget-5-usdc
python3 chain/canary.py run --execute-budget-5-usdc --crash-after-send
# Expected exit74 after research-002 dispatch; resume identical state.
python3 chain/canary.py run --execute-budget-5-usdc
python3 chain/canary.py revoke --execute-budget-5-usdc
python3 chain/canary.py withdraw --execute-budget-5-usdc
```

Each command holds a kernel-released single-operator lock. Setup rejects prior authority/delegation and unexpected balances. Every new signed transaction gets a fee quote and simulation. Signed bytes persist with signature/last-valid-height before broadcast. Resume reconciles the same signature, finalized bytes, actual fees and USDC deltas; no replacement is signed for an expired uncertain transaction. A timeout/failure stops and retains state. Do not delete it or rerun setup with another key to conceal uncertainty.

The original funding wallet must already have its canonical USDC ATA. Withdrawal follows confirmed revoke and returns both operator and worker USDC to that bound address. Small SOL and account rents remain locally owned; no automatic SOL sweep is implemented. Keys can be imported privately into an operator-controlled Solana wallet for later cleanup. Do not publish them.

Confirm all receipts, balances, revoke and return before publishing a funded experiment. The proof hash binds the selected result; it does not authenticate model truth or paid-provider receipts. No hosted customer wallets, distributed lease, paid inference adapter, BATTERY custody program or token has launched.
