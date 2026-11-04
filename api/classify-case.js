const {json,error,validateFiles,meta,countTokens} = require('./_meta');
const {simulateJD} = require('./_simulation');
const {validateAnalysis} = require('./_bundle');
const jd = require('./_organize');
const {
 semanticCase,selectionReceipt,requestUnresolved,EXECUTION_TOKEN_BUDGET,OUTPUT_RESERVE
} = require('./_semantic-runtime');

module.exports = async (req,res) => {
 if (req.method !== 'POST') return json(res,405,{error:'POST required'});
 let a,mode,receipt;
 try {
  const files = validateFiles(req.body?.files);
  a = req.body?.analysis;
  mode = req.body?.mode;
  const test = jd.CASES.find(c => c.id === req.body?.test?.id);
  if (!jd.detect(files) || a?.adapter !== 'jd-viewer-v1' || !test || !['baseline','candidate'].includes(mode)) {
   return json(res,400,{error:'Unsupported JD-viewer case.'});
  }
  validateAnalysis(a,files);
  const started = Date.now();
  let messages;
  if (a.semantic) {
   const prepared = semanticCase(files,a,{mode,executionContext:test.context,utterance:test.query,intent:test.intent});
   if (prepared.selection) receipt = selectionReceipt(prepared.selection);
   if (!prepared.messages) {
    return json(res,200,{status:'incomplete',mode,pass:null,reason:'Required evidence or execution state is unresolved.',usage:{},snapshot:a.sha256,contextSelection:receipt});
   }
   messages = prepared.messages;
   const sized = await countTokens(messages);
   if (sized + OUTPUT_RESERVE > EXECUTION_TOKEN_BUDGET) {
    return json(res,200,{status:'incomplete',mode,pass:null,reason:'Execution token allowance exceeded before generation.',usage:{},snapshot:a.sha256,contextSelection:requestUnresolved(receipt,EXECUTION_TOKEN_BUDGET)});
   }
  } else {
   messages = jd.classifyMessages(files,a,test,mode);
  }

  const out = await meta(messages,OUTPUT_RESERVE,{reasoningEffort:'minimal'});
  const value = out.value;
  const fieldMatches = !test.field || value.entities?.[test.field] === test.value;
  const simulation = simulateJD(test,value);
  const pass = value.intent === test.expected && fieldMatches && simulation.passed;
  const failureReason = pass ? '' : value.intent === test.expected && fieldMatches
   ? 'Intent matched, but simulated tool preconditions or resulting-state assertions failed.'
   : `Expected ${test.expected}${test.field?' with '+test.field+'='+test.value:''}; received ${String(value.intent)}.`;
  const loadedModules = mode === 'baseline' ? Object.keys(a.modules)
   : receipt?.modules || jd.selectModules(test.context).filter(name => a.modules[name]);
  json(res,200,{
   status:'completed',mode,pass,simulation,failureReason,
   answer:{action:String(value.intent || 'unknown'),entities:value.entities || {}},
   usage:out.usage,snapshot:a.sha256,model:out.model,latencyMs:Date.now()-started,loadedModules,
   ...(receipt ? {contextSelection:receipt} : {})
  });
 } catch (e) {
  if (e.providerUsage) {
   return json(res,200,{
    status:'incomplete',pass:null,reason:e.publicMessage,usage:e.providerUsage,
    ...(a?.semantic ? {mode,snapshot:a.sha256,...(receipt ? {contextSelection:receipt} : {})} : {})
   });
  }
  error(res,e);
 }
};
