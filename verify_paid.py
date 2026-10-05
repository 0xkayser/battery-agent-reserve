"""Offline integrity of an operator-published API record, not independent provider billing."""
import json
from pathlib import Path
import re
import sys
from core import digest
from paid_provider import Held, POLICY, inspect_receipt


def verify(proof):
    body = proof.get("body")
    if proof.get("schema") != "battery.paid-provider-proof/1" or not isinstance(body, dict) or digest(body) != proof.get("sha256"):
        raise Held("Paid proof integrity/schema mismatch")
    if body.get("policy") != POLICY or digest(body["exact_request"]) != body["request_sha256"]:
        raise Held("Approved request/policy mismatch")
    receipt = body["receipt"]
    result, cost = inspect_receipt(receipt, body["exact_request"])
    if (body["result"] != result or body["estimated_micro_usd"] != cost or
            body["usage"] != receipt["response"]["usage"] or
            body["provider_response_id"] != receipt["response"]["id"] or
            body["provider_request_id"] != receipt["request_id"]):
        raise Held("Published result/usage/estimate differs from API receipt")
    if (body["actual_provider_charge"] is not None or body["provider_headroom"] is not None or
            body["billing_status"] != "unverified" or body["downstream_authorized"] is not False or
            body["retained_hold_micro_usd"] != POLICY["experiment_micro_usd"]):
        raise Held("API usage cannot become actual billing/credit/authorization")
    kinds = [e["kind"] for e in body["events"]]
    required = ["exact_request_saved", "generation_dispatch_claimed", "provider_receipt_durable",
                "result_recovered_cost_estimated_billing_pending", "authenticated_response_readback_matched",
                "operator_content_rejected"]
    if kinds != required or body["generation_requests"] != 1:
        raise Held("Published event ordering or unique dispatch differs")
    if [e["at"] for e in body["events"]] != sorted(e["at"] for e in body["events"]):
        raise Held("Published event timestamps differ")
    review = body["content_review"]
    if (review["decision"] != "rejected" or review["request_sha256"] != body["request_sha256"] or
            review["result_sha256"] != digest(body["result"])):
        raise Held("Rejected deliverable is not bound to output")
    readback = body["authenticated_readback"]
    if not readback or not re.fullmatch(r"[a-f0-9]{64}", readback["response_hash"]):
        raise Held("Response readback observation missing")
    if body["runtime_observations"] != {"exit_code": 75, "receipt_durable_before_exit": True,
                                       "recoveries_without_generation": 2, "readback_gets": 1}:
        raise Held("Recorded recovery scope differs")
    return {"integrity": True, "generation_dispatches": 1, "total_tokens": body["usage"]["total_tokens"],
            "estimated_micro_usd": cost, "content_review": "rejected", "billing": "unverified",
            "meaning": "Offline operator-record relationships; not independent API authentication or invoice proof"}


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "evidence/paid-provider.json"
    print(json.dumps(verify(json.loads(path.read_text())), indent=2))
