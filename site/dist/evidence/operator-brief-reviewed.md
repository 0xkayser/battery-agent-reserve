# BATTERY / reviewed operator brief

October 5, 2026. Maintainer-reviewed synthesis of the published canary and the first OpenAI response. **This is a manually corrected derivative, not the raw model output or an accepted customer deliverable.** The original response remains preserved and rejected in paid-provider.json.

## Verified technical scope

- Three owned-agent local inference calls interleaved with three finalized0.01USDC result settlements on Solana mainnet.
- One deliberate process crash after the second payment send, with **exit code74**. Resume reused the same signed transaction and saved model output; replay made no new calls or transfers.
- Eight finalized transactions in that financial experiment. **40,000lamports total network fees**, not per model call. Delegation revoked; all5USDC principal returned. Remaining SOL/rent were not claimed as refunded.
- Separate OpenAI experiment: one generation,336input/234outputtokens, receipt committed before intentional exit75, two local recoveries without generation, authenticated response readback matched.

## Limits that affect a launch decision

The mainnet transfers settled saved results to an owned worker; they did not buy OpenAI inference. The OpenAI token-price estimate is$0.000509 rounded up. Actual provider charge and available credit are unverified. Devnet signed checkpoint remains unconfirmed. No hosted customer agent, automatic gas refill, token, custody vault, independent BATTERY audit or paying customer is demonstrated.

## Recommendation

Use the free self-hosted SDK for a bounded operator pilot. Keep hosted paid-service launch on hold until authoritative provider billing is reconciled and an external operator accepts the deliverable and operating fee. Protect unknown requests from retry; require content review before acting on model reports.

## Corrections to the raw response

The response said74crashes and attributed the total fee to each call. The supplied field namedforced_process_exit carried an exit code; its ambiguous label contributed to the mistake. The corrected report separates crash count, process exit code and total transaction fees. No second paid request was submitted to repair the original. Correctness here comes from checking the source, not from provider API success.
