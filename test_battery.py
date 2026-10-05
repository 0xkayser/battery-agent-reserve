import copy
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal, ROUND_CEILING
import json
from pathlib import Path
import tempfile
import threading
import unittest

from core import Battery, Denied, verify_checkpoint
from workers import node_worker, python_worker
from pilot import observe

ROOT = Path(__file__).parent


def route(cost, mode="primary", headroom=10**9):
    return {"mode": mode, "max_cost": cost, "provider_headroom": headroom}


class BatteryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "ledger.sqlite")
        self.b = Battery(self.path)
        self.b.configure(floor=20, daily=100, per_job=80)
        self.b.credit_paper("initial", 120)
        self.epoch = self.b.takeover("python")

    def tearDown(self):
        self.b.close()
        self.temp.cleanup()

    def reserve(self, name="job", cost=40, **kw):
        return self.b.reserve(name, {"records": []}, [route(cost)], epoch=self.epoch, now=0, **kw)

    def test_duplicate_credit_and_job_never_spend_twice(self):
        self.assertFalse(self.b.credit_paper("initial", 120))
        with self.assertRaises(Denied):
            self.b.credit_paper("initial", 121)
        self.assertTrue(self.reserve()["execute"])
        self.assertFalse(self.reserve()["execute"])
        self.assertEqual(self.b.snapshot()["held"], 40)
        with self.assertRaises(Denied):
            self.b.reserve("job", {"records": [1]}, [route(40)], epoch=self.epoch, now=0)

    def test_concurrent_authorizations_share_one_reserve(self):
        barrier = threading.Barrier(2)
        def attempt(name):
            b = Battery(self.path)
            try:
                barrier.wait(timeout=5)
                return b.reserve(name, {}, [route(70)], epoch=self.epoch, now=0)["execute"]
            except Denied:
                return False
            finally:
                b.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, ["a", "b"]))
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(self.b.snapshot()["spendable"], 30)

    def test_provider_headroom_and_approved_fallback(self):
        choice = self.b.reserve("job", {}, [route(40, headroom=20), route(10, "economy", 20)],
                                epoch=self.epoch, now=0)
        self.assertEqual(choice["mode"], "economy")
        with self.assertRaises(Denied):
            self.b.reserve("unfunded-provider", {}, [route(1, headroom=0)], epoch=self.epoch, now=0)

    def test_limits_are_worst_case_not_expected_cost(self):
        with self.assertRaises(Denied):
            self.reserve(cost=81)
        self.reserve("a", 60)
        with self.assertRaises(Denied):
            self.reserve("b", 50)

    def test_dispatched_crash_is_uncertain_no_auto_retry(self):
        self.reserve()
        self.b.dispatch("job", epoch=self.epoch)
        self.epoch = self.b.takeover("node")
        self.assertFalse(self.reserve()["execute"])
        self.assertEqual(self.b.snapshot()["jobs"][0]["status"], "uncertain")
        self.assertEqual(self.b.snapshot()["held"], 40)
        with self.assertRaises(Denied):
            self.b.dispatch("job", epoch=self.epoch)
        with self.assertRaises(Denied):
            self.b.settle("job", epoch=self.epoch-1, receipt_id="r1", actual=30, output={}, now=0)
        self.b.settle("job", epoch=self.epoch, receipt_id="r1", actual=30, output={"accepted": True}, now=0)
        self.assertEqual(self.b.snapshot()["balance"], 90)
        self.assertFalse(self.b.settle("job", epoch=self.epoch, receipt_id="r1", actual=30,
                                      output={"accepted": True}, now=0))
        self.assertEqual(len(self.b.checkpoint()["body"]["results"]), 1)

    def test_receipt_collision_and_charged_failure(self):
        self.reserve()
        self.b.dispatch("job", epoch=self.epoch)
        self.b.settle("job", epoch=self.epoch, receipt_id="r1", actual=5, output=None, now=0, success=False)
        self.assertEqual(self.b.snapshot()["balance"], 115)
        self.assertEqual(self.b.checkpoint()["body"]["results"], [])
        with self.assertRaises(Denied):
            self.b.settle("job", epoch=self.epoch, receipt_id="r1", actual=0, output=None, now=0, success=False)

    def test_incidental_overcharge_is_booked_and_halts(self):
        self.reserve(cost=40)
        self.b.dispatch("job", epoch=self.epoch)
        self.b.settle("job", epoch=self.epoch, receipt_id="r1", actual=50, output={}, now=0)
        self.assertEqual(self.b.snapshot()["balance"], 70)
        self.assertEqual(self.b.snapshot()["halted"], 1)
        with self.assertRaises(Denied):
            self.reserve("b", 1)

    def test_old_uncertain_hold_counts_against_next_day(self):
        self.reserve(cost=80)
        self.b.dispatch("job", epoch=self.epoch)
        self.epoch = self.b.takeover("node")
        self.b.credit_paper("more", 1000)
        with self.assertRaises(Denied):
            self.b.reserve("tomorrow", {}, [route(21)], epoch=self.epoch, now=86400)

    def test_restart_preserves_done_result_and_detects_corruption(self):
        self.reserve()
        self.b.dispatch("job", epoch=self.epoch)
        self.b.settle("job", epoch=self.epoch, receipt_id="r1", actual=30, output={"x": 1}, now=0)
        checkpoint = self.b.checkpoint()
        self.b.close()
        self.b = Battery(self.path)
        self.epoch = self.b.takeover("node")
        self.assertFalse(self.reserve()["execute"])
        self.assertEqual(verify_checkpoint(checkpoint), self.b.checkpoint()["body"])
        corrupt = copy.deepcopy(checkpoint)
        corrupt["body"]["results"][0]["output"]["x"] = 2
        with self.assertRaises(Denied):
            verify_checkpoint(corrupt)

    def test_invalid_money_and_unknown_receipt_fail_closed(self):
        for value in (-1, 0.5, True, float("nan"), 10**16):
            with self.assertRaises(ValueError):
                self.b.credit_paper("bad", value)
        with self.assertRaises(Denied):
            self.b.settle("missing", epoch=self.epoch, receipt_id="x", actual=0, output={}, now=0)

    def test_stale_worker_cannot_dispatch_after_takeover(self):
        self.reserve()
        new_epoch = self.b.takeover("node")
        with self.assertRaises(Denied):
            self.b.dispatch("job", epoch=self.epoch)
        self.assertEqual(self.b.dispatch("job", epoch=new_epoch), {"records": []})

    def test_two_runtimes_agree_on_real_public_records(self):
        runs = json.loads((ROOT / "evidence/www-runs.json").read_text())["data"]
        records = [{"id": r["id"], "status": r["status"], "cost_micro_usd": int(
            (Decimal(str(r["costUsd"])) * 1000000).to_integral_value(rounding=ROUND_CEILING))} for r in runs]
        payload = {"records": records}
        self.assertEqual(python_worker(payload), node_worker(payload))
        self.assertEqual(python_worker(payload)["count"], 100)

    def test_zero_cost_pilot_preserves_results_after_crash_without_payments(self):
        payload = {"records": [{"id": 1, "status": "ok", "cost_micro_usd": 0}]}
        observe(self.b, self.epoch, "slot-1", payload, 0, python_worker)
        self.epoch = self.b.takeover("node")
        observe(self.b, self.epoch, "slot-1", payload, 0, node_worker)
        self.assertEqual(len(self.b.checkpoint()["body"]["results"]), 1)
        self.assertEqual(self.b.snapshot()["balance"], 120)


if __name__ == "__main__":
    unittest.main()
