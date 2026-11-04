const {json,error,validateFiles}=require('./_meta');
const {createPlan,approvePlan,coverage}=require('./_evaluation');
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'POST required'});try{
 const files=validateFiles(req.body?.files),a=req.body?.analysis;
 const plan=req.body?.action==='approve'?approvePlan(req.body.plan,files,a):createPlan(files,a);
 json(res,200,{plan,coverage:coverage(plan,a)});
}catch(e){e.status=e.status||400;e.publicMessage=e.publicMessage||e.message;error(res,e)}};
