import '../rich-prompt.js';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AnimatePresence,motion,MotionConfig,useReducedMotion} from 'motion/react';
import {X,Settings2,Plus,Puzzle,Upload,Check,ArrowLeft,FileText,ChevronDown,History,MessageSquare,ArrowUpRight,Paperclip,CheckCheck} from 'lucide-react';
import {ChatApp} from './components/agents/chat-app';
import {Message,MessageContent,MessageBubble,MessageBubbleContent} from './components/agents/message';
import {MessageScroller} from './components/agents/message-scroller';
import {PromptInput} from './components/agents/prompt-input';
import {StreamingResponse} from './components/agents/streaming-response';
import {AgentActivity,type AgentActivityItem} from './components/agents/agent-activity';
import {LoadingState} from './components/agents/loading-state';
import {InteractiveHoverButton} from './components/ui/interactive-hover-button';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Button} from './components/motion/button';
import {MorphPopover,MorphPopoverContent,MorphPopoverTrigger} from './components/motion/popover-morph';
import {RangeSlider} from './components/motion/range-slider';

const EFFORTS=[{value:'off',label:'关闭'},{value:'low',label:'轻度'},{value:'high',label:'深入'},{value:'max',label:'极致'}] as const;
type Effort=typeof EFFORTS[number]['value'];

