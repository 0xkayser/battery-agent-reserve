"""One-shot operator experiment. API usage is evidence; calculated cost is not a bill.

No chain signing, provider credit inference, automatic POST retries or billing settlement.
Local operator/file access is trusted. Never delete state to retry an uncertain request.
"""
import argparse
from contextlib import contextmanager
from datetime import date, datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import urllib.error
import urllib.request
import uuid

from core import canonical, digest

MODEL = "gpt-4.1-mini-2025-04-14"
POLICY = {
    "schema": "battery.paid-policy/1", "model": MODEL, "max_requests": 1,
    "experiment_micro_usd": 100_000, "max_request_bytes": 8_000,
    "input_token_assumption": 10_048, "max_output_tokens": 512,
    "input_micro_usd_per_million": 400_000,
    "output_micro_usd_per_million": 1_600_000,
    "price_checked": "2026-10-05", "new_dispatch_before": "2026-10-12",
    "price_source": "https://developers.openai.com/api/docs/models/gpt-4.1-mini",
    "billing_status": "unverified", "provider_headroom": None,
}
FIELDS = ("summary", "verified", "limits", "next_action")
SCHEMA = {"type": "object", "properties": {k: {"type": "string"} for k in FIELDS},
          "required": list(FIELDS), "additionalProperties": False}


class Held(Exception):
    """Safe operator-facing error. Do not include upstream text or credential values."""


def now():
    return datetime.now(timezone.utc).isoformat()


def estimate(usage):
    # Integer round-up. Cache discounts intentionally not deducted.
    return (2 * usage["input_tokens"] + 8 * usage["output_tokens"] + 4) // 5


def make_request(facts, job_id):
    if not re.fullmatch(r"[a-z0-9-]{1,64}", job_id):
        raise Held("Invalid job ID")
    body = {
        "model": MODEL, "store": True, "stream": False, "service_tier": "default",
        "max_output_tokens": POLICY["max_output_tokens"], "truncation": "disabled",
        "metadata": {"battery_job": job_id},
        "instructions": "Write a concise English operator brief using only the supplied observations. "
                        "Separate verified observations from limitations. Do not claim production, "
                        "provider payment or profitability. No trading advice. Each field <=600 characters.",
        "input": canonical(facts),
        "text": {"format": {"type": "json_schema", "name": "battery_operator_brief",
                            "strict": True, "schema": SCHEMA}},
    }
    if len(canonical(body).encode()) > POLICY["max_request_bytes"]:
        raise Held("Input exceeds reviewed byte bound")
    return body


def credential(path):
    """Read just one private assignment; never source shell code or print the file."""
    value = os.environ.get("OPENAI_API_KEY", "")
    if not value:
        path = Path(path)
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        except OSError:
            raise Held("Local API credential unavailable") from None
        with os.fdopen(fd) as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 8192:
                raise Held("Credential file must be private mode 0600 and small")
            assignments = [line.split("=", 1)[1].strip() for line in stream
                           if line.startswith("OPENAI_API_KEY=")]
        if len(assignments) != 1:
            raise Held("Expected one local API credential assignment")
        value = assignments[0]
    if not re.fullmatch(r"sk-[A-Za-z0-9_-]{20,300}", value):
        raise Held("Local API credential unavailable or invalid")
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class OpenAI:
    def __init__(self, key):
        self._key = key
        # Do not send Authorization through environment-configured proxies.
        self._http = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def __repr__(self):
        return "OpenAI(credential=<private>)"

    def call(self, method, response_id=None, body=None, client_id=None):
        path = "/v1/responses"
        if method == "GET":
            if not isinstance(response_id, str) or not re.fullmatch(r"resp_[A-Za-z0-9_-]{1,160}", response_id):
                raise Held("Invalid provider response ID")
            path += "/" + response_id
        elif method != "POST" or response_id is not None or body is None:
            raise Held("Unsupported provider operation")
        headers = {"Authorization": "Bearer " + self._key, "Content-Type": "application/json"}
        if client_id:
            headers["X-Client-Request-Id"] = str(uuid.UUID(client_id))
        req = urllib.request.Request("https://api.openai.com" + path, method=method,
                                     data=canonical(body).encode() if body is not None else None,
                                     headers=headers)
        try:
            with self._http.open(req, timeout=45) as response:
                raw = response.read(262145)
                request_id = response.headers.get("x-request-id", "")
            if len(raw) > 262144:
                raise Held("Provider response exceeds byte bound")
            if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,200}", request_id):
                raise Held("Provider request ID missing or invalid")
            obj = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
            if not isinstance(obj, dict):
                raise Held("Invalid provider JSON")
            return {"request_id": request_id, "response": obj}
        except urllib.error.HTTPError as exc:
            # Even an HTTP failure never authorizes another generation automatically.
            raise Held(f"Provider HTTP {exc.code}; outcome requires reconciliation") from None
        except Held:
            raise
        except Exception:
            raise Held("Provider transport/JSON failure; outcome requires reconciliation") from None


