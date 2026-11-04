const {json,error,validateFiles,countTokens}=require('./_meta');
const {validateAnalysis}=require('./_bundle');
const jd=require('./_organize');
const sample=require('./_sample-test');
const {compileRuntime,semanticCase}=require('./_semantic-runtime');
const {report}=require('./_preflight-report');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'POST required'});
 try{
  const files=validateFiles(req.body?.files),a=req.body?.analysis;validateAnalysis(a,files);
  const isJD=a.adapter==='jd-viewer-v1';
  if(a.semantic&&!isJD&&a.adapter!=='sample')return json(res,400,{error:'The built-in suite applies only to JD-viewer and bundled event cases.'});
  const allowance=req.body?.comparisonBudget??(isJD?100000:30000);
  if(!Number.isInteger(allowance)||allowance<1000||allowance>200000)throw Error('Comparison allowance must be 1,000–200,000 tokens.');
  const plan=a.semantic?compileRuntime(a):null,executions=[],bindings={};
  if(isJD){
   const suite=(a.testCases||jd.CASES).map(c=>jd.CASES.find(x=>x.id===c.id)).filter(Boolean);
   for(const c of suite)for(const mode of ['baseline','candidate']){
    const prepared=a.semantic?semanticCase(files,a,{mode,executionContext:c.context,utterance:c.query,intent:c.intent,plan}):{messages:jd.classifyMessages(files,a,c,mode)};
    executions.push({caseId:c.id,caseName:c.name,mode,stage:'initial',...prepared});
   }
  }else{
   const suite=sample.cases(req.body?.testSetups);
   for(const c of suite){
    bindings[c.id]=sample.hash(c);
    for(const mode of ['baseline','candidate'])for(const stage of c.tool?['initial','followup']:['initial'])executions.push({caseId:c.id,caseName:c.name,mode,stage,...sample.prepare(files,a,c,mode,stage)});
   }
  }
  for(let start=0;start<executions.length;start+=4)await Promise.all(executions.slice(start,start+4).map(async run=>{run.tokens=run.messages?await countTokens(run.messages):null;}));
  return json(res,200,report(a,executions,allowance,bindings));
 }catch(e){e.status=e.status||400;e.publicMessage=e.publicMessage||e.message;error(res,e);}
};
