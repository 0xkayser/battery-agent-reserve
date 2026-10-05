# BATTERY / costs and commercial hypothesis

Status, October 5, 2026: **free self-hosted MIT SDK; no hosted paid plan or checkout**. No paying customer, BATTERY service revenue, validated tariff or measured paid-provider unit economics is published.

## What is available today

| Item | Current price / cost | Who pays |
| --- | --- | --- |
| Self-hosted BATTERY SDK | $0 software licence under MIT | Operator provides its machine/runtime |
| Local model experiment | $0 external provider charge | Operator still bears hardware/electricity; unmeasured |
| Mainnet canary | 0.00004 SOL transaction fees for 8 BATTERY transactions | Operator; sender funding fees/rent were separate |
| User reserve principal | 5 USDC received and5 USDC returned | Operator-owned capital, not BATTERY revenue |
| Hosted managed runtime | Not available for purchase | No tariff, subscription or customer billing active |

Neither a 0.01 USDC transfer to our own worker nor a 0.000005 SOL transaction fee is a BATTERY service price. The inference completed before the settlements and used local models. The canary does not establish paid-inference cost or business margin.

## Proposed revenue model / unvalidated

Target buyer: an operator of an already useful agent, with control over its runtime. Proposed paid product: hosted budget checks, durable receipts, recovery and operational monitoring. Hypothesis: a **fixed monthly service fee per active agent**. The fee amount and willingness to pay are not established; this is not a live offer.

Provider costs and Solana fees remain separate operator expenses. A provider account's credit/headroom must authorize a request; holding USDC alone does not create provider credit or SOL gas. No automatic gas conversion is currently implemented.

```text
OPERATOR TOTAL COST = provider bill + network fees + BATTERY service fee
BATTERY REVENUE     = service fee
BATTERY CONTRIBUTION= service fee - hosting/RPC/storage/support/recovery costs
```

SDK-only users pay no BATTERY service fee. The proposed hosted fee is not a percentage of reserve principal or speculative trading volume. No inference markup, profitable margin, token demand or buyback-funded revenue is demonstrated.

## Evidence required before setting a paid tariff

One useful paid-provider task must have an authoritative charge tied to its request ID, bounded reserve/gas authorization and an accepted result. Recovery must reconcile billed failures and unknown outcomes; it must not silently repeat a potentially charged request. Measure actual runtime/RPC/storage costs per active agent and have one external operator pay for this service. Until then, pricing and margin remain hypotheses.
