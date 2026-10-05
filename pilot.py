"""Bounded, user-authorized read-only observer for public www API.

No inference, payments, wallet, HTTP listener or outgoing messages. This pilot
tests real elapsed-time persistence, not paid-provider failover. Start only with
user authorization. The ledger is deliberately paper-only with zero-cost jobs.
"""
import argparse
from decimal import Decimal, ROUND_CEILING
import hashlib
import json
import os
from pathlib import Path
import time
from urllib.request import Request, urlopen

from core import Battery
from workers import node_worker, python_worker

URL = "https://worldwideweb.stream/api/v1/symbients/GAwhcphCqCv5bKHmCiN4VDdNWfbXJL4npmkc8L3Q9S9H/runs?limit=100"


def fetch_records():
    request = Request(URL, headers={"User-Agent": "Battery-readonly-pilot/0.1"})
    with urlopen(request, timeout=20) as response:
        raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError("Response too large")
    data = json.loads(raw)
    if data.get("ok") is not True or not isinstance(data.get("data"), list):
        raise ValueError("Invalid public source response")
    # Only counts, no error text/provider account identifiers or browser data.
    records = []
    for row in data["data"]:
        if not isinstance(row["id"], int) or row["status"] not in ("ok", "failed", "running", "starved"):
            raise ValueError("Invalid run record")
        observed_cost = Decimal(str(row["costUsd"]))
        if not observed_cost.is_finite() or not 0 <= observed_cost <= 10**6:
            raise ValueError("Invalid observed cost")
        records.append({"id": row["id"], "status": row["status"], "cost_micro_usd": int(
            (observed_cost * 1000000).to_integral_value(rounding=ROUND_CEILING))})
    return {"records": records}, data["meta"]["generatedAt"]


def atomic_json(path, value):
    temp = path.with_suffix(".tmp")
    with temp.open("w") as file:
        json.dump(value, file, indent=2)
        file.write("\n")
        file.flush()
        os.fsync(file.fileno())
    os.replace(temp, path)


def observe(b, epoch, job_id, payload, now, worker):
    ticket = b.reserve(job_id, payload, [{"mode": "local-unbilled", "max_cost": 0,
                       "provider_headroom": 0}], epoch=epoch, now=now)
    if not ticket["execute"]:
        # Reconciliation is safe for THIS side-effect-free deterministic job.
        # This is not an automatic retry rule for any paid/external operation.
        if ticket["status"] in ("done", "failed"):
            return
        if ticket["status"] == "reserved":
            payload = b.dispatch(job_id, epoch=epoch)
        else:
            payload = json.loads(ticket["request"])
    else:
        payload = b.dispatch(job_id, epoch=epoch)
    output = worker(payload)
    b.settle(job_id, epoch=epoch, receipt_id=f"local/{job_id}", actual=0, output=output, now=now)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours", type=int, default=72)
    parser.add_argument("--interval-seconds", type=int, default=3600)
    parser.add_argument("--directory", type=Path, default=Path(__file__).parent / "pilot-state")
    args = parser.parse_args()
    if not 1 <= args.hours <= 72 or not 60 <= args.interval_seconds <= 3600:
        parser.error("hours 1..72; interval 60..3600 seconds")
    args.directory.mkdir(parents=True, exist_ok=True)
    # Exclusive process lock; kernel releases it if the process dies.
    import fcntl
    with (args.directory / "pilot.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        meta_path = args.directory / "pilot.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())
            if meta["hours"] != args.hours or meta["interval"] != args.interval_seconds:
                raise ValueError("Existing pilot config differs; use a different directory")
        else:
            meta = {"hours": args.hours, "interval": args.interval_seconds,
                    "start": int(time.time()), "mode": "read-only-observer-no-inference"}
            atomic_json(meta_path, meta)
        b = Battery(str(args.directory / "ledger.sqlite"))
        try:
            if b.db.execute("SELECT 1 FROM account").fetchone() is None:
                b.configure(floor=0, daily=1, per_job=1)
            runtime = None
            epoch = None
            end = meta["start"] + args.hours * 3600
            while time.time() < end:
                now = int(time.time())
                slot = (now - meta["start"]) // args.interval_seconds
                desired = "python" if now - meta["start"] < 24*3600 else "node"
                if runtime != desired:
                    epoch = b.takeover(desired)
                    runtime = desired
                job_id = f"slot-{slot:06d}"
                try:
                    existing = b.db.execute("SELECT request FROM jobs WHERE id=?", (job_id,)).fetchone()
                    if existing:
                        payload = json.loads(existing["request"])
                    else:
                        payload, generated_at = fetch_records()
                        # Provenance retained separately; no secrets or source text.
                        atomic_json(args.directory / "source.json", {"url": URL, "generatedAt": generated_at,
                                    "payloadSha256": hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()})
                    observe(b, epoch, job_id, payload, now, python_worker if runtime == "python" else node_worker)
                    atomic_json(args.directory / "checkpoint.json", b.checkpoint())
                    atomic_json(args.directory / "status.json", {"mode": meta["mode"], "runtime": runtime,
                                "start": meta["start"], "deadline": end, "updated": now,
                                "missed_slots_not_backfilled": True, "snapshot": b.snapshot()})
                except Exception as error:
                    # Log type only: provider messages may contain private ids.
                    print(json.dumps({"slot": slot, "error_type": type(error).__name__}), flush=True)
                wake = min(end, meta["start"] + (slot+1)*args.interval_seconds)
                time.sleep(max(0, wake-time.time()))
        finally:
            b.close()


if __name__ == "__main__":
    main()
