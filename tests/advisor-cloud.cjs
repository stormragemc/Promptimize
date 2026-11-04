// Explicit one-off fictional-data smoke test. Never called by normal builds.
const fs=require('node:fs');
const {extractContext,factsToContext,architecture,kit}=require('../api/_advisor');
const {proposeSemantic}=require('../api/_semantic-analysis');
const fixture=require('./backend/fixtures/observatory.json');
async function main(){
 if(!process.argv.includes('--run-live'))throw Error('Explicit --run-live is required; normal builds must not make paid model calls.');
 const report={format:'promptimize.advisor-smoke.v1',fictionalData:true,startedAt:new Date().toISOString(),completed:false,receipts:[]};
 try{
  const draft=await extractContext({contextFiles:[{name:'context/project.md',content:'This fictional observatory assistant routes telescope operators, duty technicians and public visitors. Telescope operations must respect the documented wind threshold. Names entered during roster collection refer to technicians, not observation targets. The request context includes deskPhase and domeState. The existing prompts contain the exact action names and safety policies.'}],promptFiles:fixture.files.map(f=>f.name),budget:16000});
  report.context=draft;report.receipts.push({stage:'context',...draft.receipt});
  const ctx=factsToContext(draft.facts,'Route a fictional observatory assistant without losing safety constraints.',true);
  const analysis=await proposeSemantic(fixture.files,{...ctx},{limits:{maxCalls:6,maxReservedTokens:60000}});
  report.analysis={snapshot:analysis.sha256,rules:analysis.rules.length,modules:Object.keys(analysis.modules),semantic:true,calls:analysis.semantic.calls};
  report.receipts.push(...analysis.semantic.calls.map(x=>({stage:'semantic-analysis',...x})));
  if(analysis.semantic.calls.some(c=>c.status!=='completed'&&c.status!=='cached'))throw Error('Semantic analysis did not complete; conservative source retention is not a successful optimization.');

  report.design=await architecture({files:fixture.files,analysis,...ctx,modelChoice:'wonder',budget:24000,assumptions:{fallbackRate:0.1,routingChars:400}});
  report.receipts.push({stage:'architecture',...report.design.receipt});
  const output=kit(report.design,analysis,fixture.files,{...ctx,assumptions:{fallbackRate:0.1,routingChars:400}});
  report.kitFiles=Object.keys(output);report.completed=true;
 }catch(e){report.error=e.publicMessage||e.message;report.failedAttempt={providerAttempted:!!e.providerAttempted,usage:e.providerUsage||null};}
 report.finishedAt=new Date().toISOString();
 fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/advisor-live-result.json',JSON.stringify(report,null,2));
 const encoded=Buffer.from(JSON.stringify(report)).toString('base64');const size=1000,total=Math.ceil(encoded.length/size);
 for(let i=0;i<total;i++)console.log('ADVISOR_LIVE_REPORT '+JSON.stringify({index:i,total,data:encoded.slice(i*size,(i+1)*size)}));
 console.log('ADVISOR_LIVE_SUMMARY '+JSON.stringify({completed:report.completed,error:report.error,stages:report.receipts.map(r=>({stage:r.stage,model:r.model,totalTokens:r.usage?.total_tokens})),kitFiles:report.kitFiles}));
 if(!report.completed)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
