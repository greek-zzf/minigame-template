import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const T={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.xml':'application/xml','.txt':'text/plain','.png':'image/png','.json':'application/json'};
const port=+process.env.PORT||4173;
// 与 dist/_redirects 一致：旧 /zh/ 地址 301 到英文路径（本地预览用）
function zhTarget(url){const q=url.indexOf('?'),pathOnly=q<0?url:url.slice(0,q),search=q<0?'':url.slice(q);let dest=null;
 if(pathOnly==='/zh'||pathOnly==='/zh/'||pathOnly==='/zh/index.html')dest='/';
 else if(pathOnly.startsWith('/zh/')){dest=pathOnly.slice(3);if(dest.endsWith('/index.html'))dest=dest.slice(0,-'index.html'.length);if(dest.length>1&&!dest.endsWith('/')&&!path.extname(dest))dest+='/'}
 return dest?dest+search:null}
http.createServer((q,r)=>{const dest=zhTarget(q.url);if(dest){r.writeHead(301,{Location:dest});return r.end()}
 let p=path.join('dist',decodeURIComponent(q.url.split('?')[0]));if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');
 if(!fs.existsSync(p)){r.writeHead(404,{'content-type':T['.html']});const lp=path.join('dist',q.url.split('/')[1]||'','404.html');return r.end(fs.readFileSync(fs.existsSync(lp)?lp:'dist/404.html'))}
 r.writeHead(200,{'content-type':T[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(r)}).listen(port,()=>console.log('http://localhost:'+port));
