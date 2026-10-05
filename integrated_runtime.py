"""Interleave one owned task and one finalized mainnet USDC settlement.

No paid provider. No automatic fund top-up. The fixed canary guard is read
before generation and checked again by the actual payment program.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

from core import Denied, digest
from live_agent import AgentRuntime

ROOT = Path(__file__).resolve().parent
NAME = re.compile(r"^[a-z][a-z0-9-]{0,47}$")


def durable(path, body):
    temp = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(body, f, indent=2, allow_nan=False)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class ChainCommand:
    def __init__(self, name):
        if not NAME.fullmatch(name):
            raise Denied("Invalid isolated canary name")
        self.name = name

    def __call__(self, command, *args):
        proc = subprocess.run(
            [sys.executable, str(ROOT / "chain/canary.py"), command, *args],
            cwd=ROOT, env={**os.environ, "BATTERY_CANARY_NAME": self.name},
            capture_output=True, text=True, timeout=240)
        if proc.returncode == 74:
            raise SystemExit(74)
        if proc.returncode != 0:
            # Only bounded Node policy errors, never raw credential/config data.
            error = proc.stderr.strip().splitlines()
            raise Denied(error[-1][:240] if error else "Chain command failed; retain state")
        try:
            return json.loads(proc.stdout)
        except (TypeError, json.JSONDecodeError):
            raise Denied("Chain command returned no valid receipt") from None


class IntegratedRuntime:
    def __init__(self, path, model, chain):
        self.path = Path(path)
        self.path.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.path, 0o700)
        self.chain = chain
        self.agent = AgentRuntime(self.path, model, "mainnet")
        self.file = self.path / "integrated.json"
        self.log = json.loads(self.file.read_text()) if self.file.exists() else {
            "schema": "battery.integrated-runtime/1", "cluster": "mainnet",
            "startedAt": time.time(), "events": [], "payments": {}}

    def event(self, kind, **body):
        self.log["events"].append({"at": time.time(), "kind": kind, **body})
        durable(self.file, self.log)

    def run(self, jobs=3, crash_after_send=None):
        for index in range(1, jobs + 1):
            job = f"research-{index:03d}"
            if job in self.log["payments"]:
                self.event("completed_payment_skipped", job=job)
                continue
            row = self.agent.b.db.execute("SELECT status FROM jobs WHERE id=?", (job,)).fetchone()
            if not row or row[0] not in ("done", "uncertain"):
                authorization = self.chain("authorize-job", job)
                if (authorization.get("schema") != "battery.job-authorization/1"
                        or authorization.get("job") != job
                        or authorization.get("amountUsdc") != 10_000
                        or authorization.get("cluster") != "mainnet"):
                    raise Denied("Invalid chain authorization")
                self.event("chain_budget_authorized", job=job, authorization=authorization)
            # Existing uncertain model call without receipt stops in AgentRuntime.
            # Receipt recovery does not authorize a second inference request.
            self.agent.run(index)
            result = next(r for r in self.agent.b.checkpoint()["body"]["results"] if r["id"] == job)
            body = {"schema": "battery.checkpoint/1", "results": [result]}
            report = {"schema": "battery.runtime-job/1", "cluster": "mainnet", "job": job,
                      "checkpoint": {"body": body, "sha256": digest(body)}}
            report_file = self.path / (job + ".json")
            if report_file.exists() and json.loads(report_file.read_text()) != report:
                raise Denied("Durable result changed; retain payment intent")
            if not report_file.exists():
                durable(report_file, report)
            if not any(e["kind"] == "result_durable" and e.get("job") == job for e in self.log["events"]):
                self.event("result_durable", job=job, checkpointSha256=report["checkpoint"]["sha256"])
            flags = ["--execute-budget-5-usdc"]
            if index == crash_after_send:
                flags.append("--crash-after-send")
            receipt = self.chain("pay-job", job, str(report_file), *flags)
            if (receipt.get("amountUsdc") != 10_000
                    or not isinstance(receipt.get("signature"), str)
                    or not re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{64,88}", receipt["signature"])
                    or type(receipt.get("slot")) is not int
                    or type(receipt.get("feeLamports")) is not int
                    or not 0 <= receipt["feeLamports"] <= 20_000):
                raise Denied("Missing bounded finalized payment receipt")
            self.log["payments"][job] = receipt
            self.event("payment_finalized", job=job, signature=receipt["signature"])
        self.log["checkpoint"] = self.agent.b.checkpoint()
        self.log["modelEvents"] = self.agent.export()["events"]
        self.log["scope"] = "Local inference and mainnet USDC result settlement, not paid-provider billing or hosted service"
        durable(self.file, self.log)
        return self.log


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--name", default="integrated-20261005")
    p.add_argument("--model", default="qwen2.5:7b")
    p.add_argument("--execute-budget-5-usdc", action="store_true")
    p.add_argument("--crash-after-send", type=int, choices=(1, 2, 3))
    args = p.parse_args()
    chain = ChainCommand(args.name)
    if not args.execute_budget_5_usdc:
        # Read-only: no model process, signing, broadcast or ledger credit.
        print(json.dumps(chain("authorize-job", "research-001"), indent=2))
        return
    state = ROOT / "mainnet-state" / args.name
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / "runtime.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Denied("Another integrated runner owns this state") from None
        runtime = IntegratedRuntime(ROOT / "live-state" / args.name, args.model, chain)
        try:
            report = runtime.run(crash_after_send=args.crash_after_send)
            print(json.dumps({"payments": len(report["payments"]),
                              "checkpointSha256": report["checkpoint"]["sha256"]}))
        finally:
            runtime.agent.b.close()


if __name__ == "__main__":
    try:
        main()
    except Denied as e:
        raise SystemExit(str(e)) from None
