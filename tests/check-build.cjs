// Syntax and asset checks only. Ordinary builds never call a model.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sources=['app.js','advisor.js','preflight-ui.js','sample-contract.js',...fs.readdirSync('api').filter(f=>f.endsWith('.js')).map(f=>path.join('api',f))];
for(const source of sources)new vm.Script(fs.readFileSync(source,'utf8'),{filename:source});
for(const [,src]of fs.readFileSync('index.html','utf8').matchAll(/<script src="([^"]+)"/g))if(!fs.existsSync(src.replace(/^\//,'')))throw Error('Missing script: '+src);
JSON.parse(fs.readFileSync('vercel.json','utf8'));
console.log('Checked '+sources.length+' JavaScript files and script assets. No model calls.');
