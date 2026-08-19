const fs=require("fs"),path=require("path"),vm=require("vm");
const src=fs.readFileSync(path.join(__dirname,"..","chatgpt-archive.user.js"),"utf8");
const a=src.indexOf("/* ==PURE-START=="),b=src.indexOf("/* ==PURE-END==");
const ctx={console,TextDecoder,TextEncoder}; vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf("*/",a)+2,b),ctx);
const P=vm.runInContext("({parseWSFrames,parseSseFrames})",ctx);
const recs=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse);
const buckets={};
const add=(k,v)=>{ if(!buckets[k])buckets[k]={n:0,sample:null}; buckets[k].n++; if(!buckets[k].sample)buckets[k].sample=v; };
for(const r of recs){
  if(r.kind!=="websocket"||!r.raw)continue;
  for(const f of P.parseWSFrames(r.raw)){
    const p1=f.payload;
    if(!p1||typeof p1!=="object"){ add("no_payload:"+f.type,f); continue; }
    const p2=p1.payload;
    if(p2&&typeof p2==="object"){
      if(p2.type==="heartbeat")continue;
      if(typeof p2.encoded_item==="string"&&p2.encoded_item)continue;
      if(p2.message)continue;
      add("inner_type:"+(p2.type||"(none)"),{topic:f.topic_id,p2keys:Object.keys(p2),p2});
      continue;
    }
    add("no_inner_payload:p1type="+(p1.type||"(none)"),{topic:f.topic_id,p1keys:Object.keys(p1),p1});
  }
}
for(const [k,v] of Object.entries(buckets).sort((x,y)=>y[1].n-x[1].n)){
  console.log("\n### "+k+"  x"+v.n);
  console.log("  "+JSON.stringify(v.sample).slice(0,420));
}
