// Reviewed bridge. The model generates the project adapter, never this boundary.
module.exports=String.raw`"""Copy beside loader.py and run.py in an isolated Promptimize export.
No model calls are made here. Review the project adapter before importing it.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def prepare_request(context, utterance, workflow=None):
    if not isinstance(context, dict) or not isinstance(utterance, str) or not utterance.strip():
        return {"status": "unresolved", "reason": "Provide state and a user request."}
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    if workflow is not None and workflow not in manifest["modules"]:
        return {"status": "unresolved", "reason": "Workflow is not in the reviewed manifest."}
    if manifest.get("semantic"):
        from loader import runtime_request
        result = runtime_request(context, utterance, False, workflow)
        if not result.get("messages"):
            return {"status": "unresolved", "selection": result.get("selection"),
                    "reason": "Resolve missing context before generation."}
        return {"status": "ready", **result}
    if workflow is None:
        return {"status": "unresolved", "reason": "A reviewed workflow route is required."}
    from run import messages
    return {"status": "ready", "messages": messages({**context, "intent": workflow}, utterance)}
`;
