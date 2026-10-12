import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const T={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.xml':'application/xml','.txt':'text/plain','.png':'image/png','.json':'application/json'};
const port=+process.env.PORT||4173;
http.createServer((q,r)=>{let p=path.join('dist',decodeURIComponent(q.url.split('?')[0]));if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');
 if(!fs.existsSync(p)){r.writeHead(404,{'content-type':T['.html']});const lp=path.join('dist',q.url.split('/')[1]||'','404.html');return r.end(fs.readFileSync(fs.existsSync(lp)?lp:'dist/404.html'))}
 r.writeHead(200,{'content-type':T[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(r)}).listen(port,()=>console.log('http://localhost:'+port));
