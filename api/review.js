const {json,error,validateFiles}=require('./_meta');const {revise}=require('./_review');
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'POST required'});try{const files=validateFiles(req.body?.files);json(res,200,revise(files,req.body?.analysis,req.body?.draft||{}))}catch(e){e.status=e.status||400;e.publicMessage=e.publicMessage||e.message;error(res,e)}};
