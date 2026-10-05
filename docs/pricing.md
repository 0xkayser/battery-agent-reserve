# BATTERY / pricing and operating economics

October 5, 2026. **Self-hosted MIT SDK is available. Managed service is not available for purchase.** The proposed managed plan below is a product hypothesis, not a billed subscription or proven margin.

## Buyer and product

Buyer: an operator who already controls a useful agent and its runtime. BATTERY manages the spending authorization and recovery boundary: pre-task reserve/gas checks, durable results, settlement reconciliation and alerts when work must stop. It does not sell model tokens or use reserve principal as revenue.

| Item | Price / status | Payer |
| --- | --- | --- |
| Self-hosted SDK | $0 MIT software licence | Operator runs and maintains it |
| Managed operations | **Proposed $9 / active agent / month**; unavailable for purchase | Operator, if this plan is eventually launched |
| Model inference | Actual model-provider bill, separately authorized | Operator's own provider account |
| Solana transactions | Actual network fees and account rent | Operator's wallet |
| USDC reserve | Operator-owned principal | Never booked as BATTERY revenue |

The proposed $9 covers managed budget checks, retained execution receipts, recovery reconciliation and operational alerts for one registered agent. It does **not** include model compute, a hosting machine for the agent, gas refill, unlimited recovery work or a custody guarantee. No usage entitlement, retention period or SLA is currently offered. Do not pay or fund a wallet to subscribe: there is no checkout.

Why $9: an explicit starting point for validating willingness to pay for operational continuity. It is a chosen reference price, not derived from measured costs or customer demand. Change it when actual usage and paid operator feedback justify a price.

## Cost and contribution model

```text
OPERATOR MONTHLY COST = BATTERY fee + provider bill + gas/rent + own runtime
BATTERY REVENUE       = $9 x active agents, IF the proposed plan is sold
CONTRIBUTION          = revenue - hosting/RPC/storage/support/recovery costs
```

Provider bills and gas do not inflate BATTERY revenue. Deposits, withdrawals and transfers to an owned worker do not count as sales. No reserve percentage, token-volume fee or unproven inference markup is part of this model.

The website's [operating calculator](https://usebattery.xyz/pricing#calculator) requires the operator to enter estimated monthly infrastructure and support costs. It displays scenario arithmetic, **not measured project margin**. Costs have no preset zero value. Taxes, customer acquisition and general overhead are excluded unless included in the input. For one proposed $9 agent, operating costs must be below $9 merely to produce positive contribution; that alone does not establish a viable company.

## What has actually been measured

- Historical mainnet canary: 8 finalized BATTERY transactions; 40,000 lamports total network fees. Funding transfer fees and account rent are separate.
- Three 0.01 USDC test settlements went to an owned worker; all 5 USDC principal returned. These were neither provider invoices nor BATTERY revenue.
- Local inference: no external model-provider charge. Hardware/electricity and managed operating costs were not measured. `$0 external charge` is an experiment property, not the service price.
- Paying customers: none demonstrated. Service revenue: none demonstrated. Paid provider billing and margin: unverified.

## Gates before charging a customer

1. Completed bounded interleaved local-model/mainnet cycle: crash recovery and no duplicate payment. This closes the technical canary gate; hosted production remains absent.
2. Tie an accepted useful paid-provider task to an authoritative charge/request ID; hold unknown billed outcomes instead of repeating them.
3. Measure infrastructure and support costs for the managed scope, including failure handling.
4. Have an external operator accept the deliverable and pay the fee; publish actual scoped results with their permission.

Today, use the free SDK. The local interleaved controller is implemented, offline tested and has completed a funded bounded mainnet run. Neither that implementation nor this pricing page establishes a hosted production service.

## Direct vendor expense

Actual unsigned offer2026-10-05: Exa auto search0.007USDC/request; three planned
purchases0.021USDC. Dedicated1USDC reserve,0.97protected floor,0.03cumulative cap.
This is vendor expense, not BATTERY revenue. Sponsor pays purchase gas; funding and
refund gas are separate. Free SDK takes no fee. Proposed managed9USD/month remains
unavailable and unvalidated. Verified direct payment establishes vendor charge, not
BATTERY profit/customer demand or a fiat OpenAI invoice.
