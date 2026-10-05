# Adapter contract

1. Identify an owned, useful workload and portable task input. Keep provider keys and browser sessions outside checkpoints.
2. Configure protected floor, daily cap and maximum job cost in integer microUSD.
3. Supply a **worst-case** quote and provider headroom from trusted operator/authenticated adapter. Historical average cost is not an authorization.
4. reserve(job_id, payload, approved_options, epoch=epoch, now=...). A replay returns execute=False; do not repeat dispatch just because a record was returned.
5. dispatch before the external effect. A dispatched crash has an uncertain outcome until reconciliation.
6. Persist request identity, receipt and result durably. For paid tasks use authoritative billing, including failed attempts that incurred costs. An invented local receipt is not billing proof.
7. settle actual cost against the same request. A receipt reused with different content is rejected. An overcharge is booked and new work halted.
8. checkpoint confirmed results; takeover fences the previous worker. Keep the authoritative ledger. Unknown attempts stay held; durable receipts reconcile without replay.

```python
from core import Battery
b = Battery('paper.sqlite')
b.configure(floor=1_000_000, daily=2_000_000, per_job=100_000)
b.credit_paper('initial', 3_000_000)  # Test bookkeeping, not a deposit
epoch = b.takeover('owned-worker')
auth = b.reserve('job-1', {'task': 'example'},
    [{'mode': 'approved', 'max_cost': 50_000, 'provider_headroom': 100_000}],
    epoch=epoch, now=0)
if auth['execute']:
    payload = b.dispatch('job-1', epoch=epoch)
    # Perform authorized task; durably save its actual receipt before settle.
    # Unknown outcome: stop/reconcile, never blindly repeat an external effect.
b.close()
```

workers.py is deterministic. live_agent.py runs actual local Ollama with zero provider-charge bookkeeping. Neither authenticates a paid provider balance. run_recovery.py is the bounded reproduction harness.
