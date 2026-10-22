"""Isolated official DeepSeek Harness worker; stdout is NDJSON for the studio."""
import json, os, signal, sys
from pathlib import Path
from deepseek_harness import DeepSeekHarness
from script_events import ScriptEvents
from script_files import prompt_blocks

def emit(**data):
    print(json.dumps(data,ensure_ascii=False),flush=True)

def main():
    payload=json.load(sys.stdin)
    root=Path(__file__).resolve().parent
    home=root/'script-data'/'harness'
    workspace=root/'script-data'/'workspaces'/payload['session_id'];workspace.mkdir(parents=True,exist_ok=True)
    patch=workspace/'script.patch.json'
    rows=[{'id':'skill-filesystem','config':{'includeDefaultRoots':False,'watch':False,'customSkillDirs':payload['skill_dirs']}},
          {'insert':[{'id':'script-stream','name':str(root/'script-stream-plugin.mjs')}]}]
    patch.write_text(json.dumps(rows,ensure_ascii=False))
    harness=DeepSeekHarness(profile='sdk',dsh_home=str(home),cwd=str(workspace),patches=(str(patch),),api_key=os.environ['DEEPSEEK_API_KEY'],model=payload.get('model','deepseek-flash'),reasoning_effort=payload.get('reasoning_effort','high'),request_timeout_seconds=None,initialize_timeout_seconds=60)
    def stop(*_):
        harness.close();sys.exit(0)
    signal.signal(signal.SIGTERM,stop)
    try:
        with harness:
            emit(status='writing',activity='正在整理 Skill' if payload.get('mode')=='install' else '正在构思脚本')
            marker=workspace/'started'
            session=harness.resume_session(payload['session_id']) if marker.exists() else harness.start_session(payload['session_id'])
            prompt=payload['prompt']
            events=ScriptEvents(emit,payload.get('skill_labels'))
            blocks=prompt_blocks(prompt,payload.get('attachments',[]),root/'script-data'/'attachments')
            def observe(notification):
                if notification.method=='session.event':marker.touch()
                events.observe(notification)
            result=session.run(blocks,on_notification=observe)
            marker.touch()
            if not result.final_response or result.finish_reason=='error':
                emit(status='failed',error='DeepSeek 未完成本次写作，请检查连接设置后重试。')
            elif result.finish_reason in {'length','max_tokens','max_output_tokens'}:
                emit(**{**events.snapshot(),'status':'failed','text':result.final_response,'error':'模型达到单次输出上限，已保留内容；请发送“从中断处继续”。','activity':'输出未完成'})
            else:emit(**{**events.snapshot(),'status':'completed','text':result.final_response,'activity':'已完成'})
    except Exception as e:
        # SDK diagnostics may contain provider headers; never send them to the browser.
        message=str(e).lower()
        error='API Key 无效或无权使用所选模型' if ('401' in message or 'authentication' in message) else '账户余额不足' if '402' in message else 'DeepSeek 连接失败或超时，请检查 API Key 后重试'
        emit(status='failed',error=error)

if __name__=='__main__': main()
