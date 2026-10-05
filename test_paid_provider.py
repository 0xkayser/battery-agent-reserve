"""Offline fault injection only. Fixtures never count as authenticated billing evidence."""
import copy
from datetime import date
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

from core import canonical
from paid_provider import (FIELDS, Held, MODEL, OpenAI, POLICY, PaidAttempt,
                           credential, inspect_receipt, make_request, private_lock)

FACTS = {"observed": "owned canary; no provider invoice"}
TODAY = date(2026, 10, 5)


def fixture(body):
    return {"request_id": "req_OFFLINE", "response": {
        "id": "resp_OFFLINE", "model": MODEL, "metadata": body["metadata"],
        "status": "completed", "service_tier": "default", "tools": [],
        "usage": {"input_tokens": 100, "output_tokens": 80, "total_tokens": 180},
        "output": [{"type": "message", "status": "completed", "role": "assistant",
                    "content": [{"type": "output_text", "text": canonical({k: "offline fixture" for k in FIELDS})}]}]}}


class Fake:
    def __init__(self):
        self.posts = 0
        self.gets = 0
        self.receipt = None

    def call(self, method, body=None, **kwargs):
        if method == "POST":
            self.posts += 1
            self.receipt = fixture(body)
        else:
            self.gets += 1
        return copy.deepcopy(self.receipt)


class PaidTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)
        self.attempt = PaidAttempt(self.path / "attempt.sqlite")
        self.attempt.prepare(FACTS)
        self.provider = Fake()

    def tearDown(self):
        self.attempt.close()
        self.temp.cleanup()

    def run_one(self):
        return self.attempt.run(self.provider, approved=True, today=TODAY)

    def test_replay_uses_receipt_no_post_and_retains_hold_not_fake_bill(self):
        first = self.run_one()
        second = self.attempt.run()
        self.assertEqual(first, second)
        self.assertEqual(self.provider.posts, 1)
        self.assertEqual(first["estimated_micro_usd"], 168)
        self.assertIsNone(first["actual_provider_charge"])
        self.assertIsNone(first["provider_headroom"])
        self.assertEqual(first["retained_hold_micro_usd"], 100000)
        self.assertEqual(first["billing_status"], "unverified")

    def test_missing_approval_or_expired_price_never_dispatches(self):
        for options in ({"approved": False, "today": TODAY},
                        {"approved": True, "today": date(2026, 10, 12)},
                        {"approved": True, "today": date(2026, 10, 4)}):
            with self.assertRaises(Held):
                self.attempt.run(self.provider, **options)
        self.assertEqual(self.provider.posts, 0)
        self.assertEqual(self.attempt.report()["status"], "prepared")

    def test_exact_request_saved_before_external_effect(self):
        class Probe(Fake):
            def call(inner, method, **kwargs):
                other = PaidAttempt(self.path / "attempt.sqlite")
                try:
                    row = other.row()
                    self.assertEqual(row["status"], "dispatched")
                    self.assertEqual(json.loads(row["request"]), kwargs["body"])
                    self.assertEqual(row["client_id"], kwargs["client_id"])
                finally:
                    other.close()
                return super().call(method, **kwargs)
        self.attempt.run(Probe(), approved=True, today=TODAY)

    def test_unknown_post_failure_never_retries_even_with_new_provider(self):
        class Uncertain(Fake):
            def call(inner, *args, **kwargs):
                inner.posts += 1
                raise TimeoutError("sensitive upstream text")
        broken = Uncertain()
        with self.assertRaises(Held) as error:
            self.attempt.run(broken, approved=True, today=TODAY)
        self.assertNotIn("sensitive", str(error.exception))
        self.assertEqual(self.attempt.report()["status"], "held")
        with self.assertRaises(Held):
            self.run_one()
        self.assertEqual(broken.posts, 1)
        self.assertEqual(self.provider.posts, 0)

    def test_actual_process_exit_after_durable_receipt_recovers_without_post(self):
        code = '''
import os,sys
from datetime import date
from paid_provider import PaidAttempt
from test_paid_provider import fixture
class Transport:
 def call(self, method, body=None, **kw):
  with open(sys.argv[2], 'a') as f:
   f.write(method+'\\n'); f.flush(); os.fsync(f.fileno())
  return fixture(body)
a=PaidAttempt(sys.argv[1])
a.run(Transport(), approved=True, crash_after_receipt=True, today=date(2026,10,5))
'''
        calls = self.path / "calls"
        result = subprocess.run([sys.executable, "-c", code, str(self.path / "attempt.sqlite"), str(calls)],
                                cwd=Path(__file__).parent, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 75, result.stderr.decode())
        self.assertEqual(self.attempt.row()["status"], "receipt")
        recovered = self.attempt.run(self.provider, approved=True, today=TODAY)
        self.assertEqual(recovered["status"], "result_saved")
        self.assertEqual(calls.read_text(), "POST\n")
        self.assertEqual(self.provider.posts, 0)

    def test_request_and_policy_are_immutable(self):
        with self.assertRaises(Held):
            self.attempt.prepare({"observed": "changed"})
        self.attempt.db.execute("UPDATE attempt SET policy='{}'")
        with self.assertRaises(Held):
            self.run_one()
        self.assertEqual(self.provider.posts, 0)

    def test_paid_incomplete_refused_and_bad_usage_are_not_success(self):
        request = make_request(FACTS, "operator-brief-v1")
        updates = [lambda b: b.update(status="incomplete"),
                   lambda b: b.update(model="different"),
                   lambda b: b.update(metadata={"battery_job": "wrong"}),
                   lambda b: b.update(service_tier="priority"),
                   lambda b: b["usage"].update(output_tokens=513, total_tokens=613),
                   lambda b: b["usage"].update(input_tokens=True),
                   lambda b: b["usage"].update(total_tokens=181),
                   lambda b: b["usage"].update(input_tokens_details={"cache_write_tokens": 1}),
                   lambda b: b["output"][0].update(content=[{"type": "refusal"}])]
        for mutate in updates:
            receipt = fixture(request)
            mutate(receipt["response"])
            with self.subTest(receipt=receipt), self.assertRaises(Held):
                inspect_receipt(receipt, request)

    def test_rejected_durable_receipt_stays_held_on_replay(self):
        class Incomplete(Fake):
            def call(inner, method, **kwargs):
                receipt = super().call(method, **kwargs)
                receipt["response"]["status"] = "incomplete"
                return receipt
        broken = Incomplete()
        with self.assertRaises(Held):
            self.attempt.run(broken, approved=True, today=TODAY)
        self.assertIsNotNone(self.attempt.row()["receipt"])
        with self.assertRaises(Held):
            self.run_one()
        self.assertEqual(broken.posts, 1)
        self.assertEqual(self.provider.posts, 0)

    def test_readback_checks_identity_and_usage_without_new_generation(self):
        self.run_one()
        matched = self.attempt.readback(self.provider)
        self.assertIsNotNone(matched["authenticated_readback"])
        self.assertEqual((self.provider.posts, self.provider.gets), (1, 1))
        self.provider.receipt["response"]["usage"].update(input_tokens=101, total_tokens=181)
        with self.assertRaises(Held):
            self.attempt.readback(self.provider)
        self.assertEqual(self.provider.posts, 1)

    def test_local_result_tampering_is_rejected_not_silently_repaired(self):
        self.run_one()
        self.attempt.db.execute("UPDATE attempt SET estimate=0")
        with self.assertRaises(Held):
            self.attempt.report()

    def test_content_review_is_required_bound_and_cannot_be_replaced(self):
        result = self.run_one()
        self.assertEqual(result["content_review"]["decision"], "pending")
        self.assertFalse(result["downstream_authorized"])
        rejected = self.attempt.review("rejected", "Exit code misreported as crash count")
        replay = self.attempt.run()
        self.assertEqual(rejected, replay)
        self.assertEqual(replay["content_review"]["decision"], "rejected")
        self.assertFalse(replay["downstream_authorized"])
        with self.assertRaises(Held):
            self.attempt.review("accepted", "Ignore prior rejection")
        self.assertEqual(self.provider.posts, 1)

    def test_fixed_transport_redacts_http_and_rejects_redirect(self):
        client = OpenAI("private test credential")
        self.assertNotIn("private test credential", repr(client))
        error = urllib.error.HTTPError("https://api.openai.com", 302,
                                       "credential-like upstream message", {}, None)
        with patch.object(client._http, "open", side_effect=error) as mocked:
            with self.assertRaises(Held) as raised:
                client.call("POST", body={"test": True})
            self.assertNotIn("credential-like", str(raised.exception))
            self.assertEqual(mocked.call_count, 1)
            self.assertEqual(mocked.call_args.args[0].full_url, "https://api.openai.com/v1/responses")
        from paid_provider import NoRedirect
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, "", {}, "https://elsewhere"))
        with self.assertRaises(Held):
            client.call("GET", response_id="../../elsewhere")

    def test_private_credential_has_no_shell_execution_and_permission_required(self):
        key = "sk-" + "f" * 32  # Deliberately invalid offline placeholder, not an API credential.
        path = self.path / "secret"
        path.write_text("OPENAI_API_KEY=" + key + "\n")
        path.chmod(0o600)
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            self.assertEqual(credential(path), key)
            path.chmod(0o644)
            with self.assertRaises(Held):
                credential(path)
            path.chmod(0o600)
            path.write_text("OPENAI_API_KEY=$(touch nope)\n")
            with self.assertRaises(Held):
                credential(path)
        self.assertFalse((self.path / "nope").exists())

    def test_lock_refuses_concurrent_operator_and_input_bound_refuses_large_payload(self):
        state = self.path / "state"
        with private_lock(state):
            with self.assertRaises(Held), private_lock(state):
                pass
        with self.assertRaises(Held):
            make_request({"blob": "x" * 8000}, "operator-brief-v1")
        self.assertEqual(POLICY["max_requests"], 1)


class PublicProofTests(unittest.TestCase):
    def proof(self):
        return json.loads((Path(__file__).parent / "evidence/paid-provider.json").read_text())

    def test_actual_api_record_has_rejected_content_and_no_invoice_claim(self):
        from verify_paid import verify
        verified = verify(self.proof())
        self.assertEqual(verified["total_tokens"], 570)
        self.assertEqual(verified["content_review"], "rejected")
        self.assertEqual(verified["billing"], "unverified")

    def test_rehashed_semantic_tampering_does_not_invent_bill_credit_or_acceptance(self):
        from core import digest
        from verify_paid import verify
        changes = [lambda b: b.update(actual_provider_charge=0),
                   lambda b: b.update(provider_headroom=1000000),
                   lambda b: b.update(downstream_authorized=True),
                   lambda b: b.update(estimated_micro_usd=0),
                   lambda b: b["content_review"].update(decision="accepted"),
                   lambda b: b["events"].append(b["events"][1]),
                   lambda b: b["exact_request"].update(model="different")]
        for change in changes:
            proof = self.proof()
            change(proof["body"])
            proof["sha256"] = digest(proof["body"])
            with self.assertRaises(Held):
                verify(proof)


if __name__ == "__main__":
    unittest.main()