def inspect_receipt(receipt, request):
    body = receipt["response"]
    if (not isinstance(body.get("id"), str) or
            not re.fullmatch(r"resp_[A-Za-z0-9_-]{1,160}", body["id"])):
        raise Held("Receipt has no valid response ID")
    if (body.get("model") != request["model"] or body.get("metadata") != request["metadata"] or
            body.get("service_tier") != "default" or body.get("tools") != []):
        raise Held("Provider receipt does not match approved request")
    usage = body.get("usage")
    if not isinstance(usage, dict) or any(type(usage.get(k)) is not int or usage[k] < 0
                                         for k in ("input_tokens", "output_tokens", "total_tokens")):
        raise Held("Receipt usage invalid; billing remains unknown")
    if (usage["input_tokens"] > POLICY["input_token_assumption"] or
            usage["output_tokens"] > POLICY["max_output_tokens"] or
            usage["total_tokens"] != usage["input_tokens"] + usage["output_tokens"] or
            usage.get("input_tokens_details", {}).get("cache_write_tokens", 0) != 0 or
            usage.get("output_tokens_details", {}).get("reasoning_tokens", 0) != 0):
        raise Held("Receipt usage exceeds reviewed pricing assumptions")
    if body.get("status") != "completed" or body.get("error") or body.get("incomplete_details"):
        raise Held("Provider did not complete task; possible charge remains held")
    output = body.get("output")
    if not isinstance(output, list) or len(output) != 1:
        raise Held("Unexpected provider output")
    item = output[0]
    if item.get("type") != "message" or item.get("role") != "assistant" or item.get("status") != "completed":
        raise Held("Unexpected provider output item")
    content = item.get("content")
    if not isinstance(content, list) or len(content) != 1 or content[0].get("type") != "output_text":
        raise Held("Provider refusal or unexpected content")
    try:
        result = json.loads(content[0]["text"])
    except (ValueError, KeyError, TypeError):
        raise Held("Structured output invalid") from None
    if not isinstance(result, dict) or set(result) != set(FIELDS) or any(
            not isinstance(result[k], str) or not 1 <= len(result[k]) <= 600 for k in FIELDS):
        raise Held("Operator brief schema invalid")
    return result, estimate(usage)


