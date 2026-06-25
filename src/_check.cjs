const fs=require('fs'),path=require('path');
const index=fs.readFileSync('D:/Projects/AI项目/BaiLongma-main/src/index.js','utf-8');
const src='D:/Projects/AI项目/BaiLongma-main/src/';
const re = /from ['"](\.\/[^'"]+)['"]/g;
let m, missing=[];
while((m=re.exec(index))!==null){
  const p = path.resolve(src, m[1]);
  if(!fs.existsSync(p) && !fs.existsSync(p+'.js') && !fs.existsSync(p+'.mjs')){
    missing.push(m[1]);
  }
}
if(missing.length) { missing.forEach(f=>console.log('MISSING:',f)); }
else { console.log('All imports found'); }
