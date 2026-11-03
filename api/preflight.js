const {json,error,validateFiles,countTokens}=require('./_meta');
const {validateAnalysis,messagesFor}=require('./_bundle');
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'POST required'});try{
 const files=validateFiles(req.body?.files),a=req.body?.analysis;validateAnalysis(a,files);
 const inputs=[['refund','Event ID EV-7. My purchase was 30 days ago. The organizer cancelled the event. Am I eligible?'],['cancellation','I own booking B-41. I have not confirmed cancellation. Cancel it.'],['profile','Show my profile. Do not change it.']];
 const weights=[4,1,1];const counts=await Promise.all(inputs.flatMap(([intent,q])=>['baseline','candidate'].map(mode=>countTokens(messagesFor(files,a,intent,q,mode)))));
 let baseline=0,candidate=0;inputs.forEach((_,i)=>{baseline+=weights[i]*counts[i*2];candidate+=weights[i]*counts[i*2+1]});
 const reserved=baseline+candidate+14*750+counts[0]+counts[1]+400;
 json(res,200,{snapshot:a.sha256,baselineInitialInput:baseline,candidateInitialInput:candidate,reservedTokens:reserved,generationCallsMax:14,canRun:candidate<baseline&&reserved<=30000,note:'Representative request sizing, not exact billing. Reserve includes output caps and two lookup follow-ups. Caching and accounting can differ.'});
 }catch(e){error(res,e)}};