type Skill={id:string,name:string,source:string,characters:number};
type Attachment={id:string,name:string,size:number,kind:string};
type Turn={id:string,role:'user'|'assistant',text:string,status?:string,error?:string,skills?:string[],attachments?:Attachment[],activities?:AgentActivityItem[],duration?:number,activity?:string,created_at?:number};
type Page='chat'|'skills'|'settings'|'history'|'install';
type Conversation={session_id:string,title:string,updated_at:number,message_count:number};
const board=new URLSearchParams(location.search).get('board')||'default';
const working=(s?:string)=>s==='starting'||s==='writing';
async function api(path:string,body?:object){
 const r=await fetch('/api/script/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
 const d=await r.json();if(!r.ok||d.error)throw Error(d.error||'请求失败');return d;
}
function AttachmentList({items,onRemove}:{items:Attachment[],onRemove?:(id:string)=>void}){
 return <div className="attachment-list">{items.map(a=><div key={a.id} className="attachment-chip"><FileText size={14}/><span title={a.name}>{a.name}</span>{onRemove?<button aria-label={'移除附件 '+a.name} onClick={()=>onRemove(a.id)} type="button"><X size={12}/></button>:null}</div>)}</div>;
}
function InstallProgress({job}:{job:any}){
 const [progress,setProgress]=useState(0);
 useEffect(()=>{const tick=()=>setProgress(job.status==='completed'?100:Math.min(90,Math.max(0,(Date.now()/1000-job.created_at)*3)));tick();const timer=setInterval(tick,100);return()=>clearInterval(timer);},[job.created_at,job.status]);
 const success=job.status==='completed',failed=job.status==='failed'||job.status==='cancelled';
 return <div className="installer-progress">
  <AnimatePresence mode="wait" initial={false}>
   {success?<motion.div key="success" className="install-success" initial={{opacity:0,scale:.92,y:8}} animate={{opacity:1,scale:1,y:0}} transition={{type:'spring',stiffness:300,damping:24}}><span><CheckCheck size={24}/></span><h3>安装已完成</h3><p>{job.skill?.name}</p></motion.div>:<motion.div key="working" initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}}>{failed?<p className="text-sm text-red-300">{job.error||'已停止安装'}</p>:<LoadingState startedAt={job.created_at*1000} label={progress>=90?'正在完成安装':'正在整理 Skill'}/>}</motion.div>}
  </AnimatePresence>
  <div className="install-track" role="progressbar" aria-label="Skill 安装" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><motion.div animate={{width:progress+'%'}} transition={{duration:success?.4:.1,ease:'linear'}}/></div>
  <div className="flex justify-between text-[10px] text-muted-foreground"><span>{success?'已加入你的 Skills':failed?'原始内容已保留，可以重试':'整理规则 · 准备挂载'}</span><span className="tabular-nums">{Math.floor(progress)}%</span></div>
 </div>;
}
function App(){
 const reduce=useReducedMotion();
 useEffect(()=>{const apply=()=>document.documentElement.dataset.theme=localStorage.getItem('studio-theme')||'dark';apply();const receive=(e:MessageEvent)=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='script-theme')apply();};window.addEventListener('storage',apply);window.addEventListener('message',receive);return()=>{window.removeEventListener('storage',apply);window.removeEventListener('message',receive);};},[]);
 const [page,setPage]=useState<Page>('chat'),[pane,setPane]=useState(0),[turns,setTurns]=useState<Turn[]>([]),[skills,setSkills]=useState<Skill[]>([]),[mounted,setMounted]=useState<string[]>([]);
 const [status,setStatus]=useState<any>({}),[key,setKey]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[prompt,setPrompt]=useState(''),[saving,setSaving]=useState(false);
 const [session,setSession]=useState(''),[fresh,setFresh]=useState(false),[history,setHistory]=useState<Conversation[]>([]),[historyLoading,setHistoryLoading]=useState(false);
 const [boardImages,setBoardImages]=useState<{id:string,name:string,url:string,originalUrl?:string}[]>([]);
 useEffect(()=>{const receive=(e:MessageEvent)=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='script-board-images')setBoardImages(e.data.images||[]);};window.addEventListener('message',receive);const request=()=>parent.postMessage({type:'script-board-images'},location.origin);request();const timer=window.setInterval(request,2000);window.addEventListener('focus',request);return()=>{window.clearInterval(timer);window.removeEventListener('message',receive);window.removeEventListener('focus',request);};},[]);
 const [effort,setEffort]=useState<Effort>('high');
 const [attachments,setAttachments]=useState<Attachment[]>([]),[uploading,setUploading]=useState(false),[installAttachments,setInstallAttachments]=useState<Attachment[]>([]);
 const [installText,setInstallText]=useState(''),[skillName,setSkillName]=useState(''),[installJob,setInstallJob]=useState<any>(null),[installMode,setInstallMode]=useState<'file'|'text'>('file');
 const file=useRef<HTMLInputElement>(null),installFile=useRef<HTMLInputElement>(null),job=useRef(''),stream=useRef<EventSource|null>(null),installStream=useRef<EventSource|null>(null),alive=useRef(true),pendingCancel=useRef(false),installed=useRef(new Set<string>());
 const go=(next:Page)=>{setNotice('');setPage(next);};
 const motionProps={initial:{opacity:0,y:reduce?0:8},animate:{opacity:1,y:0},exit:{opacity:0,y:reduce?0:-5},transition:{duration:reduce?0:.2,ease:[.22,1,.36,1] as const}};
 useEffect(()=>{
  alive.current=true;
  Promise.all([api('status'),api('skills'),api('history/'+encodeURIComponent(board))]).then(([s,k,h])=>{
   if(!alive.current)return;setStatus(s);setSkills(k.skills);loadConversation(h);if(k.active_install)subscribeInstall(k.active_install);
  }).catch(e=>setNotice(e.message));
  return()=>{alive.current=false;stream.current?.close();installStream.current?.close();};
 },[]);
 function loadConversation(h:any){
  stream.current?.close();job.current='';setBusy(false);setSession(h.session_id);setFresh(false);setTurns(h.messages||[]);setMounted(h.mounted_skills||[]);
  setEffort(EFFORTS.some(e=>e.value===h.reasoning_effort)?h.reasoning_effort:'high');
  if(h.active_job){job.current=h.active_job.id;setBusy(true);setTurns(list=>[...list,{...h.active_job,role:'assistant'}]);subscribe(h.active_job.id);}
 }
 function receive(r:any){
  if(!alive.current)return;
  setTurns(list=>list.map(t=>t.id===r.id?{...t,...r,role:'assistant'}:t));
  if(r.settled){setBusy(false);job.current='';stream.current?.close();}
 }
 function subscribe(id:string){
  stream.current?.close();const source=new EventSource('/api/script/events/'+id);stream.current=source;
  source.onmessage=e=>receive(JSON.parse(e.data));
  source.onerror=()=>{if(!alive.current)return;api('jobs/'+id).then(receive).catch(()=>{source.close();setBusy(false);setNotice('连接已中断。已收到的内容保留，请重新打开历史记录。');});};
 }
 function subscribeInstall(initial:any){
  setInstallJob(initial);installStream.current?.close();const source=new EventSource('/api/script/events/'+initial.id);installStream.current=source;
  function receiveInstall(r:any){
   if(!alive.current)return;setInstallJob(r);
   if(r.settled){source.close();if(r.skill&&!installed.current.has(r.id)){installed.current.add(r.id);setSkills(list=>[...list.filter(s=>s.id!==r.skill.id),r.skill]);setMounted(list=>[...new Set([...list,r.skill.id])]);}}
  }
  source.onmessage=e=>receiveInstall(JSON.parse(e.data));
  source.onerror=()=>api('jobs/'+initial.id).then(receiveInstall).catch(()=>{source.close();setInstallJob({...initial,status:'failed',error:'安装连接中断，请查看 Skills 列表后重试'});});
 }
 async function send(value:string){
  if(busy||uploading)return;
  if(!status.configured){go('settings');setNotice('先填写 API Key，即可开始写作');return;}
  const pending='pending-'+Date.now();pendingCancel.current=false;setBusy(true);setNotice('');
  const names=skills.filter(s=>mounted.includes(s.id)).map(s=>s.name);
  setTurns(list=>[...list,{id:pending+'-user',role:'user',text:value,skills:names,attachments},{id:pending,role:'assistant',text:'',status:'starting',created_at:Date.now()/1000}]);
  try{
   const referenced=[];
   for(const image of (window as any).RichPrompt.references(value,boardImages)){
    const url=new URL(image.originalUrl||image.url,location.href);if(url.origin!==location.origin)throw Error('画板图片需要先保存到本地再引用');
    const response=await fetch(url);if(!response.ok)throw Error('引用图片读取失败');
    const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const uploaded=await api('attachments',{filename:image.name+'.png',data:btoa(binary)});referenced.push(uploaded.attachment.id);
   }
   const r=await api('chat',{board_id:board,session_id:fresh?undefined:session||undefined,prompt:value,skills:mounted,reasoning_effort:effort,attachments:[...attachments.map(a=>a.id),...referenced],new_session:fresh});
   setSession(r.session_id);setFresh(false);setPrompt('');setAttachments([]);
   setTurns(list=>list.map(t=>t.id===pending?{...t,...r}:t.id===pending+'-user'?{...t,id:r.id+'-user'}:t));
   job.current=r.id;subscribe(r.id);if(pendingCancel.current)receive(await api('cancel',{id:r.id}));
  }catch(e:any){setTurns(list=>list.map(t=>t.id===pending?{...t,status:'failed',error:e.message}:t));setBusy(false);}
 }
 async function stop(){pendingCancel.current=true;if(job.current)try{receive(await api('cancel',{id:job.current}));}catch(e:any){setNotice(e.message);}}
 function newChat(){if(busy)return;stream.current?.close();setFresh(true);setSession('');setTurns([]);setPrompt('');setAttachments([]);setNotice('');setPage('chat');setPane(x=>x+1);}
 async function showHistory(){go('history');setHistoryLoading(true);try{setHistory((await api('conversations/'+encodeURIComponent(board))).conversations);}catch(e:any){setNotice(e.message);}finally{setHistoryLoading(false);}}
 async function chooseConversation(id:string){if(busy)return;setHistoryLoading(true);try{loadConversation(await api('conversation',{board_id:board,session_id:id}));setPrompt('');setAttachments([]);setPane(x=>x+1);go('chat');}catch(e:any){setNotice(e.message);}finally{setHistoryLoading(false);}}
 const toggleSkill=(id:string)=>setMounted(list=>list.includes(id)?list.filter(x=>x!==id):[...list,id]);
 async function uploadFiles(files:FileList|null,installer=false){
  if(!files?.length)return;const existing=installer?installAttachments:attachments;
  if(existing.length+files.length>6){setNotice('每次最多添加 6 个附件');return;}
  setUploading(true);setNotice('');
  try{for(const f of Array.from(files)){
   if(f.size>20*1024*1024)throw Error('单个附件请控制在 20 MB 以内');
   const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   const r=await api('attachments',{filename:f.name,data:btoa(binary)});
   (installer?setInstallAttachments:setAttachments)(list=>[...list,r.attachment]);
  }}catch(e:any){setNotice(e.message);}finally{setUploading(false);}
 }
 async function install(){
  if(!status.configured){go('settings');setNotice('先填写 API Key，再安装 Skill');return;}
  setNotice('');setInstallJob({id:'pending',status:'starting',created_at:Date.now()/1000});
  try{subscribeInstall(await api('skills',{name:skillName,text:installMode==='text'?installText:'',attachments:installMode==='file'?installAttachments.map(a=>a.id):[]}));}
  catch(e:any){setInstallJob({status:'failed',error:e.message,created_at:Date.now()/1000});}
 }
 const installing=installJob&&working(installJob.status);
 const title={chat:'脚本',history:'历史对话',skills:'写作 Skills',install:'安装 Skill',settings:'连接设置'}[page];
 const subtitle={chat:'DeepSeek Harness',history:'继续之前的故事',skills:'你的写作方法',install:'文件或文字，变成可复用的规则',settings:'仅保存在本机服务端'}[page];
 const iconButton='size-8 shrink-0 rounded-lg';
 return <ChatApp defaultOpen={false} className="script-shell h-dvh rounded-none border-0"><main className="flex min-h-0 w-full flex-col">
  <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
   <div className="flex min-w-0 items-center gap-2">{page!=='chat'?<Button aria-label="返回" size="icon" variant="ghost" className={iconButton} onClick={()=>go(page==='install'?'skills':'chat')}><ArrowLeft size={16}/></Button>:<span className="grid size-8 place-items-center rounded-xl bg-muted"><FileText size={16}/></span>}<div><h1 className="text-sm font-medium">{title}</h1><p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p></div></div>
   <div className="flex gap-0.5">{page==='chat'&&<><Button variant="ghost" size="icon" className={iconButton} aria-label="历史对话" onClick={showHistory}><History size={16}/></Button><Button variant="ghost" size="icon" className={iconButton} aria-label="新对话" disabled={busy} onClick={newChat}><Plus size={16}/></Button><Button variant="ghost" size="icon" className={iconButton} aria-label="连接设置" onClick={()=>go('settings')}><Settings2 size={16}/></Button></>}<Button variant="ghost" size="icon" className={iconButton} aria-label="关闭脚本" onClick={()=>parent.postMessage({type:'script-close'},location.origin)}><X size={16}/></Button></div>
  </header>
  <input ref={file} type="file" multiple hidden onChange={e=>{uploadFiles(e.target.files);e.target.value='';}}/>
  <input ref={installFile} type="file" multiple hidden onChange={e=>{uploadFiles(e.target.files,true);e.target.value='';}}/>
  <AnimatePresence mode="wait" initial={false}>
   <motion.div key={page==='chat'?`chat-${pane}`:page} {...motionProps} className="flex min-h-0 flex-1 flex-col" data-script-page={page}>
   {page==='chat'?<>
    <MessageScroller className="min-h-0 flex-1" contentClassName="gap-6 px-4 py-5" label="脚本对话" busy={busy}>
     {!turns.length?<div className="flex min-h-[280px] flex-col justify-center gap-5 px-2"><span className="text-[10px] tracking-[.16em] text-muted-foreground">MORRITV / SCRIPT</span><div><h2 className="text-2xl font-medium tracking-tight">故事，从这里开始。</h2><p className="mt-3 text-xs leading-6 text-muted-foreground">聊一个想法，写一段剧情。<br/>也可以挂载 Skill，沿用你的写作方法。</p></div><div className="flex flex-wrap gap-2">{['帮我梳理故事大纲','把剧情改成分镜脚本'].map(x=><Button key={x} variant="outline" size="sm" onClick={()=>setPrompt(x)} className="rounded-full text-xs">{x}</Button>)}</div></div>:turns.map(t=><Message key={t.id} from={t.role} aria-label={t.role==='user'?'我的需求':'脚本回复'}><MessageContent className="min-w-0 max-w-full">
      {t.role==='user'?<><MessageBubble><MessageBubbleContent className="whitespace-pre-wrap text-sm leading-6">{t.text||'请参考附件'}</MessageBubbleContent></MessageBubble>{!!t.attachments?.length&&<AttachmentList items={t.attachments}/>} {!!t.skills?.length&&<p className="mt-2 text-right text-[10px] text-muted-foreground">{t.skills.join(' · ')}</p>}</>:<>
       {working(t.status)&&!t.text&&!t.activities?.length?<LoadingState startedAt={(t.created_at||Date.now()/1000)*1000}/>:!!t.activities?.length&&<AgentActivity items={t.activities} contentType="mixed" status={working(t.status)?'working':'complete'} duration={t.duration||0} activeLabel={t.activity||'正在思考'} summary={`${t.status==='cancelled'?'已停止':t.status==='failed'?'执行记录':'思考与执行'} · ${Math.round(t.duration||0)} 秒`} maxHeight={160} collapseOnComplete className="mb-4 text-xs" contentClassName="script-reasoning"/>}
       {t.text&&<StreamingResponse status={t.status==='failed'?'error':working(t.status)?'streaming':'complete'} copyText={t.text} announce={false} contentClassName="script-output"><Markdown remarkPlugins={[remarkGfm]}>{t.text}</Markdown></StreamingResponse>}
       {t.error&&<p role="alert" className="mt-2 text-xs leading-6 text-red-300">{t.error}</p>}{t.status==='cancelled'&&<p className="mt-2 text-xs text-muted-foreground">已停止</p>}
      </>}
     </MessageContent></Message>)}
    </MessageScroller>
    <div className="shrink-0 border-t border-border p-3">
     <div className="mb-2 flex flex-wrap items-center gap-1.5"><Button variant="ghost" size="sm" className="h-7 gap-1.5 rounded-full px-2 text-xs text-muted-foreground" onClick={()=>go('skills')}><Puzzle size={13}/>Skills{mounted.length?` · ${mounted.length}`:''}<ChevronDown size={12}/></Button><AnimatePresence initial={false}>{skills.filter(s=>mounted.includes(s.id)).map(s=><motion.button key={s.id} layout initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.9}} onClick={()=>toggleSkill(s.id)} title="取消挂载" className="flex max-w-40 items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px]"><span className="truncate">{s.name}</span><X size={10}/></motion.button>)}</AnimatePresence></div>
     <PromptInput mentionCandidates={boardImages} value={prompt} onValueChange={setPrompt} placeholder="描述你的故事，或继续修改脚本…" aria-label="脚本需求" leadingAction={<MorphPopover><MorphPopoverTrigger><Button type="button" variant="ghost" disabled={busy} className="effort-trigger h-8 gap-1 rounded-full px-2 text-xs" aria-label="模型与思考强度">DeepSeek Flash <span className="text-muted-foreground">{EFFORTS.find(e=>e.value===effort)?.label}</span><ChevronDown size={12}/></Button></MorphPopoverTrigger><MorphPopoverContent side="top" align="start" sideOffset={10} className="w-72 p-4">     <div className="thinking-control">
      <div className="thinking-heading"><span>思考强度</span><span>{EFFORTS.find(e=>e.value===effort)?.label}</span></div>
      <RangeSlider min={0} max={3} step={1} value={EFFORTS.findIndex(e=>e.value===effort)} onValueChange={v=>setEffort(EFFORTS[v].value)} aria-label="思考强度" formatValueText={v=>EFFORTS[v].label} disabled={busy} className={'thinking-slider '+(effort==='off'?'is-off':'')}/>
      <div className="thinking-labels" aria-hidden="true">{EFFORTS.map(e=><span key={e.value} className={effort===e.value?'is-active':''}>{e.label}</span>)}</div>
     </div>
</MorphPopoverContent></MorphPopover>} defaultModel="deepseek-flash" loading={busy} disabled={uploading} allowEmptySubmit={attachments.length>0} onSubmit={send} onStop={stop} minRows={2} maxRows={5} attachmentSlot={attachments.length?<AttachmentList items={attachments} onRemove={id=>setAttachments(list=>list.filter(a=>a.id!==id))}/>:undefined} actions={[{value:'file',label:'上传附件',description:'添加文件作为本轮参考资料',icon:<Paperclip/>},{value:'skill',label:'挂载 Skill',description:'选择你的写作规则',icon:<Puzzle/>}]} onAction={action=>action==='file'?file.current?.click():go('skills')}/>
     {uploading&&<p className="mt-2 text-[10px] text-muted-foreground">正在读取附件…</p>}
    </div>
   </>:page==='history'?<div className="flex-1 overflow-auto p-4"><Button variant="outline" disabled={busy} onClick={newChat} className="mb-5 w-full gap-2"><Plus size={14}/>新对话</Button>{historyLoading?<LoadingState startedAt={Date.now()} label="正在读取历史"/>:history.length?<div className="grid gap-2">{history.map(h=><button key={h.session_id} className={'history-item '+(h.session_id===session&&!fresh?'is-current':'')} disabled={busy} onClick={()=>chooseConversation(h.session_id)}><MessageSquare size={16}/><span className="min-w-0 flex-1"><strong>{h.title}</strong><small>{new Date(h.updated_at*1000).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})} · {h.message_count} 条消息</small></span><ArrowUpRight size={14}/></button>)}</div>:<div className="empty-small"><History size={24}/><p>还没有历史对话</p><small>开始写作后，对话会自动保存在这里。</small></div>}{busy&&<p className="mt-4 text-xs text-muted-foreground">当前回复完成或停止后，可以切换对话。</p>}</div>
   :page==='settings'?<div className="flex-1 overflow-auto p-5"><div className="mb-7 flex items-center gap-2 text-xs text-muted-foreground"><span className={'size-1.5 rounded-full '+(status.configured?'bg-primary':'bg-neutral-600')}/>{status.configured?`已配置 · 尾号 ${status.suffix}`:'尚未连接'}</div><label className="block text-xs font-medium" htmlFor="api-key">DeepSeek API Key</label><input id="api-key" type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder={status.configured?'输入新 Key 以更换':'sk-…'} className="mt-2 w-full rounded-xl border border-border bg-muted/30 p-3 text-sm outline-none focus:border-foreground/30"/><p className="mt-3 text-xs leading-6 text-muted-foreground">用于 DeepSeek 官方接口。完整 Key 不会回传到页面，也不会写入对话记录。</p><Button variant="secondary" className="mt-5 w-full" disabled={!key.trim()||saving} onClick={async()=>{setSaving(true);try{setStatus(await api('settings',{api_key:key}));setKey('');setNotice('连接设置已保存');}catch(e:any){setNotice(e.message);}finally{setSaving(false);}}}>{saving?'保存中…':'保存连接'}</Button></div>
   :page==='skills'?<div className="flex-1 overflow-auto p-4"><div className="mb-4 flex items-center justify-between"><p className="text-xs text-muted-foreground">选中的 Skill 用于下一轮写作</p><Button size="sm" variant="outline" className="gap-1 text-xs" onClick={()=>go('install')}><Plus size={13}/>安装</Button></div><div className="grid gap-2">{skills.length?skills.map(s=><button key={s.id} className={'skill-row '+(mounted.includes(s.id)?'is-current':'')} aria-pressed={mounted.includes(s.id)} onClick={()=>toggleSkill(s.id)}><Puzzle size={16}/><span><strong>{s.name}</strong><small>{Math.ceil(s.characters/1000)}k 字 · {s.source}</small></span>{mounted.includes(s.id)&&<Check size={15}/>}</button>):<div className="empty-small"><Puzzle size={24}/><p>把写作方法收在这里</p><small>上传文件或粘贴规则，安装你的第一个 Skill。</small><Button className="mt-3" variant="outline" onClick={()=>go('install')}>安装 Skill</Button></div>}</div>{installJob&&<button className="install-status-link" onClick={()=>go('install')}>{installing?'Skill 正在安装…':installJob.status==='completed'?'新的 Skill 已安装':'查看安装状态'}<ArrowUpRight size={13}/></button>}</div>
   :<div className="flex-1 overflow-auto p-5">
    {installJob&&(installing||installJob.status==='completed')?<><InstallProgress job={installJob}/>{installJob.status==='completed'?<Button className="mt-6 w-full" variant="secondary" onClick={()=>{go('skills');setInstallJob(null);setInstallText('');setInstallAttachments([]);setSkillName('');}}>完成，已挂载</Button>:<p className="mt-6 text-xs leading-6 text-muted-foreground">可以返回对话，安装会继续。这个安装会话不会出现在历史记录中。</p>}</>:<>
     <div className="installer-tabs" role="tablist" aria-label="安装方式">{(['file','text'] as const).map(mode=><button key={mode} role="tab" aria-selected={installMode===mode} onClick={()=>setInstallMode(mode)}>{installMode===mode&&<motion.span layoutId="installer-tab" transition={{type:'spring',stiffness:420,damping:35}}/>}<span>{mode==='file'?'上传文件':'粘贴文本'}</span></button>)}</div>
     <AnimatePresence mode="wait" initial={false}><motion.div key={installMode} {...motionProps}>
      {installMode==='file'?<><button className="skill-dropzone" disabled={uploading} onClick={()=>installFile.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!uploading)uploadFiles(e.dataTransfer.files,true);}}><Upload size={22}/><strong>{uploading?'正在读取文件…':'选择文件或拖到这里'}</strong><span>文档、图片、压缩包或其他写作资料</span><small>每个文件最大 20 MB</small></button><AttachmentList items={installAttachments} onRemove={id=>setInstallAttachments(list=>list.filter(a=>a.id!==id))}/></>:<textarea className="skill-paste" aria-label="Skill 内容" placeholder="粘贴你的写作规则、工作方法，或完整的 Skill…" value={installText} onChange={e=>setInstallText(e.target.value)}/>}
     </motion.div></AnimatePresence>
     <input aria-label="Skill 名称" className="skill-input mt-4" placeholder="名称（选填，留空自动命名）" value={skillName} onChange={e=>setSkillName(e.target.value)}/>
     <p className="my-4 text-xs leading-6 text-muted-foreground">交给 DeepSeek 整理成可挂载的 Skill，保留你的规则与方法。</p>
     {installJob?.error&&<p role="alert" className="mb-4 text-xs text-red-300">{installJob.error}</p>}
     <InteractiveHoverButton className="w-full" disabled={uploading||!(installMode==='text'?installText.trim():installAttachments.length)} onClick={install}>安装 Skill</InteractiveHoverButton>
    </>}
   </div>}
   </motion.div>
  </AnimatePresence>
  <AnimatePresence>{notice&&<motion.div key={notice} initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} role="status" className="shrink-0 border-t border-border"><p className="px-4 py-2 text-xs leading-5 text-muted-foreground">{notice}</p></motion.div>}</AnimatePresence>
 </main></ChatApp>;
}
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><App/></MotionConfig>);
