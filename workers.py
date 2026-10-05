"""Two independent deterministic worker runtimes for offline compatibility tests.

No LLM or external side effect. Both produce the same aggregation of public
run records. Actual AI/model/browser migration requires a specific adapter.
"""
import json
from pathlib import Path
import subprocess


def python_worker(payload):
    records = payload["records"]
    return {"count": len(records), "failed": sum(r["status"] == "failed" for r in records),
            "ok": sum(r["status"] == "ok" for r in records),
            "total_micro_usd": sum(r["cost_micro_usd"] for r in records)}


def node_worker(payload):
    run = subprocess.run(["node", str(Path(__file__).with_name("worker.mjs"))],
                         input=json.dumps(payload), text=True, capture_output=True,
                         check=True, timeout=10)
    return json.loads(run.stdout)
