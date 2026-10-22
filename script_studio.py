"""Script writer persistence, skill installation and official Harness orchestration."""
import base64, io, json, os, re, signal, shutil, subprocess, threading, time, uuid, zipfile
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen, Request
import xml.etree.ElementTree as ET
import script_files

ROOT=Path(__file__).resolve().parent
DATA=ROOT/'script-data'
LOCK=threading.RLock()
JOBS={}
PROCESSES={}

def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,ensure_ascii=False));temp.chmod(0o600);temp.replace(path)

def read_json(path,default):
    return json.loads(path.read_text()) if path.exists() else default

def credentials(read_env):
    return read_json(DATA/'connection.json',{}).get('api_key') or read_env('DEEPSEEK_API_KEY')

def connection(read_env):
    key=credentials(read_env)
    return {'configured':bool(key),'suffix':key[-4:] if key else '', 'runtime_ready':(ROOT/'.script-venv/bin/python').exists(),'model':'deepseek-flash'}

def save_connection(payload,read_env):
    key=str(payload.get('api_key','')).strip()
    if not key or len(key)>512 or '\n' in key: raise ValueError('请填写有效的 API Key')
    with LOCK:write_json(DATA/'connection.json',{'api_key':key})
    return connection(read_env)

def skills():
    with LOCK:return read_json(DATA/'skills.json',[])

def decode_document(name,data):
    if len(data)>5*1024*1024:raise ValueError('Skill 文件请小于 5 MB')
    suffix=Path(name).suffix.lower()
    if suffix in {'.md','.txt'}:text=data.decode('utf-8-sig')
    elif suffix=='.docx':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            info=archive.getinfo('word/document.xml')
            if info.file_size>8*1024*1024:raise ValueError('文档内容过大')
            xml=ET.fromstring(archive.read(info))
            ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            text='\n'.join(''.join(p.itertext()) for p in xml.findall('.//w:p',ns))
    elif suffix=='.doc':
        result=subprocess.run(['/usr/bin/textutil','-convert','txt','-stdin','-stdout','-format','doc'],input=data,capture_output=True,timeout=20)
        if result.returncode:raise ValueError('无法读取此 Word 文档，请另存为 .docx 后上传')
        text=result.stdout.decode('utf-8')
    else:raise ValueError('支持 .md、.txt、.doc 和 .docx')
    if not text.strip() or len(text)>100000:raise ValueError('Skill 内容为空或超过 10 万字')
    return text

def install_skill(payload):
    name=str(payload.get('name') or '写作 Skill')[:100]
    if payload.get('url'):
        url=str(payload['url']);parsed=urlparse(url)
        if parsed.scheme!='https' or parsed.hostname not in {'github.com','raw.githubusercontent.com'}:raise ValueError('请输入 GitHub 的 SKILL.md 文件链接')
        if parsed.hostname=='github.com':
            parts=parsed.path.strip('/').split('/')
            if len(parts)<5 or parts[2]!='blob':raise ValueError('请打开 GitHub 的 SKILL.md 文件，再复制该文件链接')
            url='https://raw.githubusercontent.com/'+ '/'.join(parts[:2]+parts[3:])
        if not urlparse(url).path.lower().endswith('.md'):raise ValueError('安装链接必须指向 Markdown Skill 文件')
        with urlopen(Request(url,headers={'User-Agent':'Morri-Script-Studio'}),timeout=25) as response:
            if urlparse(response.url).hostname not in {'github.com','raw.githubusercontent.com'}:raise ValueError('不支持此跳转地址')
            data=response.read(5*1024*1024+1)
        text=decode_document('SKILL.md',data);source='GitHub'
    else:
        try:data=base64.b64decode(payload.get('data',''),validate=True)
        except Exception:raise ValueError('上传内容无效')
        text=decode_document(str(payload.get('filename','')),data);source=str(payload.get('filename','上传文档'))[:180]
    ident='skill-'+uuid.uuid4().hex[:12]
    match=re.search(r'^name:\s*[\'"]?([^\n\'"]+)',text,re.M)
    if name=='写作 Skill' and match:name=match.group(1).strip()[:100]
    # Normalize frontmatter while retaining the imported body as authored instructions.
    body=re.sub(r'^---\s*\n.*?\n---\s*\n','',text,count=1,flags=re.S)
    path=DATA/'skills'/ident/'SKILL.md';path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text('---\nname: '+ident+'\ndescription: '+json.dumps(name,ensure_ascii=False)+'\n---\n\n'+body)
    item={'id':ident,'name':name,'source':source,'characters':len(body),'created_at':time.time()}
    with LOCK:
        items=skills();items.append(item);write_json(DATA/'skills.json',items)
    return item

