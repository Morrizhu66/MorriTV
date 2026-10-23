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
test('empty image nodes can connect, then pin the first available result', () => {
  const sourceNode={id:'up',name:'Image',type:'image',versions:[]};
  const c=context({version:n=>n.versions?.at(-1),mediaURL:v=>v?.url});
  vm.runInContext(section('function binding(', 'function addReference('),c);
  const ref=c.binding(sourceNode), target={id:'down',refs:[ref]};
  assert.equal(ref.awaiting,true);assert.equal(ref.nodeId,'up');
  assert.equal(c.resolvePendingReferences([sourceNode,target]),false);
  sourceNode.versions.push({id:'v1',kind:'image',url:'/media/first.png'});
  assert.equal(c.resolvePendingReferences([sourceNode,target]),true);
  assert.equal(target.refs[0].versionId,'v1');assert.equal(target.refs[0].awaiting,false);
  sourceNode.versions.push({id:'v2',kind:'image',url:'/media/second.png'});
  assert.equal(c.resolvePendingReferences([sourceNode,target]),false);
  assert.equal(target.refs[0].url,'/media/first.png');
});
test('drag menu creates a downstream node even when the upstream is empty', () => {
  let config, entries, called;
  const c=context({worldPoint:(x,y)=>({x:x/2,y:y/2}),version:()=>undefined,derive:(...args)=>called=args,CanvasUI:{menu:(e,o)=>{entries=e;config=o;}}});
  vm.runInContext(section('function connectionMenu(', 'let cancelConnection'),c);
  const sourceNode={id:'empty',type:'image'};
  c.connectionMenu(sourceNode,{x:400,y:200});entries[0].action();
  assert.equal(called[0],sourceNode);assert.equal(called[1],'image');assert.equal(called[2].x,218);assert.equal(called[2].y,-10);assert.equal(config.label,'创建下游节点');
});
test('multi-select entry selects nothing; select all is a separate explicit action', () => {
  const selection=new Set(),modes=new Set(),entries=[{id:'a'},{id:'b'}];let bar;
  function element(tag,cls,text){return {tag,cls,text,children:[],append(...kids){this.children.push(...kids);},replaceChildren(){this.children=[];},querySelectorAll(){return this.children.filter(x=>x.tag==='button');}};}
  const parent={classList:{toggle(){}},querySelector:s=>s==='.asset-selection-bar'?bar:{before:b=>bar=b}};
  const c=context({$:()=>parent,make:element,button:(label,fn)=>({...element('button','',label),click:fn}),assetSelection:()=>selection,assetSelectionKey:()=> 'library:board',assetSelectionModes:modes,libraryEntries:()=>entries,assetScope:'board',assetBatchBusy:false,recentAssetTrash:[],renderAssets(){},renderPicker(){},CanvasUI:{menu(){}}});
  vm.runInContext(section('function renderAssetSelection(', 'async function restoreRecentAssets('),c);
  c.renderAssetSelection(false,entries);
  assert.equal(bar.children.find(b=>b.tag==='button').text,'多选');
  bar.children.find(b=>b.text==='多选').click();assert.equal(selection.size,0);assert.equal(modes.has('library:board'),true);
  c.renderAssetSelection(false,entries);bar.children.find(b=>b.text==='全选').click();assert.equal(selection.size,2);
  c.renderAssetSelection(false,entries);bar.children.find(b=>b.text==='完成').click();assert.equal(selection.size,0);assert.equal(modes.size,0);
});
test('connection geometry uses a cubic path in both directions', () => {
 const c=context();vm.runInContext(section('function connectionPath(', 'function connectionAnchor('),c);
 assert.equal(c.connectionPath({x:0,y:10},{x:200,y:100}),'M0,10 C90,10 110,100 200,100');
 assert.match(c.connectionPath({x:300,y:10},{x:0,y:10}),/^M300,10 C/);
});
test('connection anchors stay in board coordinates while the view is waiting to paint', () => {
 const port={offsetLeft:342,offsetTop:94,offsetWidth:32,offsetHeight:32,offsetParent:{clientLeft:1,clientTop:1}};
 const c=context({$:()=>({querySelector:()=>port}),worldPoint:()=>{throw Error('must not read the pending screen transform');}});
 vm.runInContext(section('function connectionAnchor(', 'function connectionMenu('),c);
 const anchor=c.connectionAnchor({id:'n',x:400,y:200});
 assert.equal(anchor.x,759);assert.equal(anchor.y,311);
 port.offsetLeft=-16;
 const input=c.connectionAnchor({id:'n',x:400,y:200},true);
 assert.equal(input.x,401);assert.equal(input.y,311);
});
test('a newly connected text node waits for content before freezing its snapshot', () => {
  const n={id:'text',type:'text',name:'Notes',prompt:'',versions:[]};
  const c=context({version:n=>n.versions?.at(-1),mediaURL:v=>v?.url});
  vm.runInContext(section('function binding(', 'function addReference('),c);
  const target={refs:[c.binding(n)]};
  assert.equal(target.refs[0].awaiting,true);
  assert.equal(c.resolvePendingReferences([n,target]),false);
  n.prompt='A scene at sunrise';
  assert.equal(c.resolvePendingReferences([n,target]),true);
  assert.equal(target.refs[0].text,n.prompt);
  n.prompt='Later edit';
  assert.equal(c.resolvePendingReferences([n,target]),false);
  assert.equal(target.refs[0].text,'A scene at sunrise');
});
test('reverse drag creates an upstream node with one undo checkpoint', () => {
  let entries, created, checkpoints=0, renders=0;
  const target={id:'down',type:'image',refs:[]};
  const c=context({NODE_WIDTH:360,worldPoint:(x,y)=>({x,y}),version:()=>undefined,checkpoint:()=>checkpoints++,
    createNode:(type,point,overrides,defer,exact)=>{assert.equal(defer,true);assert.equal(exact,true);return created={id:'up',type,...point};},
    binding:n=>({nodeId:n.id,awaiting:true}),selected:new Set(),touch(){},render:()=>renders++,requestAnimationFrame(){},
    CanvasUI:{menu:e=>entries=e}});
  vm.runInContext(section('function connectionMenu(', 'let cancelConnection'),c);
  c.connectionMenu(target,{x:600,y:300},null,true);
  entries.find(e=>e?.label==='文本').action();
  assert.equal(created.type,'text');assert.equal(created.x,222);assert.equal(created.y,190);
  assert.equal(target.refs[0].nodeId,'up');assert.equal(checkpoints,1);assert.equal(renders,1);
});
test('deriving at the pointer preserves placement and does not recenter the canvas', () => {
  let called;
  const c=context({binding:()=>({nodeId:'source',awaiting:true}),activeShot:'',createNode:(...args)=>{called=args;return {id:'new'};}});
  vm.runInContext(section('function derive(', 'async function submitNode('),c);
  const point={x:800,y:240}; c.derive({id:'source'},'image',point);
  assert.equal(called[1],point);assert.equal(called[4],true);assert.equal(called[2].prompt,'');
});
test('submit paints pending before starting asynchronous work and reports failures in the monitor', async () => {
  let frames=[], events=[], opened=false;
  const c=context({pending:new Set(),render:()=>events.push('render'),requestAnimationFrame:fn=>frames.push(fn),boardId:'b',
    renderTaskList:()=>events.push('monitor'),$:()=>({get open(){return opened;},showModal(){opened=true;}}),
    submitNodeRequest:async()=>{events.push('request');throw Error('upload failed');}});
  vm.runInContext(section('const submissionErrors =', 'async function submitNodeRequest('),c);
  const promise=c.submitNode({id:'n',type:'image',prompt:'p',profile:'image'});
  assert.equal(c.pending.has('n'),true); assert.deepEqual(events,['render']);
  frames.shift()(); frames.shift()(); await promise;
  assert.deepEqual(events,['render','request','monitor','render']); assert.equal(opened,true); assert.equal(c.pending.size,0);
});
test('view changes persist locally without marking document dirty', () => {
  const stored = new Map(), b = {view:{x:40,y:70,z:.8}};
  let callback;
  const c = vm.createContext({boardId:'b',board:()=>b,localStorage:{setItem:(k,v)=>stored.set(k,v),getItem:k=>stored.get(k)},setTimeout:f=>{callback=f;return 1},clearTimeout:()=>{}});
  vm.runInContext(section('const viewTimers =','function touch()'),c);
  c.rememberView();callback();b.view={x:0,y:0,z:1};c.restoreView();
  assert.equal(b.view.x,40);assert.equal(b.view.z,.8);
  assert.doesNotMatch(section('function zoom(', 'function startMove('),/touch\(/);
  assert.doesNotMatch(section('// Canvas controls.', '$("#viewport").addEventListener("pointerdown"'),/touch\(/);
});
test('inspiration reuse remaps references, keeps versions and never submits generation', () => {
 const b={nodes:[]};let serial=0;
 const c=vm.createContext({uid:()=>`new-${++serial}`,clone:structuredClone,board:()=>b,checkpoint:()=>{},centerPoint:()=>({x:10,y:20}),selected:new Set(),setWorkspaceView:()=>{},touch:()=>{},render:()=>{},focusNodes:()=>{},toast:()=>{}});
 vm.runInContext(section('function reuseInspiration(', 'function renderInspirations('),c);
 const item={root:'a',nodes:[{id:'a',x:100,y:200,type:'image',prompt:'keep',refs:[{nodeId:'b',versionId:'v'}],versions:[{id:'v2'}],runs:[{taskId:'old'}]},{id:'b',x:0,y:0,type:'image',refs:[],versions:[{id:'v'}]}]};
 c.reuseInspiration(item);
 assert.equal(b.nodes[0].refs[0].nodeId,b.nodes[1].id);assert.equal(b.nodes[0].prompt,'keep');assert.equal(b.nodes[0].versions[0].id,'v2');assert.equal(b.nodes[0].runs.length,0);assert.equal(item.nodes[0].id,'a');
});
test('inspiration search matches title and prompts with combined case-insensitive keywords', () => {
 const c=vm.createContext({});vm.runInContext(section('function inspirationMatches(', 'function renderInspirations('),c);
 const i={name:'Studio portrait',root:'a',nodes:[{id:'a',prompt:'柔和光线 人物',versions:[{snapshot:{prompt:'old prompt'}}]}]};
 assert.equal(c.inspirationMatches(i,'studio 人物'),true);assert.equal(c.inspirationMatches(i,'old'),true);assert.equal(c.inspirationMatches(i,'landscape'),false);assert.equal(c.inspirationMatches(i,' '),true);
});

test('editing text never starts a node move or modifies selection', () => {
  for (const kind of ['textarea','contenteditable','mention-child']) {
    const target={kind,closest:()=>null};
    let editingCalls=0;
    const c=vm.createContext({CanvasUI:{isEditing(t){editingCalls++;return t===target;}}});
    vm.runInContext(section('function startMove(', 'function connectionPath('),c);
    // Any drag/selection access would throw: editable content must return first.
    c.startMove({button:0,target,stopPropagation(){throw Error('drag started');}},{id:'node'});
    assert.equal(editingCalls,1);
  }
});
test('disconnecting a reference preserves source and other references',()=>{
 const a={nodeId:'a',name:'hero'},b={nodeId:'b',name:'place'};
 const n={refs:[a,b],prompt:'@hero walks to @place'};
 const c=vm.createContext({checkpoint(){},touch(){},render(){},version:n=>n.versions?.[0]});
 vm.runInContext(section('function disconnectEdge(', 'function drawEdges('),c);
 c.disconnectEdge(n,a);assert.equal(n.refs.length,1);assert.equal(n.refs[0],b);assert.equal(n.prompt,' walks to @place');
 const extracted={versions:[{sourceFrame:{nodeId:'video'},url:'still.png'}]};
 c.disconnectEdge(extracted,{extracted:true});assert.equal(extracted.versions[0].sourceFrame,undefined);assert.equal(extracted.versions[0].url,'still.png');
});
test('image variables distinguish duplicate files and retain numbers after deletion',()=>{
 const b={nodes:[{id:'a',name:'image.png',kind:'image'},{id:'b',name:'image.png',kind:'image'}]};
 const c=vm.createContext({board:()=>b,version:x=>x,thumb:x=>x.id});
 vm.runInContext(section('function removeImageMention(', 'function drawEdges('),c);
 assert.equal(c.imageMentionCandidates({id:'target'})[1].name,'图片2');
 b.nodes.shift();b.nodes.push({id:'c',name:'new.png',kind:'image'});
 assert.equal(c.imageMentionCandidates({id:'target'})[0].name,'图片2');
 assert.equal(c.imageMentionCandidates({id:'target'})[1].name,'图片3');
 assert.equal(c.removeImageMention('@图片1 和 @图片10','图片1'),' 和 @图片10');
});

test('provider submission maps reordered mentions once and respects numeric boundaries', async () => {
  let form;
  const n={id:'n',type:'image',profile:'test',prompt:'@图片2 穿着 @图片1 的衣服，保留 @图片10',refs:[
    {kind:'image',name:'图片2',url:'/media/a.png',role:'人物'},
    {kind:'image',name:'图片1',url:'/media/b.png',role:'衣服'},
    {kind:'text',name:'故事',text:'@图片1 不应被替换'}]};
  const c=vm.createContext({DOUBAO_PROFILES:["seedance-2.5-db","seedance-2.0-mini-db","seedance-2.0-fast-db","seedance-2.0-db"],resolvePendingReferences:()=>false,board:()=>({nodes:[n]}),compatibility:()=>'',pending:new Set(),clone:structuredClone,uid:()=> 'submission',boardId:'b',touch(){},saving:false,save:async()=>{},dirty:false,render(){},FormData,
    fetch:async()=>({ok:true,blob:async()=>new Blob(['x'],{type:'image/png'})}),mediaURL:r=>r.url,
    api:async(u,o)=>{form=o.body;return {tasks:[{id:'t'}]};},tasks:[],rebuildTaskIndex(){},toast(){},poll:async()=>{}});
  vm.runInContext(section('function providerReferencePrompt(', 'async function resumeTask('),c);
  await c.submitNodeRequest(n);
  assert.equal(form.get('prompts'),'@图片1 穿着 @图片2 的衣服，保留 @图片10\n故事：@图片1 不应被替换\n图片1：图片2，用途：人物。\n图片2：图片1，用途：衣服。');
  assert.equal(form.getAll('references').length,2);
  n.replay={displayPrompt:n.prompt,refs:structuredClone(n.refs),prompt:'精确重放 @图片2'};
  await c.submitNodeRequest(n);
  assert.equal(form.get('prompts'),'精确重放 @图片2');
});

test('poll recovers results oldest first and does not replace a selection with a late older run', async () => {
  const n={id:'n',versions:[]};
  const task=(id,created)=>({id,board_id:'b',node_id:'n',created_at:created,finished_at:created+10,status:'completed',kind:'image',local_image_url:'/media/'+id+'.png'});
  const tasks=[task('new',2),task('old',1)];
  const c=vm.createContext({api:async()=>({tasks}),doc:{projects:[{boards:[{id:'b',nodes:[n]}]}]},tasksByNode:new Map([['b:n',tasks]]),rebuildTaskIndex(){},clone:structuredClone,resolvePendingReferences:()=>false,touch(){},$:()=>({}),document:{activeElement:{closest:()=>true}}});
  vm.runInContext(section('async function poll()', 'const expandedTasks'),c);
  await c.poll();
  assert.deepEqual(Array.from(n.versions,v=>v.id),['old','new']);assert.equal(n.currentVersion,'new');
  n.currentVersion='old';await c.poll();assert.equal(n.currentVersion,'old');
  tasks.push(task('late',0));await c.poll();assert.equal(n.currentVersion,'old');
});
test('image mentions prioritize connected sources without renumbering images',()=>{
 const nodes=[{id:'a',referenceName:'图片1'},{id:'b',referenceName:'图片2'},{id:'c',referenceName:'图片3'}];
 const b={nodes};const c=vm.createContext({board:()=>b,version:()=>({kind:'image'}),thumb:()=>'/preview'});
 vm.runInContext(section('function imageMentionCandidates(', 'function drawEdges('),c);
 const items=c.imageMentionCandidates({id:'target',refs:[{nodeId:'c'}]});
 assert.equal(items[0].id,'c');assert.equal(items[0].name,'图片3');assert.equal(items[1].id,'a');
});

test('logged-out Doubao submission stops before save or upload', async () => {
  const profiles = ['seedance-2.5-db','seedance-2.0-mini-db','seedance-2.0-fast-db','seedance-2.0-db'];
  const c = vm.createContext({DOUBAO_PROFILES:profiles, DOUBAO_LOGIN_MESSAGE:'请在工具中找到豆包登录工具', api:async url=>{assert.equal(url,'/api/doubao/status');return {ready:false};}});
  vm.runInContext(section('async function submitNodeRequest(', 'async function resumeTask('), c);
  for (const profile of profiles) await assert.rejects(c.submitNodeRequest({profile}), /豆包登录工具/);
});
