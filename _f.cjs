const fs=require('fs');
let c=fs.readFileSync('D:/Projects/AI项目/BaiLongma-main/src/llm.js','utf-8');
c=c.replace('result.slice(0, 100)','String(result||"").slice(0, 100)');
c=c.replace('tr.result.slice(0, 300)','String(tr.result||"").slice(0, 300)');
fs.writeFileSync('D:/Projects/AI项目/BaiLongma-main/src/llm.js',c,'utf-8');
