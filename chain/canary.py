"""Kernel-released single-operator lock. No financial command is enabled by default."""
import fcntl,os,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
state=root/'mainnet-state'/'canary';state.mkdir(parents=True,exist_ok=True,mode=0o700)
with (state/'operator.lock').open('a') as lock:
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise SystemExit('Another canary operator is running; no second worker authorized')
    result=subprocess.run(['node',str(root/'chain'/'canary.mjs'),*sys.argv[1:]],
                          env={**os.environ,'BATTERY_CANARY_LOCK':'1'},cwd=root)
    raise SystemExit(result.returncode)
