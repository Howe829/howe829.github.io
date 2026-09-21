import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './worker.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT || 8787);
const origin=`http://127.0.0.1:${port}`;
const files=new Set(['index.html','style.css','app.mjs','client.mjs','evaluation.mjs','config.js']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,origin).pathname;
    if(path==='/api/evaluate'){
      let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>40000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      const request=new Request(origin+path,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const response=await handle(request,{ALLOWED_ORIGINS:`${origin},http://localhost:${port}`});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const file=path==='/'?'index.html':path.replace(/^\//,'');
    if(!files.has(file)){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-store'});res.end(await readFile(resolve(root,file)));
  }catch{res.writeHead(500);res.end('Server error');}
}).listen(port,'127.0.0.1',()=>console.log(`Preview: ${origin}`));
