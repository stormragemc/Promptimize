const {json,error,validateFiles,meta}=require('./_meta');
const {validateAnalysis}=require('./_bundle');const jd=require('./_organize');
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'POST required'});try{
 const files=validateFiles(req.body?.files),a=req.body?.analysis,mode=req.body?.mode,test=jd.CASES.find(c=>c.id===req.body?.test?.id);
 if(!jd.detect(files)||a?.adapter!=='jd-viewer-v1'||!test||!['baseline','candidate'].includes(mode))return json(res,400,{error:'Unsupported JD-viewer case.'});validateAnalysis(a,files);
 const messages=jd.classifyMessages(files,a,test,mode);const started=Date.now();const out=await meta(messages,750,{reasoningEffort:'minimal'});const value=out.value;
 const fieldMatches=!test.field||value.entities?.[test.field]===test.value;
 const pass=value.intent===test.expected&&fieldMatches;
 json(res,200,{status:'completed',mode,pass,failureReason:pass?'':`Expected ${test.expected}${test.field?' with '+test.field+'='+test.value:''}; received ${String(value.intent)}.`,answer:{action:String(value.intent||'unknown'),entities:value.entities||{}},usage:out.usage,snapshot:a.sha256,model:out.model,latencyMs:Date.now()-started,loadedModules:mode==='baseline'?Object.keys(a.modules):jd.selectModules(test.context).filter(x=>a.modules[x])});
 }catch(e){if(e.providerUsage)return json(res,200,{status:'incomplete',pass:null,reason:e.publicMessage,usage:e.providerUsage});error(res,e)}};
