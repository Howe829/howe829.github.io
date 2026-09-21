import {Game,coordinate} from './game.mjs';
const $=id=>document.getElementById(id),game=new Game();
const local=['127.0.0.1','localhost'].includes(location.hostname),endpoint=local?'/api/move':window.GOMOKU_PROXY_URL;
let selected=null,pending=null,busy=false,failed=false,lastDecision='',focusIndex=112,announcedRevision=-1;
const ns='http://www.w3.org/2000/svg';
for(let n=0;n<15;n++)for(const horizontal of [true,false]){const l=document.createElementNS(ns,'line');const a=n*30+15;l.setAttribute('x1',horizontal?15:a);l.setAttribute('y1',horizontal?a:15);l.setAttribute('x2',horizontal?435:a);l.setAttribute('y2',horizontal?a:435);l.setAttribute('stroke','#a88c60');l.setAttribute('stroke-width','1');$('lines').append(l);}
for(const [r,c] of [[3,3],[3,11],[7,7],[11,3],[11,11]]){const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',c*30+15);dot.setAttribute('cy',r*30+15);dot.setAttribute('r',3);dot.setAttribute('fill','#8a7048');$('lines').append(dot);}
const cells=Array.from({length:225},(_,i)=>{const b=document.createElement('button');b.type='button';b.className='cell';b.setAttribute('role','gridcell');b.setAttribute('aria-rowindex',Math.floor(i/15)+1);b.setAttribute('aria-colindex',i%15+1);b.tabIndex=i===112?0:-1;b.onclick=()=>{if(busy||game.history.length%2||game.state.winner||game.state.draw||game.state.board[i])return;selected=i;focusIndex=i;render();};b.onkeydown=e=>{const directions={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};if(!directions[e.key])return;e.preventDefault();const [dr,dc]=directions[e.key],r=Math.floor(i/15)+dr,c=i%15+dc;if(r>=0&&r<15&&c>=0&&c<15){focusIndex=r*15+c;cells.forEach((x,n)=>x.tabIndex=n===focusIndex?0:-1);cells[focusIndex].focus();}};$('cells').append(b);return b;});
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function key(){const v=$('key').value.trim().replace(/^Bearer\s+/i,'');if(!/^[\x21-\x7e]{1,512}$/.test(v))throw new Error('请先填写有效格式的 TypeSafe API Key。');return v;}
function render(){
 const {board,line,winner,draw}=game.state,over=winner||draw,humanTurn=game.history.length%2===0&&!over;
 cells.forEach((b,i)=>{b.replaceChildren();b.className='cell'+(i===selected?' selected':'')+(i===game.history.at(-1)?' last':'')+(line.includes(i)?' win':'');b.tabIndex=i===focusIndex?0:-1;b.setAttribute('aria-label',`${coordinate(i)}，${board[i]===1?'黑棋':board[i]===2?'白棋':'空位'}`);b.setAttribute('aria-selected',String(i===selected));b.setAttribute('aria-disabled',String(!!board[i]||!humanTurn||busy));if(board[i]){const stone=document.createElement('i');stone.className=`stone ${board[i]===1?'black':'white'}`;b.append(stone);}});
 $('human').classList.toggle('active',!!humanTurn);$('ai').classList.toggle('active',!humanTurn&&!over);$('board').setAttribute('aria-busy',String(busy));
 $('move-count').textContent=over?'本局结束':`第 ${game.history.length+1} 手`;
 $('selection').textContent=over?'可查看棋盘，或重新开局':selected!==null?`已选 ${coordinate(selected)}，确认后落子`:busy?'Jev 正在思考…':'点选交叉点，再确认落子';
 $('place').disabled=selected===null||busy||!humanTurn;$('place').textContent=over?'本局结束':busy?'Jev 思考中…':selected!==null?`落子 ${coordinate(selected)}`:'选择一个落点';
 $('undo').disabled=!game.history.length;$('retry').hidden=!failed||busy||!!over;
 $('total').textContent=`${game.history.length} 手`;$('empty-log').hidden=!!game.history.length;
 $('history').replaceChildren(...game.history.map((i,n)=>{const li=document.createElement('li');li.textContent=`${n+1}. ${n%2?'白':'黑'} · ${coordinate(i)}`;return li;}));$('decision').textContent=lastDecision;
 if(winner)status(winner===1?'你赢了！五子连线，漂亮。':'Jev 赢了这局。再来一盘？');else if(draw)status('棋盘已满，这局和棋。');
 if(over&&announcedRevision!==game.revision){
  announcedRevision=game.revision;
  $('result-title').textContent=winner===1?'你赢了！':winner===2?'Jev 赢了这局':'这局，平分秋色。';
  $('result-detail').textContent=winner?`${winner===1?'黑棋':'白棋'}连成 ${line.length} 子，本局共 ${game.history.length} 手。${winner===1?'这一局，下得漂亮。':'下一局，再见招拆招。'}`:'棋盘已经下满，双方都没有形成五子连线。';
  $('result-dialog').dataset.winner=String(winner);
  $('result-dialog').showModal();
 }

}
async function aiMove(){
 if(busy||game.history.length%2!==1||game.state.winner||game.state.draw)return;
 let token;try{token=key();}catch(e){failed=true;status(e.message,true);render();$('key').focus();return;}
 if(!endpoint){failed=true;status('游戏代理尚未部署，请先使用本地预览。',true);render();return;}
 if(!local&&new URL(endpoint,location.href).protocol!=='https:'){failed=true;status('游戏代理必须使用 HTTPS。',true);render();return;}
 busy=true;failed=false;const revision=game.revision,controller=new AbortController();pending=controller;const timer=setTimeout(()=>controller.abort(),40000);status('Jev 正在判断下一手…');render();
 try{
  let response;try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({history:game.history}),signal:controller.signal,credentials:'omit',redirect:'error'});}catch(e){throw new Error(e.name==='AbortError'?'思考超时。可以重试，或悔棋。':'未收到游戏代理响应，请检查网络后重试。');}
  if(!response.ok)throw new Error(({401:'API Key 无效或已失效，请更换后重试。',403:'当前站点或密钥无访问权限。',429:'请求过于频繁，请稍后重试。',502:'代理未能取得有效的 Jev 落点，请重试。',504:'Jev 思考超时，请重试。',529:'Jev 繁忙，请稍后重试。'})[response.status]||`落子请求失败（${response.status}）。`);
  const answer=await response.json();if(!Number.isInteger(answer.index)||typeof answer.confidence!=='number'||!Number.isFinite(answer.confidence)||answer.confidence<0||answer.confidence>1)throw new Error('返回的落点无效，请重试。');
  if(game.revision!==revision)return;
  if(!game.accept(answer.index,revision))throw new Error('Jev 返回了非法落点，棋盘未改变。请重试。');
  lastDecision=`Jev 选择 ${coordinate(answer.index)} · 判断置信度 ${Math.round(answer.confidence*100)}%（非胜率）`;status(`Jev 落在 ${coordinate(answer.index)}，轮到你。`);
 }catch(e){if(game.revision===revision){failed=true;status(e.message,true);}}
 finally{clearTimeout(timer);if(pending===controller){busy=false;pending=null;render();}}
}
function cancel(){$('result-dialog').close();announcedRevision=-1;pending?.abort();pending=null;busy=false;failed=false;selected=null;lastDecision='';}
$('place').onclick=()=>{try{key();}catch(e){status(e.message,true);$('key').focus();return;}if(!endpoint){status('游戏代理尚未配置，请使用本地预览。',true);return;}if(selected===null||busy)return;if(game.place(selected,1)){selected=null;render();if(!game.state.winner&&!game.state.draw)aiMove();}};
$('retry').onclick=aiMove;
$('undo').onclick=()=>{cancel();game.undo();status('已撤回上一回合，轮到你。');render();};
function restart(){cancel();game.reset();focusIndex=112;status('新的一局，你执黑先手。');render();cells[112].focus();}
$('restart').onclick=()=>{if(game.history.length&&!game.state.winner&&!game.state.draw&&!confirm('结束当前对局，重新开局？'))return;restart();};
$('play-again').onclick=restart;
$('view-board').onclick=()=>{$('result-dialog').close();};
$('connection').textContent=endpoint?`转发代理：${new URL(endpoint,location.href).origin}`:'当前尚未配置公开游戏代理。';
render();
