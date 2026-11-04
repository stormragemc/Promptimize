const {json,error,validateFiles}=require('./_meta');
const advisor=require('./_advisor');
const {zip}=require('./_export');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'POST required'});
 try{
  const body=req.body||{},files=validateFiles(body.files);
  if(body.action==='preview')return json(res,200,{flow:advisor.diagram({snapshot:body.analysis?.sha256||''}),projection:advisor.projection(files,body.analysis,body.assumptions),modelSelection:advisor.modelFor(body.modelChoice,body.analysis?.rules?.length||0)});
  if(body.action==='download'){
   const output=advisor.kit(body.report,body.analysis,files,body);
   res.status(200).setHeader('Cache-Control','no-store').setHeader('Content-Type','application/zip').setHeader('Content-Disposition','attachment; filename="promptimize-architecture-kit.zip"');return res.end(zip(output));
  }
  if(body.action!=='generate')throw Object.assign(Error('Choose preview, generate or download.'),{status:400,publicMessage:'Choose preview, generate or download.'});
  return json(res,200,await advisor.architecture({...body,files}));
 }catch(e){if(e.providerAttempted)return json(res,e.status||502,{error:e.publicMessage||e.message,providerAttempted:true,usage:e.providerUsage||null});error(res,e);}
};
