module.exports=String.raw`"""Promptimize runner: Python standard library, explicit token preflight, no retries."""
import argparse, json, os, sys, urllib.request, urllib.error
from pathlib import Path
from loader import load_context
ROOT = Path(__file__).resolve().parent
BASE = "https://api.meta.ai/v1"
MODEL = "muse-spark-1.3"

def messages(context, utterance, baseline=False, route_intent=None):
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    text = (ROOT / "baseline.md").read_bytes().decode("utf-8") if baseline else load_context({**context, "intent": route_intent} if route_intent else context)
    if manifest["adapter"] == "jd-viewer-v1":
        developer = 'Classify the HR assistant request using the following instructions. Return JSON only: {"intent":"canonical intent name","entities":{}}. Preserve canonical entity field names. Do not execute HR actions.\n\n' + text
        user = json.dumps({"request_context": context, "utterance": utterance}, ensure_ascii=False, separators=(",", ":"))
    else:
        developer = 'You are an event operations assistant. Follow only these promptbase instructions:\n' + text + '\n\nReturn JSON only: {"action":"eligible|ineligible|lookup_event_status|ask_event_id|ask_confirmation|show_profile|cancel_booking|save_profile|escalate","event_id":"string or empty"}. A lookup action asks for a simulated tool result; do not infer its result. Never claim a side effect happened when no tool ran.'
        user = json.dumps({"request_context": context, "utterance": utterance}, ensure_ascii=False, separators=(",", ":")) if context else utterance
    return [{"role":"developer", "content":developer}, {"role":"user", "content":user}]

def post(path, body, key):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={"Content-Type":"application/json", "Authorization":"Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError("Meta API HTTP " + str(exc.code)) from None

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--context", help="JSON request-context file")
    p.add_argument("--utterance")
    p.add_argument("--case", help="Case ID from cases.json")
    p.add_argument("--intent", help="Optional workflow or intent hint for a semantic bundle")
    p.add_argument("--require-rule", action="append", help="Require a source rule ID in a semantic candidate")
    p.add_argument("--mode", choices=["baseline","candidate"], default="candidate")
    p.add_argument("--dry-run", action="store_true", help="Build a request without calling Meta")
    p.add_argument("--budget", type=int, default=20000, help="Input sizing plus output reserve per call")
    p.add_argument("--max-output", type=int, default=750)
    args=p.parse_args()
    if args.max_output < 1 or args.max_output > 3000: p.error("--max-output must be between 1 and 3000")
    case=None
    if args.case:
        case=next((x for x in json.loads((ROOT/"cases.json").read_text(encoding="utf-8")) if x["id"]==args.case),None)
        if not case: p.error("Unknown case ID")
    context=case.get("context", {}) if case else (json.loads(Path(args.context).read_text(encoding="utf-8")) if args.context else {})
    utterance=case["query"] if case else args.utterance
    if not utterance: p.error("Provide --utterance or --case")
    manifest=json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    semantic=manifest.get("semantic")
    selection=None
    if semantic:
        if semantic.get("runtime") != "runtime.json": p.error("Unsupported semantic runtime manifest.")
        from loader import runtime_request
        intent=args.intent or (case.get("intent") if case else None)
        prepared=runtime_request(context,utterance,args.mode=="baseline",intent,args.require_rule)
        selection=prepared.get("selection")
        if "messages" not in prepared:
            print(json.dumps({"mode":args.mode,"status":"unresolved","generation_started":False,"contextSelection":selection},ensure_ascii=False,indent=2));return
        request=prepared["messages"]
    else:
        if args.intent or args.require_rule: p.error("Selection hints require a semantic bundle.")
        request=messages(context,utterance,args.mode=="baseline",case["intent"] if case and manifest["adapter"] != "jd-viewer-v1" else None)
    receipt={"contextSelection":selection} if selection is not None else {}
    if args.dry_run:
        print(json.dumps({"mode":args.mode,"messages":request,"generation_started":False,**receipt},ensure_ascii=False,indent=2));return
    key=os.getenv("MODEL_API_KEY") or os.getenv("META_API_KEY") or os.getenv("promptimizer_musespark")
    if not key: p.error("Set MODEL_API_KEY securely in your shell before generation")
    sized=post("/responses/input_tokens",{"model":MODEL,"input":request},key)["input_tokens"]
    if sized+args.max_output>args.budget:
        if semantic:
            budget_selection=dict(selection or {}, status="unresolved")
            budget_selection["unresolved"]=[*budget_selection.get("unresolved",[]),{"code":"execution-token-budget-exceeded","detail":str(args.budget)}]
            print(json.dumps({"mode":args.mode,"status":"unresolved","generation_started":False,"contextSelection":budget_selection},ensure_ascii=False,indent=2));return
        p.error("Token allowance exceeded; no generation started")
    result=post("/chat/completions",{"model":MODEL,"messages":request,"max_completion_tokens":args.max_output,"reasoning_effort":"minimal","response_format":{"type":"json_object"}},key)
    choice=result.get("choices", [{}])[0];content=choice.get("message",{}).get("content")
    report={"mode":args.mode,"usage":result.get("usage"),"sizing_input_tokens":sized,"sizing_note":"Context sizing is not exact billing","finish_reason":choice.get("finish_reason"),**receipt}
    if not content or (semantic and choice.get("finish_reason")=="length"): report.update(status="incomplete",answer=None)
    else:
        try: answer=json.loads(content)
        except json.JSONDecodeError: report.update(status="incomplete",answer=None)
        else:
            report.update(status="completed",answer=answer)
            if case:
                action=answer.get("action" if semantic and manifest["adapter"]=="sample" else "intent")
                report["classification_pass"]=action==case["expected"] and (not case.get("field") or answer.get("entities",{}).get(case["field"])==case["value"])
    print(json.dumps(report,ensure_ascii=False,indent=2))
    # The runner returns model decisions. The web workbench owns deterministic tool-state simulation.
if __name__=="__main__":
    try: main()
    except (RuntimeError,TimeoutError,urllib.error.URLError) as exc:
        print(str(exc),file=sys.stderr);sys.exit(1)
`;
