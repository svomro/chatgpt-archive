const fs=require("fs");
function splitJson(s){const out=[];let i=0;while(i<s.length){while(i<s.length&&/\s/.test(s[i]))i++;if(i>=s.length)break;let d=0,inStr=false,esc=false,st=i;for(;i<s.length;i++){const c=s[i];if(inStr){if(esc)esc=false;else if(c==="\\")esc=true;else if(c==='"')inStr=false;continue;}if(c==='"')inStr=true;else if(c==="{"||c==="[")d++;else if(c==="}"||c==="]"){d--;if(d===0){i++;break;}}}out.push(s.slice(st,i));}return out;}
function sseFrames(t){const out=[];for(const f of t.split("\n\n")){if(!f.trim())continue;let ev=null,dl=[];for(const l of f.split("\n")){if(l.startsWith("event:"))ev=l.slice(6).trim();else if(l.startsWith("data:"))dl.push(l.slice(5).trim());}out.push({event:ev,data:dl.join("\n")});}return out;}
const trunc=(x,n=48)=>{const s=typeof x==="string"?x:JSON.stringify(x);return s==null?String(x):(s.length>n?s.slice(0,n)+"…":s);};
const recs=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse);
const flat=[];for(const v of splitJson(recs.find(r=>r.kind==="websocket").raw)){const e=JSON.parse(v);Array.isArray(e)?flat.push(...e):flat.push(e);}
let k=0;
for(const env of flat){
  if(env.type!=="message")continue;
  const inner=env.payload&&env.payload.payload; if(!inner)continue;
  if(inner.type!=="stream-item"){ console.log(`[${k++}] <${inner.type}>`); continue; }
  for(const f of sseFrames(String(inner.encoded_item))){
    let j=null; try{j=JSON.parse(f.data);}catch(_){}
    let desc;
    if(j===null||typeof j!=="object") desc="raw="+trunc(f.data);
    else if(j.type) desc=`type=${j.type} ${trunc(Object.fromEntries(Object.entries(j).filter(([a])=>a!=="type")),90)}`;
    else if(j.o||typeof j.p==="string") desc=`o=${j.o||"-"} p=${JSON.stringify(j.p)} v=${trunc(j.v,70)}`;
    else if("v" in j) desc=`BARE v=${trunc(j.v,70)}`;
    else desc="keys="+Object.keys(j).join(",");
    console.log(`[${k++}] ev=${f.event||"-"} ${desc}`);
  }
}
