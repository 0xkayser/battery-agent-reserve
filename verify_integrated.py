"""Offline report relationships; optional read-only finalized chain verification."""
import argparse
import json
from pathlib import Path
from core import Denied, digest, verify_checkpoint
from integrated_runtime import ChainCommand


def verify(path, chain=None):
    path = Path(path)
    report = json.loads(path.read_text())
    if report.get("schema") != "battery.integrated-runtime/1" or report.get("cluster") != "mainnet":
        raise Denied("Wrong integrated report schema/cluster")
    results = verify_checkpoint(report["checkpoint"])["results"]
    if [r["id"] for r in results] != [f"research-{i:03d}" for i in range(1, 4)]:
        raise Denied("Three complete result identities required")
    calls = [e for e in report["modelEvents"] if e["kind"] == "model_call_started"]
    if [e["job"] for e in calls] != [r["id"] for r in results]:
        raise Denied("Three unique ordered model calls required")
    for index, result in enumerate(results):
        job = result["id"]
        saved = json.loads((path.parent / (job + ".json")).read_text())
        if verify_checkpoint(saved["checkpoint"])["results"] != [result]:
            raise Denied("Durable payment result differs from final checkpoint")
        events = report["events"]
        auth = [i for i, e in enumerate(events) if e["kind"] == "chain_budget_authorized" and e["job"] == job]
        durable = [i for i, e in enumerate(events) if e["kind"] == "result_durable" and e["job"] == job]
        paid = [i for i, e in enumerate(events) if e["kind"] == "payment_finalized" and e["job"] == job]
        if not auth or len(durable) != 1 or len(paid) != 1 or not auth[-1] < durable[0] < paid[0]:
            raise Denied("Pre-task authorization/result/finality ordering differs")
        if index and auth[0] <= next(i for i, e in enumerate(events) if e["kind"] == "payment_finalized" and e["job"] == results[index-1]["id"]):
            raise Denied("Next task started before prior payment finality")
        if not events[auth[-1]]["at"] <= calls[index]["at"] <= events[durable[0]]["at"] <= events[paid[0]]["at"]:
            raise Denied("Model call time is outside authorization/result/finality boundary")
        if events[durable[0]]["checkpointSha256"] != digest(saved["checkpoint"]["body"]):
            raise Denied("Result event hash differs")
        receipt = report["payments"].get(job)
        if not receipt or receipt.get("amountUsdc") != 10000 or events[paid[0]]["signature"] != receipt["signature"]:
            raise Denied("Payment amount/signature identity differs")
        if chain and chain("verify-job", job, str(path.parent / (job + ".json"))) != receipt:
            raise Denied("Finalized chain receipt differs")
    return {"completedTasks": 3, "resultSettlements": 3, "verifiedLive": chain is not None,
            "meaning": "Result ordering/integrity; --live additionally verifies finalized payment bytes and USDC deltas"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("path")
    p.add_argument("--name", default="integrated-20261005")
    p.add_argument("--live", action="store_true")
    args = p.parse_args()
    print(json.dumps(verify(args.path, ChainCommand(args.name) if args.live else None)))


if __name__ == "__main__":
    main()
