const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 8787);
const HOST = "0.0.0.0";
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, "shared-files");
const MAX_UPLOAD = 500 * 1024 * 1024;
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function send(res, status, data, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {"Content-Type": type, "X-Content-Type-Options":"nosniff","Cache-Control":"no-store"});
  res.end(data);
}
function safeName(name) {
  return path.basename(name).replace(/[^\w.\- ()]/g, "_").slice(0,150) || "file";
}
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,"http://localhost");
  if(req.method==="GET" && (url.pathname==="/" || url.pathname==="/index.html")){
    return fs.createReadStream(path.join(ROOT,"index.html")).on("error",()=>send(res,404,"index.html missing")).pipe(res);
  }
  if(req.method==="GET" && url.pathname==="/api/health") return send(res,200,JSON.stringify({ok:true}),"application/json");
  if(req.method==="GET" && url.pathname==="/api/files"){
    try {
      const files=fs.readdirSync(UPLOAD_DIR).filter(n=>fs.statSync(path.join(UPLOAD_DIR,n)).isFile()).map(name=>({displayName:name.replace(/^\d+_/,""),size:fs.statSync(path.join(UPLOAD_DIR,name)).size,url:"/download/"+encodeURIComponent(name)}));
      return send(res,200,JSON.stringify(files),"application/json");
    } catch { return send(res,500,'{"error":"Could not list files"}',"application/json");}
  }
  if(req.method==="POST" && url.pathname==="/api/upload"){
    let originalName;try{originalName=safeName(decodeURIComponent(req.headers["x-file-name"]||"file"))}catch{return send(res,400,"Invalid file name")}
    const dest=path.join(UPLOAD_DIR,Date.now()+"_"+originalName);let bytes=0;
    const out=fs.createWriteStream(dest,{flags:"wx"});
    req.on("data",chunk=>{bytes+=chunk.length;if(bytes>MAX_UPLOAD){req.destroy();out.destroy();try{fs.unlinkSync(dest)}catch{}}});
    req.pipe(out);
    out.on("finish",()=>send(res,200,JSON.stringify({success:true}),"application/json"));
    out.on("error",()=>{try{fs.unlinkSync(dest)}catch{};if(!res.headersSent)send(res,500,"Could not save file")});
    req.on("aborted",()=>{out.destroy();try{fs.unlinkSync(dest)}catch{}});
    return;
  }
  if(req.method==="GET" && url.pathname.startsWith("/download/")){
    let reqName;try{reqName=decodeURIComponent(url.pathname.slice(10))}catch{return send(res,400,"Invalid file name")}
    const name=path.basename(reqName);if(!name||name!==reqName||name.includes(".."))return send(res,400,"Invalid file name");
    const file=path.join(UPLOAD_DIR,name);if(!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,"File not found");
    res.writeHead(200,{"Content-Type":"application/octet-stream","Content-Length":fs.statSync(file).size,"Content-Disposition":`attachment; filename="${name.replace(/["\r\n]/g,"_").replace(/^\d+_/,"")}"`,"X-Content-Type-Options":"nosniff","Cache-Control":"no-store"});
    return fs.createReadStream(file).pipe(res);
  }
  send(res,404,"Not found");
});
const wss=new WebSocket.Server({noServer:true});
const rooms=new Map();
function leave(ws){if(!ws.room)return;const room=rooms.get(ws.room);if(room){room.delete(ws);for(const peer of room)if(peer.readyState===WebSocket.OPEN)peer.send(JSON.stringify({type:"peer-left"}));if(!room.size)rooms.delete(ws.room)}ws.room=null}
server.on("upgrade",(req,socket,head)=>{
  if(new URL(req.url,"http://localhost").pathname!=="/signal"){socket.destroy();return}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,req));
});
wss.on("connection",ws=>{
  ws.on("message",raw=>{
    let m;try{m=JSON.parse(raw.toString())}catch{return}
    if(m.type==="join"){
      const room=String(m.room||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,40);
      if(!room){ws.send(JSON.stringify({type:"error",message:"Invalid room code"}));return}
      leave(ws);let members=rooms.get(room);if(!members){members=new Set();rooms.set(room,members)}
      if(members.size>=2){ws.send(JSON.stringify({type:"error",message:"Room is full"}));return}
      ws.room=room;members.add(ws);ws.send(JSON.stringify({type:"joined",initiator:members.size===1}));
      return;
    }
    if(!ws.room)return;
    const members=rooms.get(ws.room)||new Set();
    if(m.type==="ready"){for(const peer of members)if(peer!==ws&&peer.readyState===WebSocket.OPEN)peer.send(JSON.stringify({type:"peer-ready"}));return}
    const allowed=new Set(["offer","answer","candidate"]);
    if(allowed.has(m.type))for(const peer of members)if(peer!==ws&&peer.readyState===WebSocket.OPEN)peer.send(JSON.stringify(m));
  });
  ws.on("close",()=>leave(ws));ws.on("error",()=>leave(ws));
});
server.listen(PORT,HOST,()=>{
 console.log("\\nQuickShare All-in-One running!");
 console.log(`Local: http://localhost:${PORT}`);
 for(const list of Object.values(os.networkInterfaces()))for(const n of list||[])if(n.family==="IPv4"&&!n.internal)console.log(`Network: http://${n.address}:${PORT}`);
 console.log("Room signaling is enabled. Public internet use requires HTTPS/WSS hosting; STUN-only P2P may need TURN.");
});
