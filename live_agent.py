"""Owned local AI researcher with durable receipts and crash recovery.

The USD ledger remains paper. Local model calls have no provider charge.
Public devnet reads are live. No wallet or remote commands are accepted.
"""
import argparse
import json
import os
from pathlib import Path
import time
from adapters import OllamaAdapter, network_snapshot
from core import Battery, Denied, canonical, digest


class AgentRuntime:
    def __init__(self, state_dir, model):
        self.path = Path(state_dir)
        self.path.mkdir(parents=True, exist_ok=True)
        self.b = Battery(str(self.path / "agent.sqlite"))
        self.b.db.executescript("""
        CREATE TABLE IF NOT EXISTS adapter_inputs (job TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS adapter_receipts (job TEXT PRIMARY KEY, request_hash TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS adapter_events (id INTEGER PRIMARY KEY, at REAL NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL);
        """)
        if not self.b.db.execute("SELECT 1 FROM account").fetchone():
            self.b.configure(floor=1_000_000, daily=2_000_000, per_job=100_000)
            self.b.credit_paper("paper-setup", 3_000_000)
        self.epoch = self.b.takeover("ollama:" + model)
        self.model = model
        self.event("worker_started", {"epoch": self.epoch, "model": model})

    def event(self, kind, body):
        with self.b.tx():
            self.b.db.execute("INSERT INTO adapter_events(at,kind,body) VALUES(?,?,?)",
                              (time.time(), kind, canonical(body)))

    def input_for(self, job):
        row = self.b.db.execute("SELECT body FROM adapter_inputs WHERE job=?", (job,)).fetchone()
        if row:
            return json.loads(row[0])
        payload = {"task": "devnet_operator_brief", "observation": network_snapshot(),
                   "previousCompletedIds": [r["id"] for r in self.b.checkpoint()["body"]["results"]]}
        with self.b.tx():
            self.b.db.execute("INSERT INTO adapter_inputs VALUES(?,?)", (job, canonical(payload)))
        self.event("tool_observation_saved", {"job": job, "slot": payload["observation"]["slot"]})
        return payload

    def save_receipt(self, job, payload, output):
        """SQLite FULL commit occurs before the deliberate crash boundary."""
        body = {"id": "local:" + job, "job": job, "actualMicroUsd": 0,
                "observedAt": time.time(), "output": output}
        with self.b.tx():
            self.b.db.execute("INSERT INTO adapter_receipts VALUES(?,?,?)",
                              (job, digest(payload), canonical(body)))
        self.event("adapter_receipt_saved", {"job": job, "model": output["model"]})
        return body

    def reconcile(self, job, receipt, payload):
        if receipt["job"] != job or receipt["id"] != "local:" + job or receipt["actualMicroUsd"] != 0:
            raise Denied("Invalid local adapter receipt")
        row = self.b.db.execute("SELECT request_hash FROM adapter_receipts WHERE job=?", (job,)).fetchone()
        if not row or row[0] != digest(payload):
            raise Denied("Receipt does not match persisted input")
        self.b.settle(job, epoch=self.epoch, receipt_id=receipt["id"], actual=0,
                      output={"input": payload, **receipt["output"]}, now=int(time.time()))
        self.event("ledger_settled", {"job": job, "epoch": self.epoch})

    def run(self, jobs=3, crash_after=None):
        for index in range(1, jobs + 1):
            job = f"research-{index:03d}"
            old = self.b.db.execute("SELECT status FROM jobs WHERE id=?", (job,)).fetchone()
            if old and old[0] == "done":
                self.event("completed_task_skipped", {"job": job})
                continue
            payload = self.input_for(job)
            saved = self.b.db.execute("SELECT body FROM adapter_receipts WHERE job=?", (job,)).fetchone()
            if saved:
                self.reconcile(job, json.loads(saved[0]), payload)
                self.event("recovered_without_model_call", {"job": job})
                continue
            if old and old[0] == "uncertain":
                raise Denied("No durable receipt: outcome unknown; operator reconciliation required")
            if not old:
                self.b.reserve(job, payload, [{"mode": "local:" + self.model, "max_cost": 0,
                               "provider_headroom": 0}], epoch=self.epoch, now=int(time.time()))
            self.b.dispatch(job, epoch=self.epoch)
            self.event("model_call_started", {"job": job, "model": self.model})
            output = OllamaAdapter(self.model).research(payload)
            receipt = self.save_receipt(job, payload, output)
            if index == crash_after:
                self.event("forced_process_exit", {"job": job, "exitCode": 73,
                                                    "boundary": "receipt_durable_before_ledger_settlement"})
                os._exit(73)
            self.reconcile(job, receipt, payload)
        return self.b.checkpoint()

    def export(self):
        events = [{"at": r["at"], "kind": r["kind"], **json.loads(r["body"])}
                  for r in self.b.db.execute("SELECT * FROM adapter_events ORDER BY id")]
        return {"schema": "battery.live-agent/1", "publishedAt": int(time.time()),
                "scope": "Actual local Ollama inference and live Solana devnet reads; paper USD reserve; dated evidence, not a hosted AI service",
                "checkpoint": self.b.checkpoint(), "events": events,
                "paperLedger": self.b.snapshot(), "actualProviderChargeUsd": 0,
                "hardwareElectricityCost": "not_measured"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", default="live-state")
    parser.add_argument("--model", default="qwen2.5:7b")
    parser.add_argument("--jobs", type=int, choices=range(1, 11), default=3)
    parser.add_argument("--crash-after", type=int, choices=range(1, 11))
    args = parser.parse_args()
    runtime = AgentRuntime(args.state_dir, args.model)
    try:
        runtime.run(args.jobs, args.crash_after)
        out = runtime.export()
        (Path(args.state_dir) / "live-agent.json").write_text(json.dumps(out, indent=2) + "\n")
        print(json.dumps({"completed": len(out["checkpoint"]["body"]["results"]),
                          "checkpointSha256": out["checkpoint"]["sha256"]}))
    finally:
        runtime.b.close()


if __name__ == "__main__":
    main()
