import json,tempfile,unittest
from unittest.mock import patch
from core import Denied
from live_agent import AgentRuntime
from adapters import OllamaAdapter
OBS={"slot":123,"cluster":"devnet"}
OUT={"model":"test","interpretation":{"summary":"Test fixture","watch":["slot"]},"billing":{"kind":"local_inference","providerChargeUsd":0}}
class LiveAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.r=AgentRuntime(self.temp.name,"test-primary")
    def tearDown(self):
        self.r.b.close();self.temp.cleanup()
    def pending(self,receipt):
        with patch('live_agent.network_snapshot',return_value=OBS):p=self.r.input_for('research-001')
        self.r.b.reserve('research-001',p,[{"mode":"local","max_cost":0,"provider_headroom":0}],epoch=self.r.epoch,now=0)
        self.r.b.dispatch('research-001',epoch=self.r.epoch)
        if receipt:self.r.save_receipt('research-001',p,OUT)
        self.r.b.close();self.r=AgentRuntime(self.temp.name,'test-fallback');return p
    def test_durable_receipt_recovered_without_network_or_model_call(self):
        self.pending(True)
        with patch('live_agent.network_snapshot',side_effect=AssertionError('No new input')),patch('live_agent.OllamaAdapter.research',side_effect=AssertionError('No duplicate inference')):
            self.r.run(1);self.r.run(1)
        self.assertEqual(len(self.r.b.checkpoint()['body']['results']),1)
        self.assertEqual(self.r.b.snapshot()['balance'],3000000)
    def test_unknown_outcome_does_not_repeat_inference(self):
        self.pending(False)
        with patch('live_agent.OllamaAdapter.research',side_effect=AssertionError('Unknown must not retry')):
            with self.assertRaisesRegex(Denied,'outcome unknown'):self.r.run(1)
        self.assertEqual(self.r.b.snapshot()['jobs'][0]['status'],'uncertain')
    def test_receipt_input_binding_rejects_changed_payload(self):
        p=self.pending(True);p['observation']={"slot":124}
        receipt=json.loads(self.r.b.db.execute('SELECT body FROM adapter_receipts').fetchone()[0])
        with self.assertRaisesRegex(Denied,'persisted input'):self.r.reconcile('research-001',receipt,p)
    def test_fresh_task_inherits_completed_ids(self):
        self.pending(True)
        with patch('live_agent.network_snapshot',return_value=OBS),patch('live_agent.OllamaAdapter.research',return_value=OUT) as model:self.r.run(2)
        self.assertEqual(model.call_count,1);self.assertEqual(model.call_args.args[0]['previousCompletedIds'],['research-001'])
    def test_bounded_model_refuses_partial_and_unstructured_responses(self):
        good={"done":True,"done_reason":"stop","response":json.dumps(OUT['interpretation']),"model":"test","created_at":"2026-10-05"}
        for invalid in [{**good,'done':False},{**good,'done_reason':'length'},{**good,'response':'{}'},{**good,'response':'{"summary":"x","watch":[]}'}]:
            with patch('adapters.read_json',return_value=invalid):
                with self.assertRaises(Denied):OllamaAdapter('test').research({})
        with patch('adapters.read_json',return_value=good):self.assertEqual(OllamaAdapter('test').research({})['billing']['providerChargeUsd'],0)

class ClusterTests(unittest.TestCase):
    def test_existing_ledger_cannot_change_cluster(self):
        with tempfile.TemporaryDirectory() as d:
            r=AgentRuntime(d,'test','mainnet');r.b.close()
            with self.assertRaisesRegex(Denied,'different cluster'):AgentRuntime(d,'test','devnet')
    def test_snapshot_rejects_wrong_genesis_and_unknown_endpoint(self):
        from adapters import network_snapshot,CLUSTERS
        rows=[{'id':'genesis','result':CLUSTERS['devnet'][1]},
              {'id':'epoch','result':{'epoch':1,'absoluteSlot':2,'blockHeight':3}},
              {'id':'performance','result':[]}]
        with patch('adapters.read_json',return_value=rows):
            with self.assertRaisesRegex(Denied,'genesis'):network_snapshot('mainnet')
        with self.assertRaisesRegex(Denied,'Unsupported'):network_snapshot('https://evil.invalid')
        rows[0]['result']=CLUSTERS['mainnet'][1]
        with patch('adapters.read_json',return_value=rows):self.assertEqual(network_snapshot('mainnet')['cluster'],'mainnet')

if __name__=='__main__':unittest.main()