@contextmanager
def private_lock(directory):
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.is_symlink() or directory.stat().st_mode & 0o077:
        raise Held("State directory must be private mode 0700")
    fd = os.open(directory / "operator.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Held("Another operator owns this attempt") from None
        yield directory
    finally:
        os.close(fd)


class PaidAttempt:
    """Exactly one generation attempt per retained state, not account-wide spending control."""
    def __init__(self, path):
        self.db = sqlite3.connect(path, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS attempt(id INTEGER PRIMARY KEY CHECK(id=1),
          policy TEXT NOT NULL, request TEXT NOT NULL, request_hash TEXT NOT NULL,
          client_id TEXT NOT NULL, status TEXT NOT NULL, receipt TEXT, receipt_hash TEXT,
          result TEXT, estimate INTEGER, error TEXT, readback TEXT);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, at TEXT NOT NULL,
          kind TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS review(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
        """)

    def close(self):
        self.db.close()

    def row(self):
        return self.db.execute("SELECT * FROM attempt WHERE id=1").fetchone()

    def event(self, kind):
        self.db.execute("INSERT INTO events(at,kind) VALUES(?,?)", (now(), kind))

    def prepare(self, facts, job_id="operator-brief-v1"):
        request = make_request(facts, job_id)
        row = self.row()
        if row:
            self.check(row)
            if row["request"] != canonical(request):
                raise Held("Attempt input is immutable; do not reset state to retry")
            return
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.db.execute("INSERT INTO attempt(id,policy,request,request_hash,client_id,status) "
                            "VALUES(1,?,?,?,?, 'prepared')",
                            (canonical(POLICY), canonical(request), digest(request), str(uuid.uuid4())))
            self.event("exact_request_saved")
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def check(self, row):
        if row["policy"] != canonical(POLICY) or digest(json.loads(row["request"])) != row["request_hash"]:
            raise Held("Saved policy/request integrity mismatch")
        if row["receipt"] and digest(json.loads(row["receipt"])) != row["receipt_hash"]:
            raise Held("Saved receipt integrity mismatch")
        if row["result"]:
            result, cost = inspect_receipt(json.loads(row["receipt"]), json.loads(row["request"]))
            if row["result"] != canonical(result) or row["estimate"] != cost:
                raise Held("Saved result/estimate differs from receipt")

    def run(self, provider=None, approved=False, crash_after_receipt=False, today=None):
        row = self.row()
        if row is None:
            raise Held("Prepare reviewed input first")
        self.check(row)
        if row["receipt"]:
            return self.reconcile()
        if row["status"] != "prepared":
            raise Held("Unknown dispatched outcome; retained hold, no new POST")
        if not approved or provider is None:
            raise Held("One paid request requires operator approval and credential")
        current = today or date.today()
        if not date.fromisoformat(POLICY["price_checked"]) <= current < date.fromisoformat(POLICY["new_dispatch_before"]):
            raise Held("Price snapshot stale or clock invalid; no dispatch")
        # Atomic dispatch claim before network. DB FULL commit persists the hold.
        self.db.execute("BEGIN IMMEDIATE")
        try:
            changed = self.db.execute("UPDATE attempt SET status='dispatched' "
                                      "WHERE id=1 AND status='prepared'").rowcount
            if changed != 1:
                raise Held("Attempt already claimed")
            self.event("generation_dispatch_claimed")
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise
        try:
            receipt = provider.call("POST", body=json.loads(row["request"]), client_id=row["client_id"])
            # Store body before interpreting incomplete/refusal/usage: these can still cost money.
            encoded = canonical(receipt)
            self.db.execute("BEGIN IMMEDIATE")
            self.db.execute("UPDATE attempt SET receipt=?,receipt_hash=?,status='receipt' WHERE id=1",
                            (encoded, digest(receipt)))
            self.event("provider_receipt_durable")
            self.db.execute("COMMIT")
        except Exception:
            if self.db.in_transaction:
                self.db.execute("ROLLBACK")
            self.db.execute("UPDATE attempt SET status='held',error='unreconciled provider outcome' WHERE id=1")
            self.event("unknown_outcome_held")
            raise Held("Provider attempt uncertain; hold retained, no automatic retry") from None
        if crash_after_receipt:
            os._exit(75)
        return self.reconcile()

    def reconcile(self):
        row = self.row()
        self.check(row)
        try:
            result, cost = inspect_receipt(json.loads(row["receipt"]), json.loads(row["request"]))
        except Exception:
            self.db.execute("UPDATE attempt SET status='held',error='receipt rejected; billing unknown' WHERE id=1")
            raise Held("Receipt rejected; retained hold, no new POST") from None
        if row["status"] != "result_saved":
            self.db.execute("BEGIN IMMEDIATE")
            self.db.execute("UPDATE attempt SET result=?,estimate=?,status='result_saved',error=NULL WHERE id=1",
                            (canonical(result), cost))
            self.event("result_recovered_cost_estimated_billing_pending")
            self.db.execute("COMMIT")
        return self.report()

    def readback(self, provider):
        row = self.row()
        if row is None or not row["receipt"]:
            raise Held("No known response ID; contact provider with saved client ID")
        self.check(row)
        original = json.loads(row["receipt"])
        inspect_receipt(original, json.loads(row["request"]))
        fetched = provider.call("GET", response_id=original["response"]["id"])
        inspect_receipt(fetched, json.loads(row["request"]))
        # Request headers differ on GET. Compare billing/result identity, not whole HTTP envelope.
        fields = ("id", "model", "metadata", "status", "usage", "output", "service_tier")
        if any(original["response"].get(k) != fetched["response"].get(k) for k in fields):
            raise Held("Authenticated readback differs; billing remains unverified")
        self.db.execute("UPDATE attempt SET readback=? WHERE id=1", (canonical({"at": now(),
            "request_id": fetched["request_id"], "response_hash": digest(fetched["response"])}),))
        self.event("authenticated_response_readback_matched")
        return self.report()

    def review(self, decision, reason):
        row = self.row()
        if row is None or row["status"] != "result_saved":
            raise Held("Only a saved result can be reviewed")
        self.check(row)
        if decision not in ("accepted", "rejected") or not isinstance(reason, str) or not 1 <= len(reason) <= 600:
            raise Held("Explicit content decision and short reason required")
        body = {"decision": decision, "reason": reason, "request_sha256": row["request_hash"],
                "result_sha256": digest(json.loads(row["result"])), "basis": "trusted operator review; not model authority"}
        prior = self.db.execute("SELECT body FROM review WHERE id=1").fetchone()
        if prior:
            if prior["body"] != canonical(body):
                raise Held("Saved content review is immutable")
            return self.report()
        self.db.execute("BEGIN IMMEDIATE")
        self.db.execute("INSERT INTO review(id,body) VALUES(1,?)", (canonical(body),))
        self.event("operator_content_" + decision)
        self.db.execute("COMMIT")
        return self.report()

    def report(self):
        row = self.row()
        if row is None:
            return {"status": "unprepared", "generation_requests": 0}
        self.check(row)
        events = [dict(r) for r in self.db.execute("SELECT at,kind FROM events ORDER BY id")]
        receipt = json.loads(row["receipt"]) if row["receipt"] else None
        review = self.db.execute("SELECT body FROM review WHERE id=1").fetchone()
        review = json.loads(review["body"]) if review else {"decision": "pending"}
        if review["decision"] != "pending" and (review["request_sha256"] != row["request_hash"] or
                review["result_sha256"] != digest(json.loads(row["result"]))):
            raise Held("Content review is not bound to saved result")
        return {"schema": "battery.paid-attempt/1", "status": row["status"], "policy": POLICY,
                "request_sha256": row["request_hash"], "client_request_id": row["client_id"],
                "provider_response_id": receipt["response"].get("id") if receipt else None,
                "provider_request_id": receipt.get("request_id") if receipt else None,
                "usage": receipt["response"].get("usage") if receipt else None,
                "estimated_micro_usd": row["estimate"], "actual_provider_charge": None,
                "billing_status": "unverified", "provider_headroom": None,
                "retained_hold_micro_usd": POLICY["experiment_micro_usd"] if row["status"] != "prepared" else 0,
                "generation_requests": sum(e["kind"] == "generation_dispatch_claimed" for e in events),
                "result": json.loads(row["result"]) if row["result"] else None,
                "content_review": review, "downstream_authorized": False,
                "authenticated_readback": json.loads(row["readback"]) if row["readback"] else None,
                "events": events, "scope": "one operator-owned attempt; no onchain payment or invoice proof"}


def operator_facts(root):
    financial = json.loads((root / "evidence/integrated-financial.json").read_text())
    model = json.loads((root / "evidence/integrated-runtime/integrated.json").read_text())
    # Fixed public observations only. No key, private checkpoint, credential, or generated instruction.
    return {"task": "Review BATTERY's dated mainnet canary for an operator considering a pilot",
            "financial_artifact_sha256": digest(financial), "runtime_artifact_sha256": digest(model),
            "observations": {"date": "2026-10-05", "owned_agent_model_calls": 3,
                             "finalized_usdc_settlements": 3, "each_usdc": "0.01",
                             "returned_principal_usdc": "5.00", "network_fee_lamports": 40000,
                             "forced_process_exit": 74, "recovered_same_signature": True,
                             "replay_new_calls_and_payments": 0, "delegation_revoked": True},
            "limits": ["local inference; settlements to an owned worker, not provider invoices",
                       "no hosted paid service, independent audit or proven margin",
                       "devnet signed checkpoint unconfirmed", "this separate API experiment has no USDC settlement"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("plan", "status", "run", "recover", "readback", "review"))
    parser.add_argument("--approve-one-request", action="store_true")
    parser.add_argument("--crash-after-receipt", action="store_true")
    parser.add_argument("--decision", choices=("accepted", "rejected"))
    parser.add_argument("--reason")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    os.umask(0o077)
    try:
        with private_lock(root / "paid-state/operator-brief-v1") as state:
            attempt = PaidAttempt(state / "attempt.sqlite")
            try:
                if args.operation in ("plan", "run"):
                    attempt.prepare(operator_facts(root))
                provider = None
                if args.operation == "readback" or (args.operation == "run" and attempt.row()["status"] == "prepared"):
                    provider = OpenAI(credential(root / ".env.local"))
                if args.operation in ("run", "recover"):
                    result = attempt.run(provider, approved=args.approve_one_request,
                                         crash_after_receipt=args.crash_after_receipt)
                elif args.operation == "readback":
                    result = attempt.readback(provider)
                elif args.operation == "review":
                    result = attempt.review(args.decision, args.reason)
                else:
                    result = attempt.report()
                print(json.dumps(result, indent=2))
            finally:
                attempt.close()
    except Held as exc:
        print(canonical({"status": "hold", "reason": str(exc)}))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
