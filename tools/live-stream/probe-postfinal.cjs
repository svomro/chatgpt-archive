// Does anything after last_token actually touch content? Answer before deciding
// what the freeze must do.
const fs=require("fs"),path=require("path"),vm=require("vm");
const src=fs.readFileSync(path.join(__dirname,"..","chatgpt-archive.user.js"),"utf8");
const a=src.indexOf("/* ==PURE-START=="),b=src.indexOf("/* ==PURE-END==");
const ctx={console,TextDecoder,TextEncoder}; vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf("*/",a)+2,b),ctx);
const P=vm.runInContext("({parseWSFrames,parseSseFrames})",ctx);
const recs=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse);

// Walk every SSE event in wire order, tagged with its turn, and note what lands
// after that turn's last_token.
const done=new Set(); const after={}; const afterDetail=[];
const contentish=(evt)=>{
  if(evt.type) return false;
  if(!("v" in evt || "o" in evt || typeof evt.p==="string")) return false;
  return true;
};
let total=0, lastTokens=0;
function walk(evt, turnId, event){
  total++;
  const key=turnId||"?";
  if(evt.type==="message_marker"&&evt.marker==="last_token"){ lastTokens++; done.add(key); return; }
  if(!done.has(key)) return;
  const label=evt.type||("delta:o="+(evt.o||"-")+" p="+JSON.stringify(evt.p));
  after[label]=(after[label]||0)+1;
  if(contentish(evt)&&afterDetail.length<12) afterDetail.push({turn:key.slice(0,8),event,frame:JSON.stringify(evt).slice(0,220)});
}
for(const r of recs){
  if(r.kind==="websocket"){
    for(const f of P.parseWSFrames(r.raw)){
      const p2=f.payload&&f.payload.payload; if(!p2)continue;
      const turnId=p2.turn_id||(/^conversation-turn-(.+)$/.exec(String(f.topic_id||""))||[])[1]||null;
      if(typeof p2.encoded_item!=="string")continue;
      for(const s of P.parseSseFrames(p2.encoded_item)){
        if(!s.data||s.data==="[DONE]"||s.data==='"v1"'){ if(s.data==="[DONE]"&&done.has(turnId)) { after["[DONE]"]=(after["[DONE]"]||0)+1; } continue; }
        let j; try{j=JSON.parse(s.data);}catch(_){continue;}
        if(j&&typeof j==="object") walk(j,turnId,s.event);
      }
    }
  } else if(r.raw){
    for(const s of P.parseSseFrames(r.raw)){
      if(!s.data||s.data==="[DONE]"||s.data==='"v1"')continue;
      let j; try{j=JSON.parse(s.data);}catch(_){continue;}
      if(j&&typeof j==="object") walk(j, j.turn_exchange_id||j.turn_id||null, s.event);
    }
  }
}
console.log("total SSE events:",total,"| last_token markers:",lastTokens,"| turns that completed:",done.size);
console.log("\nframes seen AFTER a turn's last_token:");
const ent=Object.entries(after).sort((x,y)=>y[1]-x[1]);
if(!ent.length) console.log("  (none)");
for(const [k,v] of ent) console.log("  "+String(v).padStart(5)+"  "+k);
console.log("\ncontent-shaped frames after last_token (first 12):");
if(!afterDetail.length) console.log("  (none)");
for(const d of afterDetail) console.log("  turn "+d.turn+" ev="+d.event+" "+d.frame);
