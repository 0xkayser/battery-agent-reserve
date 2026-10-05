"""Finite supervisor: one deliberate exit after saved response, one restart, one replay."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from paid_resource import STATE
from integrated_runtime import durable


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--approve-max-0.03-usdc',action='store_true')
    args=parser.parse_args()
    if not args.approve_max_0_03_usdc:
        raise SystemExit('Finite paid run requires fresh explicit capital/spending approval')
    root=Path(__file__).resolve().parent
    base=[sys.executable,str(root/'paid_resource.py'),'run','--approve-max-0.03-usdc']
    first=subprocess.run([*base,'--crash-after-receipt','2'],cwd=root,capture_output=True,text=True)
    exits=[first.returncode]
    if first.returncode==76:
        recovered=subprocess.run(base,cwd=root,capture_output=True,text=True)
        exits.append(recovered.returncode)
        final=recovered
    else:
        final=first
    if final.returncode:
        print(json.dumps({'state':'held','exitCodes':exits,'repeatPurchase':False,
                          'next':'Inspect retained paid_resource.py status; no generic automatic restart'}))
        raise SystemExit(final.returncode)
    report=json.loads(final.stdout)
    # Replay only after the closed run; a CLI call without the financial flag cannot buy.
    replay=subprocess.run([sys.executable,str(root/'paid_resource.py'),'run'],cwd=root,capture_output=True,text=True)
    if replay.returncode or not json.loads(replay.stdout)['closed']:
        raise SystemExit('Read-only closed replay verification failed')
    durable(STATE/'supervisor.json', {'schema':'battery.resource-supervisor/1',
        'exitCodes':exits,'plannedCrashExit':76,'closedReplayPassed':True})
    print(json.dumps({'state':'closed','spentUsdcUnits':report['spentUsdcUnits'],
        'refundUsdcUnits':report['refund']['receipt']['amountUsdc'],'exitCodes':exits,'closedReplayPassed':True}))


if __name__=='__main__':main()
