const { request } = require('playwright');
const fs = require('node:fs');
(async()=>{
 const html=fs.readFileSync('index.html','utf8');
 const urls=[...new Set([...html.matchAll(/<a[^>]*href="(https:[^"]+)"/g)].map(match=>match[1])),'https://mouhibmahadbi.online/'];
 const client=await request.newContext();const result=[];
 for(let start=0;start<urls.length;start+=4){
  await Promise.all(urls.slice(start,start+4).map(async url=>{
   try{const response=await client.get(url,{timeout:20000});result.push({url,status:response.status(),finalURL:response.url()});}
   catch(error){result.push({url,error:error.message.split('\n')[0]});}
  }));
 }
 fs.mkdirSync('test-results', { recursive: true });
 fs.writeFileSync('test-results/live-links.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await client.dispose();
})()
