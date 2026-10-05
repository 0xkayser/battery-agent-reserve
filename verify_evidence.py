"""Offline evidence relationships, not model/chain authentication."""
from collections import Counter
import json
from pathlib import Path
from core import verify_checkpoint
from adapters import CLUSTERS
def verify(report):
    results=verify_checkpoint(report['checkpoint'])['results'];events=report['events'];exp=report['experiment']
    ids=['research-001','research-002','research-003']
    assert [r['id'] for r in results]==ids,'Completed tasks mismatch'
    calls=Counter(e['job'] for e in events if e['kind']=='model_call_started')
    assert calls==Counter({job:1 for job in ids}),'Duplicate/missing inference'
    assert any(e['kind']=='forced_process_exit' and e['job']==ids[1] and e['exitCode']==73 for e in events),'Crash missing'
    assert any(e['kind']=='recovered_without_model_call' and e['job']==ids[1] for e in events),'Recovery missing'
    assert results[2]['output']['input']['previousCompletedIds']==ids[:2],'State not inherited'
    assert results[2]['output']['model']==exp['approvedFallback'],'Fallback mismatch'
    assert exp['completedTasks']==3 and exp['duplicateModelCalls']==0 and exp['uniqueModelCalls']==3
    cluster=report.get('cluster','devnet')
    assert cluster in CLUSTERS
    for r in results:
        output=r['output'];obs=output['input']['observation']
        assert obs['cluster']==cluster and obs['genesisHash']==CLUSTERS[cluster][1]
        assert output['billing']['kind']=='local_inference' and output['billing']['providerChargeUsd']==0
    assert report['actualProviderChargeUsd']==0
    assert report['paperLedger']['balance']>=report['paperLedger']['floor']
    return {'completed':len(results),'uniqueModelCalls':sum(calls.values()),'checkpointSha256':report['checkpoint']['sha256']}
if __name__=='__main__':
    import sys
    file=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).parent/'evidence/live-agent.json'
    print(json.dumps(verify(json.loads(file.read_text())),indent=2))
