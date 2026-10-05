// Local QA only. Public functions run on Vercel, not on this machine.
import http from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,extname,sep} from 'node:path';import handler from './api/network.js';
const root=resolve('dist'),types={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.zip':'application/zip','.xml':'application/xml'};
http.createServer(async(req,res)=>{
 if(req.url.split('?')[0]==='/api/network'){res.status=n=>(res.statusCode=n,res);res.json=d=>res.end(JSON.stringify(d));return handler(req,res);}
 try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path==='/')path='/index.html';else if(!extname(path))path+='.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error('Denied');const body=await readFile(file);res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(body);}
 catch{res.statusCode=404;res.end('Not found');}
}).listen(4183,'127.0.0.1',()=>console.log('BATTERY QA http://127.0.0.1:4183'));
