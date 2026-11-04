// Small local/cloud Node server for the two otherwise identical standalone apps.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.PORT||3000);
let defaultVersion='before';try{defaultVersion=require('./default-version.json').version}catch{}
const handler=require('../api/showcase');
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/showcase'){
  const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((s,b)=>s+b.length,0)>2000000){res.writeHead(413).end();return;}}
  try{req.body=chunks.length?JSON.parse(Buffer.concat(chunks)):{};res.status=code=>(res.statusCode=code,res);res.json=data=>res.end(JSON.stringify(data));await handler(req,res);}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}return;
 }
 if(url.pathname==='/'&&!url.searchParams.has('version')){res.writeHead(302,{Location:'/?version='+defaultVersion}).end();return;}
 const route=url.pathname==='/'||url.pathname==='/demo/'?'/demo/index.html':url.pathname;
 if(!(route.startsWith('/demo/')||['/styles.css','/evaluation-metrics.js'].includes(route))||route.split('/').some(p=>p.startsWith('.'))){res.writeHead(404).end();return;}let decoded;try{decoded=decodeURIComponent(route);}catch{res.writeHead(400).end();return;}const file=path.resolve(root,'.'+decoded);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{const body=fs.readFileSync(file),ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.zip':'application/zip'})[ext]||'text/plain');res.end(body);}catch{res.writeHead(404).end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log('Forma ready on port '+port+' (default '+defaultVersion+'). No model calls until a request is submitted.'));
