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

const textNode=value=>({nodeType:3,textContent:value});
const element=(tag,...children)=>({nodeType:1,tagName:tag,childNodes:children});
test('editor serialization retains pasted paragraphs, blank lines and inline mentions',()=>{
 const root=element('DIV',textNode('第一段'),element('DIV',element('BR')),element('DIV',textNode('第二段'),element('SPAN',textNode('@图片1')),textNode(' 后文')));
 assert.equal(context.window.RichPrompt.readText(root),'第一段\n\n第二段@图片1 后文');
});
test('editor serialization keeps literal newlines and trailing empty paragraphs',()=>{
 assert.equal(context.window.RichPrompt.readText(element('DIV',textNode('a\nb'),element('DIV',element('BR')))),'a\nb\n');
 assert.equal(context.window.RichPrompt.readText(element('DIV',textNode('a'),element('BR'),textNode('b'))),'a\nb');
});
