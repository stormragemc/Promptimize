const {modulePath}=require('./_organize');
const runner=require('./_runtime');
const loader=String.raw`"""Promptimize supported loader. Uploaded scripts are never executed."""
import json, re, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
def load_context(context):
    selected = ["shared", "workspace"]
    if context.get("jd_evaluation_results_modal_open"):
        selected += ["applicants", "evaluation"]
    elif context.get("candidate_information_modal_open"):
        selected += ["applicants", "candidate-information"]
    elif context.get("interview_workflow_phase"):
        selected += ["applicants", "interview"]
    elif context.get("jd_published_viewer_active_tab") == "applicants":
        selected += ["applicants", "interview"]
    else:
        selected = list(MANIFEST["modules"])
    if MANIFEST["adapter"] != "jd-viewer-v1":
        selected = ["shared", context["intent"]] if context.get("intent") else list(MANIFEST["modules"])
    pieces, order = {}, []
    for name in dict.fromkeys(selected):
        if name not in MANIFEST["modules"]:
            continue
        path = (ROOT / MANIFEST["modules"][name]).resolve()
        if not path.is_relative_to(ROOT.resolve()):
            raise RuntimeError("A prompt path leaves the export directory.")
        raw_bytes = path.read_bytes()
        expected_hash = MANIFEST.get("moduleHashes", {}).get(name)
        if expected_hash and hashlib.sha256(raw_bytes).hexdigest() != expected_hash:
            raise RuntimeError("A prompt module changed after review. Save a new candidate in Promptimize and export again.")
        raw = raw_bytes.decode("utf-8")
        markers = list(re.finditer(r"^<!-- promptimize-rule:(R[0-9]+) -->\n", raw, flags=re.M))
        for index, marker in enumerate(markers):
            end = markers[index + 1].start() - 2 if index + 1 < len(markers) else len(raw)
            rule_id, text = marker[1], raw[marker.end():end]
            if rule_id in pieces and pieces[rule_id] != text:
                raise RuntimeError("Copies of a shared prompt rule disagree.")
            if rule_id not in pieces:
                pieces[rule_id] = text
                order.append(rule_id)
    if MANIFEST["adapter"] != "jd-viewer-v1":
        source_order = json.loads((ROOT / "source-map.json").read_text(encoding="utf-8"))
        order = [rule["id"] for rule in source_order if rule["id"] in pieces]
    return "\n\n".join(pieces[rule_id] for rule_id in order)
if __name__ == "__main__":
    import sys
    print(load_context(json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}))
`;