def valid_id(value):
    if not isinstance(value,str) or not re.fullmatch(r'[\w-]{1,100}',value):raise ValueError('会话或画板标识无效')
    return value

def save_chat(board,state):
    state.pop('active_job',None)
    state['updated_at']=time.time()
    write_json(DATA/'conversations'/board/(state['session_id']+'.json'),state)

def history(board,session_id=None):
    valid_id(board)
    with LOCK:
        legacy=DATA/'chats'/f'{board}.json'
        pointer=DATA/'chat-pointers'/f'{board}.json'
        if legacy.exists() and not pointer.exists():
            old=read_json(legacy,{})
            old.setdefault('created_at',legacy.stat().st_mtime)
            save_chat(board,old)
            write_json(pointer,{'session_id':old['session_id']})
        selected=session_id or read_json(pointer,{}).get('session_id')
        state=read_json(DATA/'conversations'/board/(valid_id(selected)+'.json'),{}) if selected else {}
        if session_id and not state:raise ValueError('会话不存在')
        if not state:
            state={'session_id':'script-'+uuid.uuid4().hex,'messages':[],'created_at':time.time()}
            save_chat(board,state)
            write_json(pointer,{'session_id':state['session_id']})
        state['active_job']=next((dict(j) for j in JOBS.values() if j.get('mode','chat')=='chat' and j.get('session_id')==state['session_id'] and not j.get('settled',True)),None)
        return state

def conversations(board):
    history(board) # migrate the last conversation without deleting the original
    with LOCK:
        result=[]
        for path in (DATA/'conversations'/valid_id(board)).glob('*.json'):
            state=read_json(path,{})
            first=next((m for m in state.get('messages',[]) if m['role']=='user'),None)
            if not first:continue
            result.append({'session_id':state['session_id'],'title':first['text'][:60] or '附件对话','updated_at':state.get('updated_at',0),'message_count':len(state['messages'])})
        return sorted(result,key=lambda x:x['updated_at'],reverse=True)

def select_conversation(payload):
    board=valid_id(payload.get('board_id'))
    state=history(board,valid_id(payload.get('session_id')))
    with LOCK:write_json(DATA/'chat-pointers'/f'{board}.json',{'session_id':state['session_id']})
    return state

def upload_attachment(payload):
    return script_files.ingest(payload,DATA/'attachments')

