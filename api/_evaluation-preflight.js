const {json,error,validateFiles,countTokens}=require('./_meta');
const {validatePlan,prepare,reservation,coverage}=require('./_evaluation');
const {report}=require('./_preflight-report');
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'POST required'});try{
 const files=validateFiles(req.body?.files),a=req.body?.analysis,p=validatePlan(req.body?.plan,files,a),requests=[],executions=[];
 const jobs=p.cases.filter(t=>t.enabled).flatMap(test=>['baseline','candidate'].map(mode=>({test,mode})));
 for(let index=0;index<jobs.length;index+=4)await Promise.all(jobs.slice(index,index+4).map(async({test,mode})=>{
  const start=Date.now(),out=prepare(files,a,test,mode),followup=test.tool?prepare(files,a,test,mode,'followup'):null;
  const inputTokens=out.messages?await countTokens(out.messages):null;
  const followupInputTokens=followup?(followup.messages?await countTokens(followup.messages):null):undefined;
  const unresolved=inputTokens===null||(test.tool&&followupInputTokens===null);
  const quote={caseId:test.id,mode,inputTokens,followupInputTokens,reservedTokens:unresolved?null:reservation(inputTokens,test,followupInputTokens),sizingMs:Date.now()-start,contextSelection:out.selection,unresolved};
  requests.push(quote);
  executions.push({caseId:test.id,caseName:test.name,mode,stage:'initial',tokens:inputTokens,selection:out.selection,weight:p.repetitions});
  if(test.tool)executions.push({caseId:test.id,caseName:test.name,mode,stage:'followup',tokens:followupInputTokens,selection:followup.selection,weight:p.repetitions});
 }));
 const result=report(a,executions,p.budgetLimit);
 for(const row of requests)row.unresolved=row.unresolved||result.blockers.some(b=>b.caseId===row.caseId&&b.mode===row.mode);
 json(res,200,{...result,planHash:p.sha256,requests,coverage:coverage(p,a)});
 }catch(e){error(res,e)}};