function bundleFiles(a,results=[],sources=[],testPlan=null){
 const files={},paths={};
 const runtime=a.semantic?require('./_semantic-runtime'):null;
 const plan=runtime?.compileRuntime(a);
 const byRule=new Map(a.rules.map(rule=>[rule.id,rule]));
 for(const [name,ids]of Object.entries(a.modules)){
  const path=a.paths?.[name]||(a.adapter==='jd-viewer-v1'?modulePath(name):`workflows/${name}/prompt.md`);paths[name]=path;
  const rules=plan?plan.modules[name].map(id=>byRule.get(id)):a.rules.filter(r=>ids.includes(r.id));files[path]=rules.map(r=>`<!-- promptimize-rule:${r.id} -->\n${r.candidateText??r.quote}`).join('\n\n');
  const intents=require('./_intent-registry').intentRegistry(name,rules,a);
  files[path.replace(/[^/]+$/, 'intents.json')]=JSON.stringify(intents,null,2);
 }
 const moduleHashes=Object.fromEntries(Object.entries(paths).map(([name,path])=>[name,require('node:crypto').createHash('sha256').update(files[path]).digest('hex')]));
 const manifest={moduleHashes,format:'promptimize.v2',adapter:a.adapter||'sample',snapshot:a.sha256,modules:paths};
 if(plan){
  // Routing metadata is frozen; the executable instruction text lives in the
  // actual module files. Hashes make edits visible instead of silently ignoring
  // them or executing them under stale routing and evaluation evidence.
  const {createHash}=require('node:crypto');
  const exportedPlan={...plan,textSource:'module-files-v1',moduleHashes:Object.fromEntries(
   Object.entries(paths).map(([name,path])=>[name,createHash('sha256').update(files[path]).digest('hex')])
  ),rules:plan.rules.map(({text,...rule})=>rule)};
  files['runtime.json']=JSON.stringify(exportedPlan,null,2);
  files['loader.py']=runtime.semanticLoader;
  manifest.semantic={algorithm:a.semantic.algorithm,schemaVersion:a.semantic.schemaVersion,runtime:'runtime.json'};
 }
 files['manifest.json']=JSON.stringify(manifest,null,2);
 files['source-map.json']=JSON.stringify(a.rules.map(({id,file,line,sources,workflows,quote,candidateText})=>({id,file,line,sources,workflows,quote,candidateText})),null,2);
 const review=a.review||{note:'Source-preserving initial proposal'};
 files['review.json']=JSON.stringify(a.semantic?{...review,semantic:a.semantic}:review,null,2);
 files['evaluation.json']=JSON.stringify({snapshot:a.sha256,runs:results},null,2);
 if(testPlan){require('./_evaluation').validatePlan(testPlan,sources,a);files['test-plan.json']=JSON.stringify(testPlan,null,2);files['measurements.json']=JSON.stringify(require('../evaluation-metrics').summarize(a,testPlan,results),null,2);}
 files['README.md']='# Promptimize export\n\nOriginal source quotes remain in the review record. Candidate text may include explicit human corrections. Scope assignments require review. Classification tests are not a guarantee of production behavior.\n\n'+(a.adapter==='jd-viewer-v1'?'Run: python loader.py \'{"jd_evaluation_results_modal_open": true}\'\n\nUnknown UI state conservatively loads every module. The original Gateway classifier/composer was not included in the upload; integrate this loader explicitly.\n':'This sample exports prompt modules and a manifest.\n');
 if(!plan)files['loader.py']=loader;files['run.py']=runner;files['cases.json']=JSON.stringify(testPlan?testPlan.cases.filter(test=>test.enabled):a.testCases||[],null,2);
 if(sources.length)files['baseline.md']=a.adapter==='jd-viewer-v1'?sources.map(f=>f.content).join('\n\n'):sources.map(f=>`[${f.name}]\n${f.content}`).join('\n\n');
 if(plan)files['README.md']+='\nThe semantic runtime reads routing metadata from runtime.json and instruction text from the actual module Markdown files. It verifies the manifest snapshot, module hashes, rule markers and duplicate copies before running. If a file was edited, return to Review in Promptimize, save the correction, freeze a new candidate and export it again. Do not edit runtime hashes to bypass review: existing test results apply only to the frozen export. Missing required state or evidence stops generation. Review metadata and the source map retain original evidence and approved consolidation aliases.\n';
 files['README.md']+='\n## Run a real request\n\nPython 3.10+, standard library only. Configure MODEL_API_KEY in your shell; no key is embedded.\n\n'+(a.testCases?.length?'Dry run: python run.py --case '+a.testCases[0].id+' --dry-run\n\nLive candidate: python run.py --case '+a.testCases[0].id+'\n\nLive baseline: python run.py --case '+a.testCases[0].id+' --mode baseline\n':'Dry run: python run.py --utterance "Can I get a refund?" --dry-run\n')+'\nThe runner sizes input before generation, enforces a per-call token allowance, and does not retry. Tool-state simulation runs in the web workbench.\n';return files;
}
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function zip(files){let offset=0;const locals=[],central=[];for(const [name,text]of Object.entries(files)){const n=Buffer.from(name),data=Buffer.from(text),crc=crc32(data),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);locals.push(h,n,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);central.push(c,n);offset+=h.length+n.length+data.length}const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,cd,end])}
module.exports={bundleFiles,zip};
