// Syntax and asset checks only. Ordinary builds never call a model.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sources=['app.js','advisor.js','preflight-ui.js','sample-contract.js',...fs.readdirSync('api').filter(f=>f.endsWith('.js')).map(f=>path.join('api',f))];
for(const source of sources)new vm.Script(fs.readFileSync(source,'utf8'),{filename:source});
for(const [,src]of fs.readFileSync('index.html','utf8').matchAll(/<script src="([^"]+)"/g)){const file=src.replace(/^\//,'');if(!fs.existsSync(file))throw Error('Missing script: '+src);new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});}
JSON.parse(fs.readFileSync('vercel.json','utf8'));
console.log('Checked '+sources.length+' JavaScript files and script assets. No model calls.');

require('node:child_process').execFileSync(process.execPath,['demo/package-apps.cjs'],{stdio:'inherit'});
