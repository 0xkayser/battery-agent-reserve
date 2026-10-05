# BATTERY / one paid-provider attempt

October 5, 2026. **Actual API recovery verified; content acceptance failed; authoritative billing unverified.** One real generation completed, exit75 followed durable receipt storage, two recoveries made no new generation, and an authenticated GET matched response identity/usage/output. Sixteen offline checks cover failures, content gating and published proof integrity. This separate experiment does not spend Solana USDC or reopen the closed mainnet canary.

`paid_provider.py` runs one useful OpenAI operator brief about BATTERY's published canary. It journals the exact request, unique client request ID, provider response/request IDs, usage and structured output in private SQLite. Recovery uses the durable receipt without another generation. Unknown dispatches stay held, including timeouts and HTTP failures. A client request ID is for support correlation, **not an idempotency guarantee**.

## Fixed scope and price assumptions

- One generation attempt per retained state; pinned `gpt-4.1-mini-2025-04-14`, standard tier, no tools, images, reasoning or follow-up turns.
- Approved experiment allocation: at most $0.10. Full allocation remains held after dispatch; an estimate never releases it or settles actual billing.
- Exact JSON <=8,000 UTF-8 bytes; conservative assumption <=10,048 input tokens including framing/schema, <=512 output tokens requested. The input assumption is **not a provider-enforced limit or account spending cap**. Unexpected usage fails reconciliation.
- Standard text prices reviewed October5: $0.40/million input, $1.60/million output; cache discounts ignored. Assumed upper estimate $0.0048384; rounded up to $0.004839. New dispatch refuses the snapshot from October12 onward; saved-result recovery still works.
- Protection applies to this journal, not other processes, keys, projects or copied/deleted state. Never reset a dispatched attempt to retry it. Configure provider project controls separately.

Source: [official model reference](https://developers.openai.com/api/docs/models/gpt-4.1-mini). `store:true` is requested for public-data response retrieval; provider retention policy may override storage. A failed GET never authorizes a new generation.

## Operator runbook

Python3.10+ on Linux/macOS; no added Python dependencies. Tests and plan/status never contact a provider:

```sh
python3 -m unittest -v test_paid_provider.py
python3 paid_provider.py plan
python3 paid_provider.py status
```

Save a valid key only in root `.env.local` as `OPENAI_API_KEY=...`, mode0600. Do not put it in chat, source, checkpoints or the website. No shell sourcing. Public kit excludes `.env*` and `paid-state/`.

After explicit approval of the one paid request and allocation:

```sh
python3 paid_provider.py run --approve-one-request --crash-after-receipt
# Expected exit75 only AFTER the API receipt is committed with SQLite FULL.
python3 paid_provider.py recover    # receipt -> result/estimate, no POST
python3 paid_provider.py recover    # repeat: same result, no POST
python3 paid_provider.py readback   # authenticated GET of known response
```

CLI retains `paid-state/operator-brief-v1/`, with no reset or automatic retry. Kernel lock refuses concurrency. Changed inputs/policy, missing credentials and stale prices stop dispatch. TLS endpoint is fixed `https://api.openai.com`; redirects, environment proxies and automatic retries are disabled. HTTP errors omit upstream text.

## Evidence and remaining gate

| Record | Meaning |
| --- | --- |
| Request/response IDs | Authenticated API evidence during operator run; not a signed invoice |
| Matching authenticated GET | Provider retained matching identity, usage and output; no new generation |
| Usage x prices | Estimate, not actual charge or available credit |
| Local hashes | Integrity under trusted operator; machine owner can forge records |
| Prior Solana transfers | Owned-worker result settlements; do not pay this provider |

Incomplete/refused responses can still cost money. Receipt remains private; attempt stays held. Without a known response ID, preserve client request ID for provider reconciliation; no blind second POST.

OpenAI [Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs) requires admin authorization and supplies aggregate time-bucket charges. It cannot prove an individual response fee merely from its ID. Do not attach unrelated aggregate spend to this task.

Before paid-service readiness: reconcile authoritative project billing including failed attempts, measure operating costs, and obtain a paying external operator. API success and the proposed $9 managed fee prove neither margin nor revenue.


## Actual run / October5

- One Responses generation; 336 input +234 output =570 tokens. Calculated estimate rounded up: $0.000509. **Actual provider charge remains unknown.**
- Process exited75 after receipt commit; recovered twice from the same receipt with no new POST. Authenticated GET matched response identity, usage and output.
- API execution/recovery passed. **Operator report rejected:** model misread exit code74 as 74 crashes and 40,000lamports total fees across8 transactions as per-call fees. This text cannot be used as an accepted deliverable.
- Content review is mandatory and bound to the request/result hashes; pending/rejected reports do not authorize downstream work. Billing is a separate pending gate even for accepted content.
- No second paid request was submitted to repair the text. Next authorized experiment must state `intentional_crashes:1`, `process_exit_code:74` and `total_fee_lamports_for_8_transactions:40000` explicitly. Preserve this original rejected output and journal.

[Selected API record](https://usebattery.xyz/evidence/paid-provider.json) includes public source observations, provider IDs, usage, output quarantined by its rejection, recovery events and limitations. `python3 verify_paid.py` verifies offline relationships; it cannot independently authenticate the provider or establish an invoice.

A [maintainer-reviewed operator brief](https://usebattery.xyz/evidence/operator-brief-reviewed.md) corrects the two factual errors against the source. It is an explicitly manual derivative; the raw response remains rejected and no customer acceptance or authoritative charge is implied.
