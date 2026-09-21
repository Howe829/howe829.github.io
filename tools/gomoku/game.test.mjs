import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,position,winningLine,candidates,requestFor,readMove} from './game.mjs';
import {handle} from './worker.mjs';

test('four win directions, overlines, and row edges follow freestyle rules',()=>{
 for(const step of [1,15,16,14]){const b=Array(225).fill(0),start=step===14?14:0;for(let n=0;n<5;n++)b[start+n*step]=1;assert.equal(winningLine(b,start).length,5);}
 const b=Array(225).fill(0);[12,13,14,15,16].forEach(i=>b[i]=1);assert.deepEqual(winningLine(b,14),[]);
 const long=Array(225).fill(0);for(let i=0;i<6;i++)long[i]=2;assert.equal(winningLine(long,2).length,6);
});
test('turn enforcement, occupied cells, and terminal games prevent extra moves',()=>{
 const g=new Game();assert.equal(g.place(0,2),false);assert.equal(g.place(0,1),true);assert.equal(g.place(0,2),false);assert.equal(g.place(-1,2),false);
 const win=[0,15,1,16,2,17,3,18,4];assert.equal(position(win).winner,1);assert.throws(()=>position([...win,19]));assert.throws(()=>position([0,0]));assert.throws(()=>position([225]));
 g.history=win;assert.equal(g.place(19,2),false);
});
test('full board without five is a draw',()=>{
 const groups=[[],[]];for(let r=0;r<15;r++)for(let c=0;c<15;c++)groups[(r+2*c)%4<2?0:1].push(r*15+c);
 const history=[];for(let n=0;n<113;n++){history.push(groups[0][n]);if(n<112)history.push(groups[1][n]);}
 assert.equal(position(history).draw,true);
});
test('undo removes one human move while waiting, or a complete completed round',()=>{
 const g=new Game();g.place(112,1);g.undo();assert.deepEqual(g.history,[]);g.place(112,1);g.place(113,2);g.place(114,1);g.place(115,2);g.undo();assert.deepEqual(g.history,[112,113]);
});
test('late Jev responses cannot land after undo or restart',()=>{
 const g=new Game();g.place(112,1);const old=g.revision;g.undo();g.place(111,1);assert.equal(g.accept(113,old),false);const current=g.revision;assert.equal(g.accept(113,current),true);g.reset();assert.equal(g.accept(114,current),false);
});
test('candidate shortlist keeps immediate wins and defenses and never includes occupied cells',()=>{
 const b=Array(225).fill(0);[105,106,107,108].forEach(i=>b[i]=2);[150,151,152,153].forEach(i=>b[i]=1);
 const opts=candidates(b);assert.ok(opts.some(x=>x.index===109&&x.attack.immediateWin));assert.ok(opts.some(x=>x.index===154&&x.defense.immediateWin));assert.ok(opts.length<=24);assert.ok(opts.every(x=>!b[x.index]));
});
test('Jev sees the full board, explicit move descriptions, and only legal choices',()=>{
 const req=requestFor([112]);assert.equal(req.state.board[7][7],'X');assert.equal(req.questions.move.type,'choice');assert.ok(Object.values(req.questions.move.criteria).every(x=>x.move.startsWith('Place WHITE at ')));assert.throws(()=>requestFor([]));assert.throws(()=>requestFor([112,113]));
 const choice=Object.keys(req.questions.move.criteria)[0];assert.equal(readMove({answers:{move:{type:'choice',choice,confidence:.5}}},req).index,Number(choice));assert.throws(()=>readMove({answers:{move:{type:'choice',choice:'112',confidence:.5}}},req));
});
const origin='https://howe829.github.io',env={ALLOWED_ORIGINS:origin};
function request(history=[112],o=origin){return new Request('https://proxy.example/api/move',{method:'POST',headers:{Origin:o,Authorization:'Bearer test-key','Content-Type':'application/json'},body:JSON.stringify({history,model:'ignored',questions:{untrusted:true}})});}
test('proxy constructs its own board decision, forwards BYOK and returns a validated move',async()=>{
 const res=await handle(request(),env,async(url,init)=>{assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer test-key');const body=JSON.parse(init.body);assert.equal(body.model,'jev-latest');const choice=Object.keys(body.questions.move.criteria)[0];return Response.json({model:'mock',answers:{move:{type:'choice',choice,confidence:.6}}});});
 assert.equal(res.status,200);const data=await res.json();assert.ok(Number.isInteger(data.index));assert.equal(res.headers.get('access-control-allow-origin'),origin);
});
test('proxy rejects wrong-turn histories, post-win moves and unauthorized origins before upstream',async()=>{
 let calls=0;const transport=async()=>{calls++;throw new Error('unexpected');};
 for(const moves of [[],[112,113],[0,15,1,16,2,17,3,18,4,19,5]])assert.equal((await handle(request(moves),env,transport)).status,400);
 assert.equal((await handle(request([112],'https://untrusted.example'),env,transport)).status,403);assert.equal(calls,0);
});
test('upstream errors and illegal Jev moves pause the game rather than substitute an engine move',async()=>{
 for(const status of [401,429,529])assert.equal((await handle(request(),env,async()=>new Response('private detail',{status}))).status,status);
 assert.equal((await handle(request(),env,async()=>Response.json({answers:{move:{type:'choice',choice:'112',confidence:1}}}))).status,502);
 assert.equal((await handle(request(),env,async()=>new Response(null,{status:302,headers:{location:'https://other.example'}}))).status,502);
});

test('reported game: sixth move I6 allows a forced loss, while E5 and I9 stop that threat',()=>{
 const parse=s=>(Number(s.slice(1))-1)*15+s.charCodeAt(0)-65;
 const req=requestFor(['H8','G8','G7','H7','F6'].map(parse));
 const bad=req.questions.move.criteria[parse('I6')].consequences;
 assert.equal(bad.outcome,'BLACK_CAN_FORCE_WIN_IN_TWO_MOVES');
 assert.deepEqual(bad.blackForcingReplies.find(x=>x.move==='I9').winningMoves,['E5','J10']);
 for(const safe of ['E5','I9'])assert.equal(req.questions.move.criteria[parse(safe)].consequences.outcome,'NO_FORCED_LOSS_FOUND_WITHIN_THIS_HORIZON');
 assert.match(req.questions.move.instructions,/avoid BLACK_CAN_FORCE_WIN_IN_TWO_MOVES/);
});
test('reported game: eighth move is already lost, blocking one end never claims safety',()=>{
 const parse=s=>(Number(s.slice(1))-1)*15+s.charCodeAt(0)-65;
 const req=requestFor(['H8','G8','G7','H7','F6','I6','I9'].map(parse));
 assert.ok(Object.values(req.questions.move.criteria).every(x=>x.consequences.outcome==='BLACK_WINS_NEXT'));
 assert.deepEqual(req.questions.move.criteria[parse('E5')].consequences.blackImmediateWinningMoves,['J10']);
});
test('tactical context recognizes broken fours, immediate wins and counter-wins against a fork',async()=>{
 const {threats,tacticalContext}=await import('./game.mjs');
 const b=Array(225).fill(0);[0,1,3,4].forEach(i=>b[i]=1);assert.deepEqual(threats(b,1).wins,[2]);
 const c=Array(225).fill(0);[110,111,112].forEach(i=>c[i]=1);[0,1,2].forEach(i=>c[i]=2);
 const result=tacticalContext(c,3);assert.deepEqual(result.whiteImmediateWinningMoves,['E1']);assert.deepEqual(result.blackForcingReplies,[]);
 c[3]=2;assert.equal(tacticalContext(c,4).outcome,'WHITE_WINS_NOW');
});
test('winning-window scan agrees with independent simulated winning moves',async()=>{
 const {threats}=await import('./game.mjs');let seed=9821;
 for(let round=0;round<6;round++){
  const b=Array(225).fill(0);for(let n=0;n<120;n++){seed=(seed*1664525+1013904223)>>>0;b[seed%225]=n%2+1;}
  for(const color of [1,2]){
   const expected=[];for(let i=0;i<225;i++)if(!b[i]){b[i]=color;if(winningLine(b,i).length)expected.push(i);b[i]=0;}
   assert.deepEqual(threats(b,color).wins,expected);
  }
 }
});

test('continuous-four proofs include forced defense and a later double threat, in both colors and all rotations',async()=>{
 const {forcingLine}=await import('./game.mjs');
 const parse=s=>(Number(s.slice(1))-1)*15+s.charCodeAt(0)-65;
 const wins=(b,color)=>b.flatMap((v,i)=>{if(v)return [];b[i]=color;const yes=winningLine(b,i).length;b[i]=0;return yes?[i]:[];});
 for(const color of [1,2])for(let rotation=0;rotation<4;rotation++){
  const rotate=i=>{let r=Math.floor(i/15),c=i%15;for(let j=0;j<rotation;j++)[r,c]=[c,14-r];return r*15+c;};
  const board=Array(225).fill(0);[105,106,107,76,92].map(rotate).forEach(i=>board[i]=color);
  const original=board.slice(),proof=forcingLine(board,color,{budget:{remaining:200}});
  assert.equal(proof.status,'PROVEN_FORCED_WIN');assert.ok(proof.line.some(x=>x.forcedBlock));assert.deepEqual(board,original);
  for(const step of proof.line){
   const i=parse(step.move);assert.equal(board[i],0);
   if(step.forcedBlock)assert.deepEqual(wins(board,color),[i]);
   board[i]=step.color;
   if(step.color===color){assert.equal(wins(board,3-color).length,0);if(step.unanswerableWinningPoints)assert.ok(wins(board,color).length>=2);}
  }
 }
});
test('proof search does not claim victory when defender can win first or budget is exhausted',async()=>{
 const {forcingLine}=await import('./game.mjs');const board=Array(225).fill(0);
 [105,106,107,76,92].forEach(i=>board[i]=1);[15,16,17,18].forEach(i=>board[i]=2);
 assert.equal(forcingLine(board,1).status,'UNKNOWN_WITHIN_BUDGET');
 assert.equal(forcingLine(board,1,{budget:{remaining:0}}).status,'UNKNOWN_WITHIN_BUDGET');
});
test('enriched context never replaces the legal move Jev actually selected',()=>{
 const req=requestFor([112,111,96,97,80]);const bad='83';
 assert.equal(req.questions.move.criteria[bad].consequences.blackContinuousFour.status,'PROVEN_FORCED_WIN');
 assert.equal(readMove({answers:{move:{type:'choice',choice:bad,confidence:.8}}},req).index,83);
});

test('copied record contains every move in order, correct outcome and only the current game after undo/reset',async()=>{
 const {exportRecord}=await import('./game.mjs');const g=new Game();
 g.history=[0,15,1,16,2,17,3,18,4];
 const text=exportRecord(g.history);assert.match(text,/黑棋（玩家）获胜；共 9 手/);
 assert.deepEqual(text.split('\n').filter(x=>/^\d+\./.test(x)),['1. 黑 A1','2. 白 A2','3. 黑 B1','4. 白 B2','5. 黑 C1','6. 白 C2','7. 黑 D1','8. 白 D2','9. 黑 E1']);
 g.undo();assert.match(exportRecord(g.history),/进行中，轮到黑棋/);assert.doesNotMatch(exportRecord(g.history),/9\. 黑 E1/);
 g.reset();assert.match(exportRecord(g.history),/共 0 手/);assert.throws(()=>exportRecord([0,0]));
});
