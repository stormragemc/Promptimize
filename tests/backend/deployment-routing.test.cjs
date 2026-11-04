const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync,readdirSync}=require('node:fs'),{join}=require('node:path');
const handler=require('../../api/evaluation');
test('the 12-function deployment preserves each evaluation URL and rejects unknown dispatch',async()=>{
 const root=join(__dirname,'../..'),config=JSON.parse(readFileSync(join(root,'vercel.json'),'utf8'));
 const routes=readdirSync(join(root,'api')).filter(name=>name.endsWith('.js')&&!name.startsWith('_'));
 assert.equal(routes.length,12);assert.equal(config.outputDirectory,'.');
 assert.equal(config.functions['api/evaluation.js'].maxDuration,90);
 for(const operation of ['plan','preflight','case']){
  const rewrite=config.rewrites.find(r=>r.source==='/api/evaluation-'+operation);assert(rewrite);
  const destination=new URL(rewrite.destination,'https://example.invalid');assert.equal(destination.pathname,'/api/evaluation');
  const req={method:'GET',query:Object.fromEntries(destination.searchParams)},res={status(n){this.code=n;return this;},setHeader(){return this;},json(value){this.data=value;return this;}};
  await handler(req,res);assert.equal(res.code,405);assert.equal(res.data.error,'POST required');
 }
 for(const operation of [undefined,'constructor','__proto__','../../_meta',['plan','case']]){
  const res={status(n){this.code=n;return this;},setHeader(){return this;},json(value){this.data=value;return this;}};
  await handler({method:'POST',query:{operation}},res);assert.equal(res.code,404);
 }
});