def start(payload,read_env):
    key=credentials(read_env)
    if not key:raise ValueError('请先在连接设置中填写 API Key')
    board=valid_id(payload.get('board_id',''))
    prompt=str(payload.get('prompt','')).strip()
    attachments=script_files.load(payload.get('attachments',[]),DATA/'attachments')
    if (not prompt and not attachments) or len(prompt)>30000:raise ValueError('请输入不超过 3 万字的写作需求，或添加附件')
    wanted=payload.get('skills',[])
    if not isinstance(wanted,list) or len(wanted)>12:raise ValueError('每次最多挂载 12 个 Skill')
    selected=[s for s in skills() if s['id'] in wanted]
    if len(selected)!=len(set(wanted)):raise ValueError('部分 Skill 已不可用，请重新选择')
    with LOCK:
        state=history(board,payload.get('session_id'))
        if payload.get('new_session'):state={'session_id':'script-'+uuid.uuid4().hex,'messages':[],'created_at':time.time()}
        effort=payload.get('reasoning_effort',state.get('reasoning_effort','high'))
        if effort not in ('off','low','high','max'):raise ValueError('请选择有效的思考强度')
        if any(j.get('session_id')==state['session_id'] and not j.get('settled',True) for j in JOBS.values()):raise ValueError('当前对话正在处理，请稍后再试')
        ident=uuid.uuid4().hex
        job={'id':ident,'board_id':board,'mode':'chat','session_id':state['session_id'],'status':'starting','text':'','activity':'正在连接 DeepSeek','activities':[],'duration':0,'created_at':time.time(),'settled':False,'skills':[s['name'] for s in selected]}
        JOBS[ident]=job
        job['reasoning_effort']=effort
        state['reasoning_effort']=effort
        state['mounted_skills']=wanted
        state['messages'].append({'id':ident+'-user','role':'user','text':prompt,'skills':job['skills'],'attachments':[{k:v for k,v in i.items() if k!='text'} for i in attachments]})
        save_chat(board,state)
        write_json(DATA/'chat-pointers'/f'{board}.json',{'session_id':state['session_id']})
    threading.Thread(target=run,args=(job,state,prompt,selected,key,attachments),daemon=True).start()
    return dict(job)

def start_install(payload,read_env):
    key=credentials(read_env)
    if not key:raise ValueError('请先在连接设置中填写 API Key')
    text=str(payload.get('text','')).strip()
    attachments=script_files.load(payload.get('attachments',[]),DATA/'attachments')
    if not text and not attachments:raise ValueError('请上传文件或粘贴 Skill 内容')
    if len(text)>150000:raise ValueError('内容超过 15 万字，请精简后安装')
    with LOCK:
        if any(j.get('mode')=='install' and not j.get('settled',True) for j in JOBS.values()):raise ValueError('已有 Skill 正在安装，请等待完成')
        ident=uuid.uuid4().hex
        job={'id':ident,'mode':'install','session_id':'install-'+ident,'status':'starting','text':'','activity':'正在整理 Skill','created_at':time.time(),'settled':False}
        JOBS[ident]=job
    prompt='帮我安装这个skill。'+('\n用户指定名称：'+str(payload['name'])[:100] if payload.get('name') else '')+'\n\n'+text
    threading.Thread(target=run,args=(job,{'session_id':job['session_id']},prompt,[],key,attachments),daemon=True).start()
    return dict(job)

def register_native_skill(destination):
    folder=Path(destination)
    path=folder/'SKILL.md'
    if not path.is_file() or path.is_symlink():raise ValueError('DSH 未写入 SKILL.md，安装未完成')
    text=path.read_text(encoding='utf-8')
    match=re.search(r'^name:\s*[\'"]?([^\n\'"]+)',text,re.M)
    if not text.startswith('---') or not match:raise ValueError('DSH 写入的 SKILL.md 缺少有效的名称和 frontmatter')
    item={'id':folder.name,'name':match.group(1).strip(),'source':'DSH 原生安装','characters':len(text),'created_at':time.time()}
    with LOCK:
        items=skills();items.append(item);write_json(DATA/'skills.json',items)
    return item

def finish_install(text,attachments):
    cleaned=re.sub(r'^```(?:json)?\s*|\s*```$','',text.strip())
    try:data=json.loads(cleaned)
    except ValueError:raise ValueError('Skill 格式整理失败，请重试')
    name,body=data.get('name'),data.get('body')
    if not isinstance(name,str) or not name.strip() or not isinstance(body,str) or len(body.strip())<20:raise ValueError('未得到有效的 Skill 内容，请补充具体规则后重试')
    item=install_skill({'name':name[:100],'filename':'SKILL.md','data':base64.b64encode(body.encode()).decode()})
    resources=DATA/'skills'/item['id']/'resources'
    if attachments:
        resources.mkdir()
        for i,attachment in enumerate(attachments):
            shutil.copyfile(DATA/'attachments'/attachment['id']/'original',resources/(str(i+1)+'-'+attachment['name']))
    return item

