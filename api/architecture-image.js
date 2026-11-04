const {json,error,validateFiles}=require('./_meta');
const {kit}=require('./_advisor');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'POST required'});
 let attempted=false;
 try{
  const body=req.body||{},files=validateFiles(body.files);
  kit(body.report,body.analysis,files,body);
  const key=process.env.promptimizer_musespark||process.env.META_API_KEY;
  if(!key)throw Object.assign(Error('Meta key unavailable.'),{status:503,publicMessage:'Meta key unavailable.'});
  const prompt='Create a polished, readable architecture illustration for Promptimize.ai. Palette: marshmallow white, violet and bubblegum pink blended softly. Clear labels, generous space, no invented numerical results. Show a user request and application state entering a router; shared and selected workflow instructions enter compact context; a readiness check sends ready context to Meta for the response, or expands relevant context once. If required state is still missing, STOP and ask for clarification. Show the full flow with arrows and a visibly conditional fallback branch, not a decorative robot. This is a suggested design, not a measured benchmark. Techniques: '+body.report.techniques.map(t=>t.title+': '+t.why).join('\n').slice(0,3500);
  attempted=true;
  const response=await fetch('https://api.meta.ai/v1/images/generations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(80000),body:JSON.stringify({model:'muse-image-1.0',prompt,n:1})});
  const result=await response.json();
  if(!response.ok)throw Error(`Meta image generation returned ${response.status}. Your project may not have image access. No automatic retry was made.`);
  const image=result.data?.[0];
  const source=typeof image?.b64_json==='string'&&image.b64_json.length<4500000?'data:image/png;base64,'+image.b64_json:typeof image?.url==='string'&&image.url.startsWith('https://')?image.url:null;
  if(!source)throw Error('Meta returned no supported image. The exact SVG remains available.');
  return json(res,200,{source,snapshot:body.analysis.sha256,receipt:{model:'muse-image-1.0',usage:result.usage||null,created:result.created,recordedAt:new Date().toISOString(),imageCount:1},note:'AI-generated illustration. Use flow.svg as the authoritative flow; inspect the image for labeling errors.'});
 }catch(e){if(attempted)return json(res,502,{error:e.message,providerAttempted:true,usage:null});error(res,e);}
};
