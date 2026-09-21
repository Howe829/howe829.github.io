export const SIZE=15;
export const coordinate=i=>`${String.fromCharCode(65+i%SIZE)}${Math.floor(i/SIZE)+1}`;
const inside=(r,c)=>r>=0&&r<SIZE&&c>=0&&c<SIZE;
export function winningLine(board,index){
 const color=board[index];if(!color)return [];
 const r=Math.floor(index/SIZE),c=index%SIZE;
 for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
  const line=[index];
  for(const sign of [-1,1]){let rr=r+sign*dr,cc=c+sign*dc;while(inside(rr,cc)&&board[rr*SIZE+cc]===color){line.push(rr*SIZE+cc);rr+=sign*dr;cc+=sign*dc;}}
  if(line.length>=5)return line;
 }return [];
}
export function position(history){
 if(!Array.isArray(history)||history.length>225)throw new Error('棋谱格式不正确。');
 const board=Array(225).fill(0);let line=[];
 for(let n=0;n<history.length;n++){
  const i=history[n];if(!Number.isInteger(i)||i<0||i>=225||board[i]||line.length)throw new Error('棋谱包含非法落子。');
  board[i]=n%2+1;line=winningLine(board,i);
 }
 return {board,line,winner:line.length?board[history.at(-1)]:0,draw:history.length===225&&!line.length};
}
function features(board,index,color){
 const r=Math.floor(index/SIZE),c=index%SIZE;let best=1,openFours=0,openThrees=0,rank=0;
 for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
  let count=1,open=0;
  for(const sign of [-1,1]){let rr=r+sign*dr,cc=c+sign*dc;while(inside(rr,cc)&&board[rr*SIZE+cc]===color){count++;rr+=sign*dr;cc+=sign*dc;}if(inside(rr,cc)&&board[rr*SIZE+cc]===0)open++;}
  best=Math.max(best,count);if(count===4&&open===2)openFours++;if(count===3&&open===2)openThrees++;
  rank+=count>=5?1e7:open?Math.pow(12,count)*(open===2?3:1):0;
 }
 return {longestLine:best,immediateWin:best>=5,openFours,openThrees,rank};
}
export function candidates(board){
 const occupied=board.flatMap((v,i)=>v?[i]:[]);if(!occupied.length)return [{index:112,coordinate:'H8',attack:features(board,112,2),defense:features(board,112,1)}];
 const nearby=new Set();for(const i of occupied){const r=Math.floor(i/SIZE),c=i%SIZE;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){const rr=r+dr,cc=c+dc;if(inside(rr,cc)&&board[rr*SIZE+cc]===0)nearby.add(rr*SIZE+cc);}}
 return [...nearby].map(index=>{const attack=features(board,index,2),defense=features(board,index,1);return {index,coordinate:coordinate(index),attack,defense};}).sort((a,b)=>{
  const weight=x=>x.attack.rank+x.defense.rank*.95-Math.hypot(Math.floor(x.index/15)-7,x.index%15-7);
  return weight(b)-weight(a)||a.index-b.index;
 }).slice(0,24);
}
// Enumerate all five-cell windows once. This catches split fours as well as straight lines.
const WINDOWS=[];
for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
 if(inside(r+4*dr,c+4*dc))WINDOWS.push(Array.from({length:5},(_,n)=>(r+n*dr)*SIZE+c+n*dc));
}
export function threats(board,color){
 const wins=new Set(),forks=new Map();
 for(const window of WINDOWS){
  const empty=[];let blocked=false;
  for(const i of window){if(board[i]&&board[i]!==color){blocked=true;break;}if(!board[i])empty.push(i);if(empty.length>2){blocked=true;break;}}
  if(blocked)continue;
  if(empty.length===1)wins.add(empty[0]);
  if(empty.length===2)for(const [reply,target] of [empty,[empty[1],empty[0]]]){
   if(!forks.has(reply))forks.set(reply,new Set());forks.get(reply).add(target);
  }
 }
 return {wins:[...wins].sort((a,b)=>a-b),forks};
}
export function tacticalContext(board,index){
 if(board[index]!==0)throw new Error('只能分析空位。');
 const next=board.slice();next[index]=2;
 if(winningLine(next,index).length)return {outcome:'WHITE_WINS_NOW',explanation:`WHITE at ${coordinate(index)} ends the game immediately.`,blackImmediateWinningMoves:[],whiteImmediateWinningMoves:[],blackForcingReplies:[]};
 const black=threats(next,1),white=threats(next,2);
 const blackImmediateWinningMoves=black.wins.map(coordinate),whiteImmediateWinningMoves=white.wins.map(coordinate);
 // A fork matters only if WHITE cannot win on the intervening turn.
 const blackForcingReplies=black.wins.length?[]:[...black.forks].filter(([reply,targets])=>targets.size>=2&&!white.wins.some(i=>i!==reply)).map(([reply,targets])=>({move:coordinate(reply),winningMoves:[...targets].sort((a,b)=>a-b).map(coordinate)}));
 let outcome='NO_FORCED_LOSS_FOUND_WITHIN_THIS_HORIZON';
 let explanation='No immediate BLACK win or unanswerable BLACK double-winning-point reply was found. This is not a claim of long-term safety.';
 if(black.wins.length){outcome='BLACK_WINS_NEXT';explanation=`After WHITE ${coordinate(index)}, BLACK can immediately win at ${blackImmediateWinningMoves.join(' or ')}. Creating a WHITE four does not help: BLACK moves first.`;}
 else if(blackForcingReplies.length){outcome='BLACK_CAN_FORCE_WIN_IN_TWO_MOVES';const reply=blackForcingReplies[0];explanation=`WHITE ${coordinate(index)} -> BLACK ${reply.move} -> BLACK threatens wins at ${reply.winningMoves.join(' and ')}. WHITE has no immediate winning reply and can occupy only one winning point; BLACK wins on its following turn.`;}
 return {outcome,explanation,blackImmediateWinningMoves,whiteImmediateWinningMoves,blackForcingReplies};
}
// Proof-only continuous-four search; UNKNOWN never means safe. Jev still chooses.
export function forcingLine(board,attacker,{depth=3,budget={remaining:24}}={}){
 const defender=3-attacker;
 function search(b,left){
  if(budget.remaining<=0)return null;
  budget.remaining--;
  const own=threats(b,attacker),opponent=threats(b,defender);
  if(own.wins.length)return [{color:attacker,move:own.wins[0],wins:true}];
  if(left===0||opponent.wins.length>1)return null;
  const moves=[...own.forks].sort((a,b)=>b[1].size-a[1].size||a[0]-b[0]);
  for(const [move] of moves){
   if(opponent.wins.length&&move!==opponent.wins[0])continue;
   if(budget.remaining<=0)return null;
   budget.remaining--;
   const next=b.slice();next[move]=attacker;
   if(threats(next,defender).wins.length)continue;
   const targets=threats(next,attacker).wins;
   if(targets.length>1)return [{color:attacker,move,unanswerableWinningPoints:targets}];
   if(targets.length!==1)continue;
   const block=targets[0];next[block]=defender;
   const continuation=search(next,left-1);
   if(continuation)return [{color:attacker,move},{color:defender,move:block,forcedBlock:true},...continuation];
  }
  return null;
 }
 const line=search(board,depth);
 return {status:line?'PROVEN_FORCED_WIN':'UNKNOWN_WITHIN_BUDGET',line:line?.map(step=>({...step,move:coordinate(step.move),...(step.unanswerableWinningPoints?{unanswerableWinningPoints:step.unanswerableWinningPoints.map(coordinate)}:{})}))||[]};
}
function extendedContext(board,index){
 const facts=tacticalContext(board,index),next=board.slice();next[index]=2;
 if(facts.outcome==='WHITE_WINS_NOW')return facts;
 const budget={remaining:24};
 facts.blackContinuousFour=forcingLine(next,1,{budget});
 // WHITE cannot take a free turn: BLACK must have a uniquely forced reply first.
 if(!facts.blackImmediateWinningMoves.length&&facts.whiteImmediateWinningMoves.length>=2){
  facts.whiteForcedWin={status:'PROVEN_FORCED_WIN',winningPoints:facts.whiteImmediateWinningMoves};
 }else if(!facts.blackImmediateWinningMoves.length&&facts.whiteImmediateWinningMoves.length===1){
  const block=threats(next,2).wins[0];next[block]=1;
  facts.whiteAfterForcedBlackBlock={blackMustBlockAt:coordinate(block),...forcingLine(next,2,{budget})};
 }
 return facts;
}
export function requestFor(history){
 const p=position(history);if(p.winner||p.draw||history.length%2!==1)throw new Error('当前不是 Jev 的回合。');
 const moves=candidates(p.board);
 const criteria=Object.fromEntries(moves.map(m=>[String(m.index),{move:`Place WHITE at ${m.coordinate}`,whiteAfterMove:m.attack,blackIfPlacedHere:m.defense,consequences:extendedContext(p.board,m.index)}]));
 return {model:'jev-latest',state:{analysisScope:'Each candidate also includes bounded continuous-four proofs: up to three forcing attacks plus the final win, 24 search units per candidate. UNKNOWN_WITHIN_BUDGET never proves safety. Exact five-cell winning windows, BLACK immediate replies and BLACK replies creating at least two distinct winning points, with WHITE immediate counter-wins checked. Not a full minimax search. Never interpret NO_FORCED_LOSS_FOUND as guaranteed safety.',currentBlackWinningMoves:threats(p.board,1).wins.map(coordinate),currentWhiteWinningMoves:threats(p.board,2).wins.map(coordinate),rules:'Freestyle Gomoku, 15x15. Five or more consecutive stones horizontally, vertically or diagonally wins. No forbidden moves. Black moves first. You are WHITE (O), opponent is BLACK (X).',board:p.board.reduce((rows,v,i)=>{if(i%15===0)rows.push('');rows[rows.length-1]+=['.','X','O'][v];return rows;},[]),coordinates:'Rows 1 to 15 top to bottom, columns A to O left to right; . empty, X black, O white.',history:history.map((i,n)=>`${n%2?'O':'X'}:${coordinate(i)}`)},questions:{move:{type:'choice',instructions:'Choose the best legal WHITE move from the supplied candidates to win this Gomoku game. Use the board and candidate tactical features. Prefer winning immediately. Otherwise block an immediate BLACK win if possible. Read consequences for EVERY candidate: they describe the actual position AFTER WHITE places there, unlike blackIfPlacedHere which is only a hypothetical feature. Priority: WHITE_WINS_NOW; otherwise avoid BLACK_WINS_NEXT; then avoid BLACK_CAN_FORCE_WIN_IN_TWO_MOVES whenever any candidate avoids these proven losses. Developing your own three or four is not worth allowing an earlier forced loss. Use explicit reply coordinates and turn order. Then inspect blackContinuousFour: PROVEN_FORCED_WIN is a losing candidate even if the short-horizon outcome found no loss. Avoid it whenever alternatives exist. Prefer whiteForcedWin or whiteAfterForcedBlackBlock with PROVEN_FORCED_WIN when BLACK has no earlier win. Follow each line in turn order: forcedBlock is the only defense, unanswerableWinningPoints are distinct winning squares. UNKNOWN_WITHIN_BUDGET is not safety. Only after these checks compare development. If every candidate loses, choose the best resistance without treating it as safe. The rank fields are heuristic hints, not probabilities. Return one candidate choice.',criteria}}};
}
export function readMove(data,request){
 const answer=data?.answers?.move;const opts=request.questions.move.criteria;
 if(answer?.type!=='choice'||!Object.hasOwn(opts,answer.choice)||typeof answer.confidence!=='number'||!Number.isFinite(answer.confidence)||answer.confidence<0||answer.confidence>1)throw new Error('Jev 返回了无效落点，棋盘未改变，请重试。');
 return {index:Number(answer.choice),confidence:answer.confidence,model:typeof data.model==='string'?data.model:'Jev'};
}
export class Game{
 constructor(){this.history=[];this.revision=0;}
 get state(){return position(this.history);}
 place(index,color){const s=this.state;if(s.winner||s.draw||!Number.isInteger(index)||index<0||index>=225||s.board[index]||this.history.length%2+1!==color)return false;this.history.push(index);this.revision++;return true;}
 undo(){if(!this.history.length)return;this.history.splice(-(this.history.length%2?1:2));this.revision++;}
 reset(){this.history=[];this.revision++;}
 accept(index,revision){return revision===this.revision&&this.place(index,2);}
}

export function exportRecord(history){
 const state=position(history);
 const result=state.winner===1?'黑棋（玩家）获胜':state.winner===2?'白棋（Jev）获胜':state.draw?'和棋':`进行中，轮到${history.length%2?'白棋（Jev）':'黑棋（玩家）'}`;
 return ['落子 · Jev 五子棋复盘 v1','规则：15×15 自由五子棋；黑先白后；五子或以上获胜；无禁手。','坐标：A–O 从左到右，1–15 从上到下。','玩家执黑，Jev 执白；每颗白棋由 Jev Choice 选择。',`结果：${result}；共 ${history.length} 手。`,'完整棋谱：',...history.map((i,n)=>`${n+1}. ${n%2?'白':'黑'} ${coordinate(i)}`),'说明：此记录仅包含落子及结果，不包含当时的模型候选、概率或请求上下文。'].join('\n');
}
