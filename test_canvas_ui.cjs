// Pure front-end regression checks: no browser, network or paid provider calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('canvas.js', 'utf8');
function section(from, to) { return source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from))); }
function context(extra = {}) {
  const c = vm.createContext({ structuredClone, clone: structuredClone, uid: () => 'new-id', ...extra });
  vm.runInContext(section('function taskInputNode(', 'async function copyTaskInput('), c);
  return c;
}
test('task reuse freezes prompt, model, parameters and exact uploaded input version', () => {
  const c = context();
  const t = { id: 'old', kind: 'image', prompt: 'provider prompt', profile: 'old-model', reference_files: [{url:'/media/uploads/old/input.png'}] };
  const n = { name: 'shot', prompt: 'edited after generation', runs: [{taskId:'old',snapshot:{prompt:'original @hero',profile:'seedream50-pro-ark-direct',ratio:'1:1',refs:[{kind:'image',name:'hero',url:'/media/old.png',assetId:'mutable',taskId:'upstream',versionId:'v1'}]}}] };
  const result = c.taskInputNode(t,n);
  assert.equal(result.prompt,'original @hero');
  assert.equal(result.profile,'seedream50-pro-ark-direct');
  assert.equal(result.refs[0].url,'/media/uploads/old/input.png');
  assert.equal(result.refs[0].versionId,'v1');
  assert.equal(result.refs[0].assetId,undefined);
  assert.equal(n.runs[0].snapshot.refs[0].assetId,'mutable');
  assert.equal(result.replay.prompt,'provider prompt');
  assert.equal(result.versions.length,0);
});
test('legacy task without node still copies all image and video inputs', () => {
  const result = context().taskInputNode({id:'t',kind:'video',profile:'video',prompt:'old',duration:5,reference_files:[{mime:'image/png',url:'/media/a.png'},{mime:'video/mp4',url:'/media/b.mp4'}]});
  assert.equal(result.refs.length,2);assert.equal(result.refs[1].kind,'video');assert.equal(result.duration,'5');
});
test('text references do not shift uploaded media binding order', () => {
  const result=context().taskInputNode({id:'t',kind:'image',prompt:'p',reference_bindings:[{kind:'text',text:'story'},{kind:'image',name:'hero'}],reference_files:[{url:'/media/input.png'}]});
  assert.equal(result.refs[0].text,'story');assert.equal(result.refs[1].url,'/media/input.png');
});
test('batch failures retain selection; successful trash operations are recoverable', async () => {
  const picked=new Set(['a','b']);const trash=[];const records=[{id:'a',name:'A'},{id:'b',name:'B'}];
  const c=context({ assetBatchBusy:false,assetScope:'character',assets:records,recentAssetTrash:trash,assetSelection:()=>picked,
    renderAssets(){},renderPicker(){},centerPoint:()=>({x:0,y:0}),rebuildAssetIndex(){},toast(){},report(){},
    api:async url=>{if(url.endsWith('/b'))throw Error('offline');return {trash_path:'/trash/asset-a'};},
  });
  vm.runInContext(section('async function runAssetBatch(', 'function assetCard('), c);
  await c.runAssetBatch(records,'trash',true);
  assert.deepEqual([...picked],['b']);assert.deepEqual(trash,['asset-a']);assert.equal(c.assets.length,1);assert.equal(c.assetBatchBusy,false);
});
test('bulk add checkpoints once and defers per-node rendering', async () => {
  let checkpoints=0,renders=0;const selection=new Set(['a','b']);
  const c=context({assetBatchBusy:false,assetScope:'scene',assetSelection:()=>selection,renderAssets(){},renderPicker(){},centerPoint:()=>({x:0,y:0}),checkpoint:()=>checkpoints++,assetNode:(a,p,defer)=>{assert.equal(defer,true);return a;},touch(){},render:()=>renders++,focusNodes(){},toast(){},report(e){throw e;}});
  vm.runInContext(section('async function runAssetBatch(', 'function assetCard('),c);
  await c.runAssetBatch([{id:'a'},{id:'b'}],'add',true);
  assert.equal(checkpoints,1);assert.equal(renders,1);assert.equal(selection.size,0);
});
