"""Counterfactual 72 logical hours using observed public www costs.

Not an uptime observation. Jobs, reserve, cadence and crash are synthetic.
One isolated temporary ledger, no background tasks, network or paid calls.
"""
from decimal import Decimal, ROUND_CEILING
import json
from pathlib import Path
import tempfile

from core import Battery, Denied, verify_checkpoint
from workers import node_worker, python_worker

ROOT = Path(__file__).parent


def micro(value):
    return int((Decimal(str(value)) * 1000000).to_integral_value(rounding=ROUND_CEILING))


def replay():
    evidence = json.loads((ROOT / "evidence/www-runs.json").read_text())
    runs = evidence["data"]
    selected_runs = [r for r in runs if r["costUsd"] > 0]
    costs = [micro(r["costUsd"]) for r in selected_runs]
    if len(costs) < 72:
        raise ValueError("Insufficient observed costs; don't invent the rest")
    initial = sum(costs[:72]) + 1000000
    with tempfile.TemporaryDirectory() as directory:
        path = str(Path(directory) / "paper.sqlite")
        b = Battery(path)
        b.configure(floor=1000000, daily=initial, per_job=max(costs))
        b.credit_paper("synthetic-initial-reserve", initial)
        epoch = b.takeover("python")
        charges = 0
        for hour, (row, cost) in enumerate(zip(selected_runs[:72], costs[:72])):
            now = hour * 3600
            job_id = f"hour-{hour:02d}"
            payload = {"records": [{"id": row["id"], "status": row["status"], "cost_micro_usd": micro(row["costUsd"])}]}
            b.reserve(job_id, payload, [{"mode": "recorded-cost-paper", "max_cost": cost,
                      "provider_headroom": initial}], epoch=epoch, now=now)
            input_data = b.dispatch(job_id, epoch=epoch)
            output = python_worker(input_data) if hour < 24 else node_worker(input_data)
            charges += 1  # Fake provider operation, not a model call.
            if hour == 23:
                # Provider responded, then worker died BEFORE local commit.
                # New runtime must reconcile this known receipt, not pay again.
                checkpoint = b.checkpoint()
                b.close()
                b = Battery(path)
                epoch = b.takeover("node")
                verify_checkpoint(checkpoint)
                duplicate = b.reserve(job_id, payload, [], epoch=epoch, now=now)
                assert not duplicate["execute"] and duplicate["status"] == "uncertain"
            b.settle(job_id, epoch=epoch, receipt_id=f"paper-receipt-{hour}", actual=cost,
                     output=output, now=now)
            assert not b.reserve(job_id, payload, [], epoch=epoch, now=now)["execute"]
        checkpoint = b.checkpoint()
        state = b.snapshot()
        assert len(checkpoint["body"]["results"]) == charges == 72
        assert state["balance"] == state["floor"] == 1000000 and state["held"] == 0
        try:
            b.reserve("over-floor", {}, [{"mode": "paper", "max_cost": 1,
                      "provider_headroom": initial}], epoch=epoch, now=72*3600)
        except Denied:
            floor_guard = True
        else:
            raise AssertionError("Reserve floor breached")
        b.close()
        return {"mode": "counterfactual-paper-replay", "wall_clock_72h_uptime": False,
                "evidence_generated_at": evidence["meta"]["generatedAt"],
                "evidence_sample": len(runs), "logical_hours": 72, "creator_fee_topups": 0,
                "reserve_initial_micro_usd": initial, "recorded_costs_micro_usd": sum(costs[:72]),
                "reserve_final_micro_usd": state["balance"], "protected_floor_micro_usd": state["floor"],
                "completed_paper_jobs": charges, "duplicate_paper_charges": 0,
                "simulated_crashes": 1, "runtimes": ["python", "node"], "floor_guard": floor_guard,
                "checkpoint_sha256": checkpoint["sha256"],
                "limitations": ["Synthetic workload/reserve/cadence; sampled charges do not forecast runway",
                                "Recorded costs include failed provider runs; aggregation jobs here are deterministic",
                                "No LangGraph/Temporal/Agency/www migration, model calls or onchain funds"]}


if __name__ == "__main__":
    result = replay()
    (ROOT / "evidence/paper-replay-result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
