const {json,error}=require('./_meta');
const {extractContext}=require('./_advisor');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'POST required'});
 try{return json(res,200,await extractContext(req.body||{}));}
 catch(e){if(e.providerAttempted)return json(res,e.status||502,{error:e.publicMessage||e.message,providerAttempted:true,usage:e.providerUsage||null});error(res,e);}
};
