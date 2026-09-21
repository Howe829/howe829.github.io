import { requestFor, validateResult } from './evaluation.mjs';
const upstream = 'https://api.typesafe.ai/v1/systemone';
export async function handle(request, env, upstreamFetch = fetch) {
  const origin=request.headers.get('Origin');
  const allowed=(env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  const accepted=origin && allowed.includes(origin);
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  if(accepted)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});
  const respond=(status,message)=>new Response(JSON.stringify({error:message}),{status,headers});
  if(new URL(request.url).pathname !== '/api/evaluate')return respond(404,'Not found');
  if(!accepted)return respond(403,'Origin not allowed');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return respond(405,'Method not allowed');
  const authorization=request.headers.get('Authorization') || '';
  if(!/^Bearer [^\s]{1,512}$/.test(authorization))return respond(401,'API key required');
  if(!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json'))return respond(415,'JSON required');
  if(Number(request.headers.get('Content-Length'))>40000)return respond(413,'Request too large');
  let input;
  try {
    // Bound streamed bodies too, even if Content-Length is absent.
    const reader=request.body?.getReader(); if(!reader)return respond(400,'Body required');
    let size=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>40000){await reader.cancel();return respond(413,'Request too large');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const body=JSON.parse(new TextDecoder().decode(bytes));
    // The proxy owns the model and questions, so callers cannot turn it into an arbitrary evaluator.
    input=requestFor(body?.state?.sentence,body?.state?.background ?? '');
  } catch {return respond(400,'Invalid input');}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),35000);
  try {
    const response=await upstreamFetch(upstream,{method:'POST',headers:{'Content-Type':'application/json','Authorization':authorization},body:JSON.stringify(input),signal:controller.signal,redirect:'manual'});
    if(!response.ok)return respond([401,403,429,529].includes(response.status)?response.status:502,'Evaluation service error');
    const result=validateResult(await response.json());
    return new Response(JSON.stringify({model:result.model,answers:result.answers,usage:result.usage}),{headers});
  } catch(e){return respond(e.name==='AbortError'?504:502,'Evaluation unavailable');}
  finally{clearTimeout(timer);}
}
export default {fetch(request, env) { return handle(request, env); }};
