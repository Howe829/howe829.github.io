import { normalizeKey, evaluate } from './client.mjs';
import { requestFor, choices, labels } from './evaluation.mjs';
const $ = id => document.getElementById(id);
const local = ['localhost','127.0.0.1'].includes(location.hostname);
const endpoint = window.JEV_PROXY_URL || (local ? '/api/evaluate' : '');
const initial = { expression: $('expression').innerHTML, paternalism: $('paternalism').innerHTML };
$('route-note').textContent = endpoint ? `转发代理：${new URL(endpoint,location.href).origin}。密钥仅在页面内存中使用，不写入浏览器存储。` : '本站尚未配置转发代理，目前不能发起分析。';
$('example').onclick = () => { $('sentence').value = 'JEV是这样的回答吗？每次的json格式都不一样？不是ai图？嗯哼？多看看官方文档吧'; reset(); };
function reset() { $('count').textContent = `${$('sentence').value.length} / 5000`; for(const id of Object.keys(initial)) $(id).innerHTML = initial[id]; $('status').textContent = ''; }
$('sentence').addEventListener('input',reset); $('background').addEventListener('input',reset);
function node(tag,text,cls) { const n = document.createElement(tag); n.textContent = text; if(cls)n.className=cls; return n; }
function rows(container, probabilities, names) { for(const [k,name] of Object.entries(names)) { const row=node('div','','row'), meter=document.createElement('meter'); meter.min=0;meter.max=1;meter.value=probabilities[k];meter.setAttribute('aria-label',name);row.append(node('span',name),meter,node('span',`${Math.round(probabilities[k]*100)}%`));container.append(row); } }
$('analysis-form').addEventListener('submit',async event => {
  event.preventDefault(); reset();
  if(!endpoint){$('status').textContent='需要先配置可信的转发代理才能使用。';return;}
  if(!local && new URL(endpoint,location.href).protocol !== 'https:'){$('status').textContent='转发代理必须使用 HTTPS。';return;}
  let body;try{body=requestFor($('sentence').value,$('background').value);}catch(e){$('status').textContent=e.message;return;}
  let key; try { key = normalizeKey($('key').value); } catch(e) { $('status').textContent=e.message; return; }
  const controls = [...document.querySelectorAll('form input, form textarea, form button')];controls.forEach(n=>n.disabled=true);
  document.querySelector('.results').setAttribute('aria-busy','true'); $('submit').textContent='Jev 正在分析…'; $('status').textContent='正在分析，请稍候。';
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),45000);
  try {
    const data=await evaluate(endpoint,key,body,controller.signal), e=data.answers.expression, p=data.answers.paternalism;
    $('expression').replaceChildren(node('p',choices[e.choice],'result-title'),node('p',`模型置信度 ${Math.round(e.confidence*100)}%`,'muted'));rows($('expression'),e.probabilities,choices);
    const level=Object.keys(p.probabilities).reduce((a,b)=>p.probabilities[a]>=p.probabilities[b]?a:b);
    $('paternalism').replaceChildren(node('p',`最可能的档位：${labels[Number(level)]}`,'result-title'),node('div',`${p.score.toFixed(2)} / 2`,'score-number'),node('p',`三档加权分数 · 模型置信度 ${Math.round(p.confidence*100)}%`,'muted')); rows($('paternalism'),p.probabilities,{0:'不重',1:'还好',2:'很重'});
    $('status').textContent=`分析完成 · ${typeof data.model==='string'?data.model:'Jev'}`;
    if (matchMedia('(max-width:800px)').matches) $('expression').closest('article').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  } catch(e) { $('status').textContent=e instanceof TypeError?'结果显示失败，请联系维护者检查页面。':e.message; }
  finally {clearTimeout(timeout);controls.forEach(n=>n.disabled=false);document.querySelector('.results').setAttribute('aria-busy','false');$('submit').replaceChildren(document.createTextNode('分析这段话'),node('span','↗'));}
});
