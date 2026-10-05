"""Offline fault fixtures. Fixture vendor/chain receipts are not live payment evidence."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from core import canonical, digest
from paid_resource import ResourceRuntime, Held, JOBS


class FixtureVendor:
    def __init__(self, path, fault=None):
        self.path=Path(path)
        self.fault=fault
        self.path.mkdir(parents=True,exist_ok=True)

    def __call__(self, command, job='-', approve=False, crash=False):
        file=self.path/'vendor.json'
        state=json.loads(file.read_text()) if file.exists() else {'jobs':{},'dispatches':0,'refunds':0}
        def save(): file.write_text(canonical(state))
        if command=='init':return {'owner':'offline-fixture-owner','policy':{'capUsdc':30000},'returnOwner':'fixture-return','signing':False}
        if command=='authorize':
            state['jobs'].setdefault(job,{'state':'authorized','paymentHash':digest(job)})
            save();return {'paymentHash':state['jobs'][job]['paymentHash']}
        if command=='job-status':return state['jobs'].get(job,{'state':'absent'})
        if command=='dispatch':
            row=state['jobs'][job]
            if row['state']!='authorized': raise Held('Unexpected second dispatch')
            state['dispatches']+=1
            row['state']='dispatching';save()
            if self.fault=='unknown':raise Held('Fixture network outcome lost')
            row['state']='response_saved';row['receiptSaved']=True;save()
            if crash:os._exit(76)
            return row
        if command=='verify':
            state['jobs'][job]['state']='paid_result_rejected' if self.fault=='rejected' else 'complete';save()
            index=JOBS.index(job)+1
            return {'state':'paid_result_rejected' if self.fault=='rejected' else 'complete',
                'confirmation':{'amountUsdc':7000,'operatorPurchaseFeeLamports':0,'afterUsdc':1000000-index*7000,'signature':'fixture-'+job},
                'result':None if self.fault=='rejected' else {'sources':[{'url':'https://solana.com/docs','title':'Solana'},{'url':'https://exa.ai/docs','title':'Exa'}]},'responseHash':digest(job)}
        if command=='refund':
            if any(r['state'] not in ('complete','paid_result_rejected') for r in state['jobs'].values()):raise Held('Unknown payment prevents refund')
            state['refunds']+=1;save();return {'state':'refunded','receipt':{'amountUsdc':1000000-7000*len(state['jobs']),'signature':'fixture-refund'}}
        raise Held('Unknown fixture command')


class ResourceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def runtime(self,fault=None):return ResourceRuntime(self.path/'runtime.sqlite',FixtureVendor(self.path/'vendor',fault))
    def vendor_state(self):return json.loads((self.path/'vendor/vendor.json').read_text())

    def test_real_process_exit_and_restart_do_not_buy_again(self):
        code='from pathlib import Path;import sys;from paid_resource import ResourceRuntime;from test_paid_resource import FixtureVendor;p=Path(sys.argv[1]);r=ResourceRuntime(p/"runtime.sqlite",FixtureVendor(p/"vendor"));r.run(approve=True,crash_after=2)'
        p=subprocess.run([sys.executable,'-c',code,str(self.path)],capture_output=True,text=True)
        self.assertEqual(p.returncode,76,p.stderr)
        self.assertEqual(self.vendor_state()['dispatches'],2)
        r=self.runtime()
        try:
            report=r.run(approve=True)
            self.assertTrue(report['closed']);self.assertEqual(report['spentUsdcUnits'],21000)
            r.run(approve=True)
            self.assertEqual(self.vendor_state()['dispatches'],3);self.assertEqual(self.vendor_state()['refunds'],1)
            self.assertIn('saved_response_recovered_no_purchase',[e['kind'] for e in report['events']])
        finally:r.close()

    def test_unknown_paid_request_stays_held_on_repeated_recovery(self):
        r=self.runtime('unknown')
        try:
            with self.assertRaises(Held):r.run(approve=True)
        finally:r.close()
        r=self.runtime()
        try:
            for _ in range(2):
                with self.assertRaises(Held):r.run(approve=True)
            self.assertEqual(r.status()['jobs'][0]['state'],'uncertain');self.assertEqual(self.vendor_state()['dispatches'],1)
            self.assertEqual(self.vendor_state()['refunds'],0)
        finally:r.close()

    def test_no_budget_permission_has_no_sign_or_purchase(self):
        r=self.runtime()
        try:
            with self.assertRaises(Held):r.run()
            self.assertFalse((self.path/'vendor/vendor.json').exists())
        finally:r.close()

    def test_charged_failure_is_booked_and_blocks_further_purchase(self):
        r=self.runtime('rejected')
        try:
            with self.assertRaises(Held):r.run(approve=True)
            self.assertEqual(r.status()['spentUsdcUnits'],7000)
            self.assertEqual(r.status()['jobs'][0]['state'],'paid_result_rejected')
            with self.assertRaises(Held):r.run(approve=True)
            self.assertEqual(self.vendor_state()['dispatches'],1)
        finally:r.close()

    def test_known_paid_failure_can_refund_without_new_purchase(self):
        r=self.runtime('rejected')
        try:
            with self.assertRaises(Held):r.run(approve=True)
            report=r.refund(approve=True)
            self.assertTrue(report['closed']);self.assertEqual(report['refund']['receipt']['amountUsdc'],993000)
            r.run();self.assertEqual(self.vendor_state()['dispatches'],1)
        finally:r.close()

    def test_result_and_refund_tampering_is_detected(self):
        r=self.runtime()
        try:
            r.run(approve=True)
            r.db.execute("UPDATE jobs SET result='{}' WHERE id='source-001'")
            with self.assertRaises(Held):r.status()
        finally:r.close()

    def test_immutable_policy_change_is_detected_before_purchase(self):
        r=self.runtime()
        try:
            r.prepare();r.db.execute("UPDATE run SET plan='{}'")
            with self.assertRaises(Held):r.run(approve=True)
            self.assertFalse((self.path/'vendor/vendor.json').exists())
        finally:r.close()

    def test_actual_cli_budget_flag_dispatches_only_the_injected_offline_vendor(self):
        from unittest.mock import patch
        import paid_resource
        from contextlib import redirect_stdout
        import io
        output=io.StringIO()
        with patch.object(paid_resource,'STATE',self.path),patch.object(paid_resource,'ResourceCommand',return_value=FixtureVendor(self.path/'vendor')),patch.object(sys,'argv',['paid_resource.py','run','--approve-max-0.03-usdc']),redirect_stdout(output):
            paid_resource.main()
        self.assertTrue(json.loads(output.getvalue())['closed'])
        self.assertEqual(self.vendor_state()['dispatches'],3)

    def test_supervisor_replay_preserves_crash_witness_and_uses_readonly_child(self):
        from unittest.mock import patch
        import run_paid_resource
        from contextlib import redirect_stdout
        import io
        witness={'schema':'battery.resource-supervisor/1','exitCodes':[76,0],'plannedCrashExit':76,'closedReplayPassed':True}
        path=self.path/'supervisor.json';path.write_text(canonical(witness))
        result=subprocess.CompletedProcess([],0,canonical({'closed':True}),'')
        with patch.object(run_paid_resource,'STATE',self.path),patch.object(sys,'argv',['run_paid_resource.py','--approve-max-0.03-usdc']),patch.object(run_paid_resource.subprocess,'run',return_value=result) as child,redirect_stdout(io.StringIO()):
            run_paid_resource.main()
        self.assertEqual(json.loads(path.read_text()),witness)
        self.assertEqual(child.call_count,1)
        self.assertNotIn('--approve-max-0.03-usdc',child.call_args.args[0])

    def test_cli_kernel_lock_refuses_another_process_before_init(self):
        import fcntl
        from paid_resource import STATE
        STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
        with (STATE/'controller.lock').open('a') as f:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            p=subprocess.run([sys.executable,'paid_resource.py','status'],capture_output=True,text=True)
            self.assertNotEqual(p.returncode,0);self.assertIn('Another resource controller',p.stderr)


if __name__=='__main__':unittest.main()
