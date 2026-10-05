"""Bounded actual-model crash/restart experiment; no paid calls or signing."""
import argparse
import collections
import json
from pathlib import Path
import subprocess
import sys
import time
from core import verify_checkpoint


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--state-dir", default="live-state")
    p.add_argument("--primary", default="qwen2.5:7b")
    p.add_argument("--fallback", default="llama3.2:3b")
    args = p.parse_args()
    state = Path(args.state_dir)
    if (state / "agent.sqlite").exists():
        raise SystemExit("Use a fresh state directory for a new experiment; existing state will not be reset")
    started = time.time()
    entry = str(Path(__file__).with_name("live_agent.py"))
    command = [sys.executable, entry, "--state-dir", str(state), "--jobs", "3"]
    first = subprocess.run(command + ["--model", args.primary, "--crash-after", "2"], timeout=600)
    if first.returncode != 73:
        raise SystemExit(f"Expected controlled exit73, got{first.returncode}; no recovery claim")
    crashed = time.time()
    subprocess.run(command + ["--model", args.fallback], check=True, timeout=600)
    ended = time.time()
    data = json.loads((state / "live-agent.json").read_text())
    verify_checkpoint(data["checkpoint"])
    calls = collections.Counter(e["job"] for e in data["events"] if e["kind"] == "model_call_started")
    assert dict(calls) == {"research-001": 1, "research-002": 1, "research-003": 1}
    assert len(data["checkpoint"]["body"]["results"]) == 3
    assert any(e["kind"] == "recovered_without_model_call" and e["job"] == "research-002" for e in data["events"])
    results = data["checkpoint"]["body"]["results"]
    assert results[-1]["output"]["input"]["previousCompletedIds"] == ["research-001", "research-002"]
    assert results[-1]["output"]["model"] == args.fallback
    data["experiment"] = {"startedAt": started, "crashedAt": crashed, "finishedAt": ended,
                          "elapsedSeconds": round(ended - started, 3),
                          "restartThroughCompletionSeconds": round(ended - crashed, 3),
                          "forcedExitCode": 73, "uniqueModelCalls": 3,
                          "duplicateModelCalls": 0, "primary": args.primary,
                          "approvedFallback": args.fallback, "completedTasks": 3,
                          "inheritedCompletedIds": results[-1]["output"]["input"]["previousCompletedIds"]}
    (state / "live-agent.json").write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps(data["experiment"], indent=2))


if __name__ == "__main__":
    main()
