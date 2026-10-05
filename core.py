"""Paper-only BATTERY ledger. No payment, chain, HTTP or model client.

All monetary values are integers in micro-USD. A worker is a trusted local
operator, not a security principal. Callers must supply trusted bounded quotes
and reconcile authoritative receipts; arbitrary worker input is not billing proof.
"""
from contextlib import contextmanager
import hashlib
import json
import sqlite3


def integer(value):
    if type(value) is not int or not 0 <= value <= 10**15:
        raise ValueError("Expected non-negative integer micro-USD/time")
    return value


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class Denied(Exception):
    pass


class Battery:
    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=10, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS account (
          id INTEGER PRIMARY KEY CHECK(id=1), balance INTEGER NOT NULL,
          floor INTEGER NOT NULL, daily INTEGER NOT NULL, per_job INTEGER NOT NULL,
          epoch INTEGER NOT NULL, runtime TEXT NOT NULL, halted INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS credits (
          id TEXT PRIMARY KEY, amount INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY, request TEXT NOT NULL, request_hash TEXT NOT NULL,
          quote INTEGER NOT NULL, mode TEXT NOT NULL, epoch INTEGER NOT NULL,
          day INTEGER NOT NULL, status TEXT NOT NULL, actual INTEGER,
          receipt TEXT, output TEXT);
        CREATE TABLE IF NOT EXISTS receipts (
          id TEXT PRIMARY KEY, job TEXT NOT NULL UNIQUE, body_hash TEXT NOT NULL);
        """)

    def close(self):
        self.db.close()

    @contextmanager
    def tx(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def _account(self):
        row = self.db.execute("SELECT * FROM account WHERE id=1").fetchone()
        if row is None:
            raise Denied("Battery not configured")
        return row

    def configure(self, *, floor, daily, per_job):
        for value in (floor, daily, per_job):
            integer(value)
        if daily == 0 or per_job == 0:
            raise ValueError("Limits must be positive")
        with self.tx():
            if self.db.execute("SELECT 1 FROM account").fetchone():
                raise Denied("Policy already configured; cannot silently reset")
            self.db.execute("INSERT INTO account VALUES(1,0,?,?,?,0,'none',0)",
                            (floor, daily, per_job))

    def credit_paper(self, credit_id, amount):
        integer(amount)
        with self.tx():
            self._account()
            old = self.db.execute("SELECT amount FROM credits WHERE id=?", (credit_id,)).fetchone()
            if old:
                if old[0] != amount:
                    raise Denied("Credit id reused with different amount")
                return False
            self.db.execute("INSERT INTO credits VALUES(?,?)", (credit_id, amount))
            self.db.execute("UPDATE account SET balance=balance+? WHERE id=1", (amount,))
            return True

    def takeover(self, runtime):
        """Fence the previous worker. Dispatched jobs keep their budget hold.

        This is local operator-controlled migration, not a distributed lease.
        No job dispatched to an external provider is automatically retried.
        """
        if not isinstance(runtime, str) or not runtime:
            raise ValueError("Runtime name required")
        with self.tx():
            self._account()
            self.db.execute("UPDATE jobs SET status='uncertain' WHERE status='dispatched'")
            self.db.execute("UPDATE account SET epoch=epoch+1,runtime=? WHERE id=1", (runtime,))
            return self._account()["epoch"]

    def _check_epoch(self, epoch):
        if type(epoch) is not int or self._account()["epoch"] != epoch:
            raise Denied("Stale worker")

    def _day_usage(self, day):
        # Count outstanding holds from every day: an old unresolved request may
        # settle today. Completed costs use the receipt reconciliation day.
        return self.db.execute("""SELECT COALESCE(SUM(CASE
          WHEN status IN ('reserved','dispatched','uncertain') THEN quote
          WHEN day=? THEN actual ELSE 0 END),0) FROM jobs""", (day,)).fetchone()[0]

    def _snapshot(self):
        a = dict(self._account())
        held = self.db.execute("SELECT COALESCE(SUM(quote),0) FROM jobs WHERE status IN ('reserved','dispatched','uncertain')").fetchone()[0]
        a.update(held=held, spendable=max(0, a["balance"] - a["floor"] - held),
                 jobs=[dict(r) for r in self.db.execute("SELECT id,status,mode,quote,actual FROM jobs ORDER BY id")])
        return a

    def snapshot(self):
        with self.tx():
            return self._snapshot()

    def reserve(self, job_id, payload, options, *, epoch, now):
        """Options: [{mode, max_cost, provider_headroom}], already policy-approved.

        max_cost is worst-case, not average historical cost. Fallback options
        require explicit operator approval of capability/quality compatibility.
        Payload contains portable JSON only; don't store credentials or live
        browser sessions. Reserved replay returns execute=False.
        """
        integer(now)
        request = canonical(payload)
        request_hash = digest(payload)
        with self.tx():
            self._check_epoch(epoch)
            old = self.db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if old:
                if old["request_hash"] != request_hash:
                    raise Denied("Job id reused with different input")
                return {**dict(old), "execute": False}
            a = self._account()
            if a["halted"]:
                raise Denied("Billing breach; reconcile policy before more work")
            day = now // 86400
            room = min(self._snapshot()["spendable"], a["daily"] - self._day_usage(day), a["per_job"])
            choice = None
            for option in options:
                cost = integer(option["max_cost"])
                headroom = integer(option["provider_headroom"])
                if cost <= min(room, headroom):
                    choice = option
                    break
            if choice is None:
                raise Denied("No approved route fits reserve/provider/expense caps")
            self.db.execute("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,'reserved',NULL,NULL,NULL)",
                            (job_id, request, request_hash, choice["max_cost"], choice["mode"], epoch, day))
            return {"id": job_id, "mode": choice["mode"], "quote": choice["max_cost"], "execute": True}

    def dispatch(self, job_id, *, epoch):
        with self.tx():
            self._check_epoch(epoch)
            job = self.db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if job is None or job["status"] != "reserved":
                raise Denied("Not dispatchable; reconcile outstanding request")
            self.db.execute("UPDATE jobs SET status='dispatched',epoch=? WHERE id=?", (epoch, job_id))
            return json.loads(job["request"])

    def settle(self, job_id, *, epoch, receipt_id, actual, output, now, success=True):
        """Trusted receipt reconciliation. Charged failures cost money too.

        Unknown costs cannot settle. Actual over quoted cost is booked in full
        and halts authorization instead of hiding an incurred expense.
        """
        integer(actual)
        integer(now)
        if type(success) is not bool:
            raise ValueError("Receipt success flag must be bool")
        body_hash = digest({"job": job_id, "actual": actual, "output": output, "success": success})
        with self.tx():
            self._check_epoch(epoch)
            job = self.db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            old = self.db.execute("SELECT * FROM receipts WHERE id=?", (receipt_id,)).fetchone()
            if old:
                if old["body_hash"] != body_hash:
                    raise Denied("Receipt collision")
                return False
            if job is None or job["status"] not in ("dispatched", "uncertain"):
                raise Denied("Not awaiting a receipt")
            self.db.execute("INSERT INTO receipts VALUES(?,?,?)", (receipt_id, job_id, body_hash))
            self.db.execute("UPDATE account SET balance=balance-? WHERE id=1", (actual,))
            day = now // 86400
            self.db.execute("UPDATE jobs SET status=?,actual=?,receipt=?,output=?,day=? WHERE id=?",
                            ("done" if success else "failed", actual, receipt_id, canonical(output), day, job_id))
            a = self._account()
            if actual > job["quote"] or a["balance"] < a["floor"] or self._day_usage(day) > a["daily"]:
                self.db.execute("UPDATE account SET halted=1 WHERE id=1")
            return True

    def checkpoint(self):
        """Consistent snapshot of *completed* application results.

        Workers keep access to the same authoritative ledger. This file alone
        cannot authorize spend or recreate a reserve on another ledger.
        """
        with self.tx():
            results = [{"id": r["id"], "receipt": r["receipt"], "output": json.loads(r["output"])}
                       for r in self.db.execute("SELECT * FROM jobs WHERE status='done' ORDER BY id")]
            body = {"schema": "battery.checkpoint/1", "results": results}
            return {"body": body, "sha256": digest(body)}


def verify_checkpoint(checkpoint):
    body = checkpoint["body"]
    if body.get("schema") != "battery.checkpoint/1" or checkpoint["sha256"] != digest(body):
        raise Denied("Checkpoint corrupt or unsupported")
    return body  # Integrity check, not a signature or authorization proof.
