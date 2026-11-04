// Deliberately naive legacy composition: read all mixed prompts on every request.
const fs=require('node:fs'),path=require('node:path');
const names=['_core.txt','_core_jd_request_context.txt','rules_m2_recruitment_viewer.txt'];
function loadAll(){return {files:names.map(name=>({name,content:fs.readFileSync(path.join(__dirname,name),'utf8')})),intents:JSON.parse(fs.readFileSync(path.join(__dirname,'intents.json'),'utf8'))};}
module.exports={loadAll};