def run(job,state,prompt,selected,key,attachments=None):
    process=None;terminal='failed';attachments=attachments or []
    try:
        with LOCK:
            if job['status']=='cancelled':return
        mounted=DATA/'mounts'/job['id'];mounted.mkdir(parents=True,exist_ok=True)
        if job.get('mode')=='install':
            destination=DATA/'skills'/('skill-'+job['id'])
            destination.mkdir(parents=True,exist_ok=True)
            inputs=DATA/'workspaces'/state['session_id']/'inputs';inputs.mkdir(parents=True,exist_ok=True)
            files=[]
            for i,attachment in enumerate(attachments):
                target=inputs/(str(i+1)+'-'+Path(attachment['name']).name)
                shutil.copyfile(DATA/'attachments'/attachment['id']/'original',target);files.append(str(target))
            prompt += '\n\n请使用原生工具实际安装到此目录：'+str(destination)+'。创建完整 SKILL.md，相关资源放在该目录中。原始附件路径：'+json.dumps(files,ensure_ascii=False)

        for skill in selected:shutil.copytree(DATA/'skills'/skill['id'],mounted/skill['id'])
        env={k:v for k,v in os.environ.items() if not any(x in k.upper() for x in ['KEY','TOKEN','SECRET','PASSWORD'])}
        env['DEEPSEEK_API_KEY']=key
        process=subprocess.Popen([str(ROOT/'.script-venv/bin/python'),str(ROOT/'script_worker.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,env=env,start_new_session=True)
        with LOCK:
            PROCESSES[job['id']]=process
            if job['status']=='cancelled':process.terminate()
        process.stdin.write(json.dumps({'session_id':state['session_id'],'mode':job.get('mode','chat'),'reasoning_effort':job.get('reasoning_effort','high'),'prompt':prompt,'attachments':attachments,'skill_dirs':[str(mounted)],'skill_names':[s['id'] for s in selected],'skill_labels':{s['id']:s['name'] for s in selected}}))
        process.stdin.close()
        for line in process.stdout:
            try:change=json.loads(line)
            except ValueError:continue
            with LOCK:
                if change.get('status') in {'completed','failed'}:terminal=change.pop('status')
                if job['status']!='cancelled':job.update({k:v for k,v in change.items() if k in {'text','status','activity','error','activities','duration'}})
        process.wait(timeout=10)
        with LOCK:
            if terminal=='failed' and not job.get('error') and job['status']!='cancelled':job['error']='脚本服务启动失败或等待超时，请重试'
            if terminal=='completed' and job.get('mode')=='install' and job['status']!='cancelled':
                job['skill']=register_native_skill(destination)
                job['text']='';job['activities']=[]
    except ValueError as exc:
        terminal='failed'
        with LOCK:job['error']=str(exc)
    except Exception:
        terminal='failed'
        with LOCK:
            if job['status']!='cancelled':job.update(error='脚本服务暂不可用，请检查连接设置')
    finally:
        if process and process.poll() is None:process.terminate()
        with LOCK:
            PROCESSES.pop(job['id'],None)
            if job['status']!='cancelled':job['status']=terminal
            if job.get('mode','chat')=='chat':
                state['messages'].append({'id':job['id'],'role':'assistant','text':job['text'],'status':job['status'],'error':job.get('error',''),'activities':job.get('activities',[]),'duration':job.get('duration',0)})
                save_chat(job['board_id'],state)
            job['settled']=True

def event_stream(ident):
    """Reconnectable snapshots: live text survives dropped browser connections."""
    previous=None
    while True:
        with LOCK:
            job=JOBS.get(ident)
            if job is None:return
            encoded=json.dumps(job,ensure_ascii=False)
            done=job.get('settled',False)
        if encoded!=previous:
            yield ('data: '+encoded+'\n\n').encode('utf-8')
            previous=encoded
        if done:return
        time.sleep(.06)

def cancel(ident):
    with LOCK:
        if ident not in JOBS:raise ValueError('任务不存在')
        job=JOBS[ident]
        if job['status'] in {'starting','writing'}:
            job['status']='cancelled';job['activity']='已停止'
            process=PROCESSES.get(ident)
            if process and process.poll() is None:process.terminate()
        return dict(job)
