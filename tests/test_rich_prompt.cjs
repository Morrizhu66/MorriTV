const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../rich-prompt.js'),'utf8'),context);
const refs=context.window.RichPrompt.references;
test('references use exact image variables, deduplicate and exclude numeric prefixes',()=>{
 const candidates=[{id:'a',name:'图片1'},{id:'b',name:'图片10'}];
 assert.equal(refs('@图片10向前走 @图片10',candidates).length,1);
 assert.equal(refs('@图片10向前走',candidates)[0].id,'b');
 assert.equal(refs('@图片100',candidates).length,0);
 assert.equal(refs('未引用图片1',candidates).length,0);
 assert.equal(refs('@图片1和@图片10',candidates).length,2);
});
