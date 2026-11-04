const {json,error,validateFiles,countTokens}=require('./_meta');
const {validatePlan,prepare,reservation,coverage,OUTPUT,MAX_CALL}=require('./_evaluation');
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'POST required'});try{
 const files=validateFiles(req.body?.files),a=req.body?.analysis,p=validatePlan(req.body?.plan,files,a),requests=[];
 const jobs=p.cases.filter(test=>test.enabled).flatMap(test=>['baseline','candidate'].map(mode=>({test,mode})));
 for(let index=0;index<jobs.length;index+=4){
  requests.push(...await Promise.all(jobs.slice(index,index+4).map(async({test,mode})=>{
   const start=Date.now(),out=prepare(files,a,test,mode);
   const inputTokens=out.messages?await countTokens(out.messages):null;
   return {caseId:test.id,mode,inputTokens,reservedTokens:inputTokens===null?0:reservation(inputTokens,test),sizingMs:Date.now()-start,contextSelection:out.selection,
    unresolved:inputTokens===null||inputTokens+OUTPUT>MAX_CALL};
  })));
 }
 const initial=mode=>requests.filter(row=>row.mode===mode).reduce((sum,row)=>sum+(row.inputTokens||0)*p.repetitions,0);
 const reservedTokens=requests.reduce((sum,row)=>sum+row.reservedTokens*p.repetitions,0);
 json(res,200,{snapshot:a.sha256,planHash:p.sha256,requests,baselineInitialInput:initial('baseline'),candidateInitialInput:initial('candidate'),reservedTokens,budgetLimit:p.budgetLimit,
  generationCallsMax:p.cases.filter(test=>test.enabled).reduce((sum,test)=>sum+2*p.repetitions*(test.tool?2:1),0),
  canRun:!requests.some(row=>row.unresolved)&&initial('candidate')<initial('baseline')&&reservedTokens<=p.budgetLimit,coverage:coverage(p,a),
  note:'Sizing is not exact billing. Includes every selected repetition and bounded lookup. The UI reserves each attempt; no automatic retries.'});
 }catch(e){error(res,e)}};
