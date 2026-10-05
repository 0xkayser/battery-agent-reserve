"""One retained direct-USDC paid resource run. No paid POST retry for unknown outcomes."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from core import canonical, digest

ROOT = Path(__file__).resolve().parent
STATE = ROOT / 'resource-state' / 'x402-mainnet-v1'
JOBS = ('source-001', 'source-002', 'source-003')


class Held(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


class ResourceCommand:
    def __call__(self, command, job='-', approve=False, crash=False):
        flags = ['--approve-max-0.03-usdc'] if approve else []
        if crash:
            flags.append('--crash-after-receipt')
        proc = subprocess.run(['node', str(ROOT / 'chain/resource.mjs'), command, job, *flags],
                              cwd=ROOT, env={**os.environ, 'BATTERY_RESOURCE_LOCK': '1'},
                              capture_output=True, text=True, timeout=180)
        if proc.returncode == 76:
            raise SystemExit(76)
        if proc.returncode:
            raise Held('Resource operation held; retained journal. No purchase retry.')
        try:
            return json.loads(proc.stdout)
        except (TypeError, ValueError):
            raise Held('Resource command returned invalid state') from None


class ResourceRuntime:
    def __init__(self, path, command):
        self.command = command
        self.db = sqlite3.connect(path, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS run(id INTEGER PRIMARY KEY CHECK(id=1), plan TEXT NOT NULL,
          plan_hash TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0, refund TEXT, refund_hash TEXT);
        CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, status TEXT NOT NULL,
          payment_hash TEXT, receipt TEXT, receipt_hash TEXT, charge INTEGER, result TEXT, result_hash TEXT);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL,
          job TEXT, details TEXT NOT NULL);
        ''')

        if 'refund_hash' not in [r[1] for r in self.db.execute('PRAGMA table_info(run)')]:
            self.db.execute('ALTER TABLE run ADD COLUMN refund_hash TEXT')

    def event(self, kind, job=None, **details):
        self.db.execute('INSERT INTO events(at,kind,job,details) VALUES(?,?,?,?)',
                        (now(), kind, job, canonical(details)))

    def close(self):
        self.db.close()

    def prepare(self):
        plan = self.command('init')
        row = self.db.execute('SELECT * FROM run').fetchone()
        if row:
            if row['plan_hash'] != digest(plan) or row['plan'] != canonical(plan):
                raise Held('Retained plan changed; do not reset or move state to purchase again')
            return plan
        self.db.execute('BEGIN IMMEDIATE')
        try:
            self.db.execute('INSERT INTO run(id,plan,plan_hash) VALUES(1,?,?)', (canonical(plan), digest(plan)))
            for job in JOBS:
                self.db.execute("INSERT INTO jobs(id,status) VALUES(?, 'prepared')", (job,))
            self.event('immutable_plan_saved', policy_hash=digest(plan['policy']))
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise
        return plan

    def check(self):
        run = self.db.execute('SELECT * FROM run').fetchone()
        if not run or run['plan_hash'] != digest(json.loads(run['plan'])):
            raise Held('Plan integrity failure')
        if run['refund'] and run['refund_hash'] != digest(json.loads(run['refund'])):
            raise Held('Refund integrity failure')
        for row in self.db.execute('SELECT * FROM jobs'):
            for field in ('receipt', 'result'):
                if row[field] and row[field + '_hash'] != digest(json.loads(row[field])):
                    raise Held('Durable job integrity failure')
            if row['charge'] is not None:
                r = json.loads(row['receipt'])
                if row['charge'] != r['confirmation']['amountUsdc'] or row['result'] and row['result'] != canonical(r['result']):
                    raise Held('Result/charge integrity failure')
        if run['closed']:
            spent = self.db.execute('SELECT COALESCE(SUM(charge),0) FROM jobs').fetchone()[0]
            if not run['refund'] or json.loads(run['refund'])['receipt']['amountUsdc'] != 1000000-spent:
                raise Held('Invalid closed run refund')
        return run

    def run(self, approve=False, crash_after=None, refund=True):
        self.prepare()
        run = self.check()
        if run['closed']:
            self.event('closed_run_replayed_no_purchase')
            return self.status()
        if not approve:
            raise Held('A new explicit budget is required before paid signing/dispatch/refund')
        for index, job in enumerate(JOBS, 1):
            row = self.db.execute('SELECT * FROM jobs WHERE id=?', (job,)).fetchone()
            if row['status'] == 'complete':
                self.event('completed_job_skipped', job)
                continue
            if row['status'] == 'paid_result_rejected':
                raise Held('Vendor charged but result rejected; retained expense; no next purchase')
            if row['status'] == 'prepared':
                authorization = self.command('authorize', job, approve=True)
                if not isinstance(authorization.get('paymentHash'), str) or len(authorization['paymentHash']) != 64:
                    raise Held('Durable payment authorization missing')
                self.db.execute('UPDATE jobs SET status=?,payment_hash=? WHERE id=?',
                                ('authorized', authorization['paymentHash'], job))
                self.event('payment_authorization_saved', job, payment_hash=authorization['paymentHash'])
            # Mark before subprocess. A lost process result reconciles its retained outbox,
            # never assumes no effect and never creates another authorization.
            current = self.command('job-status', job)
            if current['paymentHash'] != self.db.execute('SELECT payment_hash FROM jobs WHERE id=?', (job,)).fetchone()[0]:
                raise Held('Payment outbox identity changed')
            if current['state'] == 'authorized':
                self.db.execute("UPDATE jobs SET status='dispatching' WHERE id=?", (job,))
                self.event('paid_dispatch_intent', job)
                self.command('dispatch', job, approve=True, crash=index == crash_after)
            elif not current.get('receiptSaved'):
                self.db.execute("UPDATE jobs SET status='uncertain' WHERE id=?", (job,))
                self.event('unknown_paid_outcome_held', job)
                raise Held('Unknown paid outcome; no automated purchase retry')
            else:
                self.event('saved_response_recovered_no_purchase', job)
            receipt = self.command('verify', job)
            confirmation = receipt.get('confirmation', {})
            if receipt.get('state') not in ('complete', 'paid_result_rejected') or confirmation.get('amountUsdc') != 7000 or confirmation.get('operatorPurchaseFeeLamports') != 0:
                raise Held('Finalized paid result not verified')
            self.db.execute('BEGIN IMMEDIATE')
            try:
                spent = self.db.execute("SELECT COALESCE(SUM(charge),0) FROM jobs").fetchone()[0]
                if spent + 7000 > 30000 or confirmation['afterUsdc'] < 970000:
                    raise Held('Verified spend exceeds retained policy')
                accepted = receipt['state'] == 'complete'
                self.db.execute("UPDATE jobs SET status=?,receipt=?,receipt_hash=?,charge=?,result=?,result_hash=? WHERE id=?",
                                (receipt['state'], canonical(receipt), digest(receipt), 7000, canonical(receipt['result']) if accepted else None, digest(receipt['result']) if accepted else None, job))
                self.event('paid_task_completed' if accepted else 'charged_result_rejected', job, charge_usdc_units=7000, signature=confirmation['signature'], result_hash=digest(receipt['result']))
                self.db.execute('COMMIT')
            except BaseException:
                self.db.execute('ROLLBACK')
                raise
            if not accepted:
                raise Held('Vendor charged but result rejected; expense booked; no next purchase')
        if refund:
            self.refund(approve)
        return self.status()

    def refund(self, approve=False):
        if not approve:
            raise Held('Cancellation refund requires approved budget')
        self.check()
        if self.db.execute('SELECT closed FROM run').fetchone()[0]:
            return self.status()
        result = self.command('refund', approve=True)
        spent = self.db.execute('SELECT COALESCE(SUM(charge),0) FROM jobs').fetchone()[0]
        if result.get('state') != 'refunded' or result.get('receipt', {}).get('amountUsdc') != 1000000-spent:
            raise Held('Remaining principal not confirmed returned')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            self.db.execute('UPDATE run SET closed=1,refund=?,refund_hash=? WHERE id=1', (canonical(result), digest(result)))
            self.event('principal_returned_run_closed', amount_usdc_units=1000000-spent, signature=result['receipt']['signature'])
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise
        return self.status()


    def status(self):
        run = self.check()
        jobs = [{'job':r['id'], 'state':r['status'], 'chargeUsdcUnits':r['charge'],
                 'result':json.loads(r['result']) if r['result'] else None}
                for r in self.db.execute('SELECT * FROM jobs ORDER BY id')]
        return {'schema':'battery.resource-runtime/1', 'owner':json.loads(run['plan'])['owner'],
                'closed':bool(run['closed']), 'jobs':jobs,
                'spentUsdcUnits':sum(r['chargeUsdcUnits'] or 0 for r in jobs),
                'refund':json.loads(run['refund']) if run['refund'] else None,
                'events':[dict(r) for r in self.db.execute('SELECT at,kind,job,details FROM events ORDER BY id')]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=('prepare','probe','status','run','cancel','export'))
    parser.add_argument('--approve-max-0.03-usdc', dest='approve_max_0_03_usdc', action='store_true')
    parser.add_argument('--crash-after-receipt', type=int, choices=(1,2,3))
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    if STATE.is_symlink() or STATE.stat().st_mode & 0o077:
        raise Held('Private retained state must be mode0700')
    with (STATE/'controller.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Held('Another resource controller is running') from None
        command = ResourceCommand()
        runtime = ResourceRuntime(STATE/'runtime.sqlite', command)
        try:
            runtime.prepare()
            if args.command == 'prepare':
                result = runtime.command('status')
            elif args.command == 'probe':
                result = command('probe', JOBS[0])
            elif args.command == 'status':
                result = runtime.status()
            elif args.command == 'cancel':
                result = runtime.refund(args.approve_max_0_03_usdc)
            elif args.command == 'run':
                result = runtime.run(args.approve_max_0_03_usdc, args.crash_after_receipt)
            else:
                runtime.check()
                proof = command('export')
                proof['runtime'] = runtime.status()
                if not proof['runtime']['closed']:
                    raise Held('Refund/closure required before exporting completion')
                proof['refundProof'] = command('verify-refund')
                proof['supervisor'] = json.loads((STATE/'supervisor.json').read_text())
                result = {'body':proof, 'sha256':digest(proof)}
            print(json.dumps(result, indent=2, allow_nan=False))
        finally:
            runtime.close()


if __name__ == '__main__':
    try:
        main()
    except Held as e:
        raise SystemExit(str(e)) from None
