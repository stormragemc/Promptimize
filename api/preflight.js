const {json,error,validateFiles,countTokens}=require('./_meta');
const {validateAnalysis,messagesFor}=require('./_bundle');const jd=require('./_organize');
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'POST required'});try{
 const files=validateFiles(req.body?.files),a=req.body?.analysis;validateAnalysis(a,files);
 if(a.adapter==='jd-viewer-v1'){const suite=(a.testCases||jd.CASES).map(c=>jd.CASES.find(x=>x.id===c.id)).filter(Boolean);const counts=await Promise.all(suite.flatMap(test=>['baseline','candidate'].map(mode=>countTokens(jd.classifyMessages(files,a,test,mode)))));let baseline=0,candidate=0;for(let i=0;i<counts.length;i+=2){baseline+=counts[i];candidate+=counts[i+1]}const reserved=baseline+candidate+suite.length*2*750;return json(res,200,{snapshot:a.sha256,baselineInitialInput:baseline,candidateInitialInput:candidate,reservedTokens:reserved,budgetLimit:100000,generationCallsMax:suite.length*2,canRun:candidate<baseline&&reserved<=100000,note:'JD-viewer classification cases, both versions. Input sizing plus bounded output reserve. No production actions.'})}
 const inputs=[['refund','Event ID EV-7. My purchase was 30 days ago. The organizer cancelled the event. Am I eligible?'],['cancellation','I own booking B-41. I have not confirmed cancellation. Cancel it.'],['profile','Show my profile. Do not change it.']];
 const weights=[4,1,1];const counts=await Promise.all(inputs.flatMap(([intent,q])=>['baseline','candidate'].map(mode=>countTokens(messagesFor(files,a,intent,q,mode)))));
 let baseline=0,candidate=0;inputs.forEach((_,i)=>{baseline+=weights[i]*counts[i*2];candidate+=weights[i]*counts[i*2+1]});
 const reserved=baseline+candidate+14*750+counts[0]+counts[1]+400;
 json(res,200,{snapshot:a.sha256,baselineInitialInput:baseline,candidateInitialInput:candidate,reservedTokens:reserved,budgetLimit:30000,generationCallsMax:14,canRun:candidate<baseline&&reserved<=30000,note:'Representative request sizing, not exact billing. Reserve includes output caps and two lookup follow-ups. Caching and accounting can differ.'});
 }catch(e){error(res,e)}};
