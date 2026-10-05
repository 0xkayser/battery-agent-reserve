import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from adapters import CLUSTERS
from core import Denied
from integrated_runtime import ChainCommand, IntegratedRuntime
from verify_integrated import verify

OBS = {"cluster": "mainnet", "slot": 123, "genesisHash": CLUSTERS["mainnet"][1]}
OUT = {"model": "offline-fixture", "interpretation": {"summary": "Fixture", "watch": ["slot"]},
       "billing": {"kind": "local_inference", "providerChargeUsd": 0}}


class IntegratedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.calls = []
        self.crash_job = None
        self.bad_receipt = False
        self.deny_auth = False
        self.r = IntegratedRuntime(self.temp.name, "fixture", self.chain)
        self.patches = [patch("live_agent.network_snapshot", return_value=OBS),
                        patch("live_agent.OllamaAdapter.research", side_effect=self.model)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        self.r.agent.b.close()
        for p in self.patches:
            p.stop()
        self.temp.cleanup()

    def model(self, payload):
        self.calls.append(("model", tuple(payload["previousCompletedIds"])))
        return OUT

    def chain(self, command, job, *args):
        self.calls.append((command, job))
        if command == "authorize-job":
            if self.deny_auth:
                raise Denied("No funds")
            return {"schema": "battery.job-authorization/1", "cluster": "mainnet", "job": job, "amountUsdc": 10000}
        self.assertEqual(command, "pay-job")
        report = json.loads(Path(args[0]).read_text())
        self.assertEqual(report["job"], job)
        self.assertEqual(report["checkpoint"]["body"]["results"][0]["id"], job)
        if self.crash_job == job:
            raise SystemExit(74)
        return {"signature": "1" * 88, "amountUsdc": 9999 if self.bad_receipt else 10000,
                "slot": 100, "feeLamports": 5000}

    def reopen(self):
        self.r.agent.b.close()
        self.r = IntegratedRuntime(self.temp.name, "fallback-fixture", self.chain)

    def test_interleaves_authorization_model_and_payment_before_next_job(self):
        result = self.r.run()
        self.assertEqual([x[0] for x in self.calls], ["authorize-job", "model", "pay-job"] * 3)
        self.assertEqual(len(result["payments"]), 3)
        self.assertEqual(self.calls[7], ("model", ("research-001", "research-002")))

    def test_payment_crash_reopen_does_not_repeat_model(self):
        self.crash_job = "research-002"
        with self.assertRaises(SystemExit) as e:
            self.r.run()
        self.assertEqual(e.exception.code, 74)
        self.reopen()
        self.crash_job = None
        self.r.run()
        self.assertEqual(sum(x[0] == "model" for x in self.calls), 3)
        self.assertEqual(sum(x == ("pay-job", "research-002") for x in self.calls), 2)
        self.assertEqual(sum(x == ("authorize-job", "research-002") for x in self.calls), 1)
        self.calls.clear()
        self.r.run()
        self.assertEqual(self.calls, [])

    def test_no_funds_stops_before_model(self):
        self.deny_auth = True
        with self.assertRaisesRegex(Denied, "No funds"):
            self.r.run()
        self.assertEqual(self.calls, [("authorize-job", "research-001")])

    def test_unknown_model_outcome_stays_held(self):
        agent = self.r.agent
        payload = agent.input_for("research-001")
        agent.b.reserve("research-001", payload, [{"mode": "local", "max_cost": 0, "provider_headroom": 0}], epoch=agent.epoch, now=0)
        agent.b.dispatch("research-001", epoch=agent.epoch)
        self.reopen()
        with self.assertRaisesRegex(Denied, "outcome unknown"):
            self.r.run()
        self.assertEqual(self.calls, [])

    def test_result_file_tamper_stops_payment_replay(self):
        self.crash_job = "research-001"
        with self.assertRaises(SystemExit):
            self.r.run()
        p = Path(self.temp.name) / "research-001.json"
        report = json.loads(p.read_text())
        report["checkpoint"]["sha256"] = "0" * 64
        p.write_text(json.dumps(report))
        self.reopen()
        self.calls.clear()
        with self.assertRaisesRegex(Denied, "Durable result changed"):
            self.r.run()
        self.assertEqual(self.calls, [])

    def test_invalid_receipt_prevents_next_model_task(self):
        self.bad_receipt = True
        with self.assertRaisesRegex(Denied, "finalized payment receipt"):
            self.r.run()
        self.assertEqual(sum(x[0] == "model" for x in self.calls), 1)
        self.assertEqual(self.r.log["payments"], {})

    def test_state_name_cannot_escape_private_directory(self):
        for name in ("../canary", "/tmp/foo", "a/b", "", "A"):
            with self.assertRaises(Denied):
                ChainCommand(name)

    def test_independent_verifier_rejects_order_and_duplicate_model_calls(self):
        report = self.r.run()
        self.assertEqual(verify(self.r.file)["completedTasks"], 3)
        report["modelEvents"].append(dict(next(e for e in report["modelEvents"] if e["kind"] == "model_call_started")))
        self.r.file.write_text(json.dumps(report))
        with self.assertRaisesRegex(Denied, "unique ordered model"):
            verify(self.r.file)
        report["modelEvents"].pop()
        report["events"][0], report["events"][1] = report["events"][1], report["events"][0]
        self.r.file.write_text(json.dumps(report))
        with self.assertRaisesRegex(Denied, "ordering differs"):
            verify(self.r.file)

    def test_live_verifier_requires_same_finalized_receipt(self):
        report = self.r.run()
        def read(command, job, file):
            self.assertEqual(command, "verify-job")
            self.assertEqual(Path(file).stem, job)
            return report["payments"][job]
        self.assertTrue(verify(self.r.file, read)["verifiedLive"])
        with self.assertRaisesRegex(Denied, "chain receipt differs"):
            verify(self.r.file, lambda *args: {"amountUsdc": 1})


if __name__ == "__main__":
    unittest.main()
