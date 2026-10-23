"""Local, visible Chrome driver for the dedicated Doubao video conversation.

Run with --login once. Normal invocation reads one bridge request from stdin.
A durable pending record prevents duplicate submissions after a crash/timeout.
"""
import argparse
import fcntl
import json
import re
import sys
import time
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent / '.doubao-web'
HOME = 'https://www.doubao.com/chat/'
BUSY = '当前已有生视频任务进行中，请等结束后再试'


def save(name, value):
    temporary = ROOT / (name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False))
    temporary.replace(ROOT / name)


def read(name, default=None):
    path = ROOT / name
    return json.loads(path.read_text()) if path.exists() else default


@contextmanager
def exclusive():
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (ROOT / 'driver.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError(BUSY)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def configure(page):
    model = page.get_by_test_id('chat_input_action_model')
    try:
        model.wait_for(timeout=20000)
    except Exception as exc:
        (ROOT / "ready").unlink(missing_ok=True)
        raise RuntimeError("请在工具中找到豆包登录工具，登录豆包账号后再生成") from exc
    if 'Lite' not in model.inner_text():
        model.click()
        page.get_by_role('menuitem', name=re.compile(r'^豆包 2\.1 Lite')).click()
    if not model.inner_text().strip().endswith('低'):
        model.click()
        page.get_by_role('menuitem', name=re.compile(r'^推理强度')).click()
        page.get_by_role('menuitem', name='低', exact=True).click()
        page.keyboard.press('Escape')
    text = model.inner_text()
    if '豆包 2.1 Lite' not in text or not text.strip().endswith('低'):
        raise RuntimeError('豆包未能切换到 Lite / 低，请检查网页版模型权限')


def preflight(page):
    configure(page)
    page.get_by_test_id('general-agent-skill-button').click()
    available = page.get_by_role('button', name=re.compile(r'^创意视频 '))
    try:
        available.wait_for(timeout=5000)
    except Exception:
        raise RuntimeError('当前豆包工作没有生视频工具')
    finally:
        page.keyboard.press('Escape')


def response_id(page):
    responses = page.get_by_test_id('receive_message')
    if not responses.count():
        return ''
    return responses.last.get_by_test_id('message_content').get_attribute('data-message-id') or ''


def submit(page, request):
    preflight(page)
    editor = page.locator('[contenteditable="true"]')
    if editor.inner_text().strip():
        raise RuntimeError('豆包专用会话有未发送的内容，请先处理后重试')
    # Sequential upload completion avoids network speed changing reference order.
    for ref in request['references']:
        page.get_by_test_id('upload_file_button').click()
        with page.expect_file_chooser() as chooser:
            page.get_by_role('option', name='上传文件或图片', exact=True).click()
        chooser.value.set_files(ref['path'])
        page.get_by_role('button', name=Path(ref['path']).name, exact=True).wait_for(timeout=90000)
    editor.fill(request['prompt'])
    old_id = response_id(page)
    old_count = page.get_by_test_id('receive_message').count()
    pending = {'task_id': request['task_id'], 'url': page.url,
               'old_id': old_id, 'old_count': old_count, 'submitted_at': time.time()}
    # Commit before clicking: an uncertain send must never automatically retry.
    save('pending.json', pending)
    page.get_by_test_id('chat_input_send_button').click()
    page.wait_for_url(re.compile(r'https://www\.doubao\.com/chat/\d+'), timeout=30000)
    pending['url'] = page.url
    save('session.json', {'url': page.url})
    save('pending.json', pending)
    return pending


def collect(page, pending):
    deadline = time.monotonic() + 1800
    new_response = False
    tool_seen = False
    terminal_since = None
    while time.monotonic() < deadline:
        responses = page.get_by_test_id('receive_message')
        if responses.count():
            current_id = response_id(page)
            new_response = new_response or responses.count() > pending['old_count'] or bool(current_id and current_id != pending['old_id'])
        if not new_response:
            page.wait_for_timeout(1000)
            continue
        answer = responses.last
        text = answer.inner_text()
        tool_seen = tool_seen or bool(re.search(r'doubao[- ]creative[- ]video', text))
        active = page.get_by_test_id('chat_input_local_break_button').count() > 0
        video = answer.locator('video')
        if not active and '共用时' in text:
            terminal_since = terminal_since or time.monotonic()
            steps = answer.get_by_role('button', name=re.compile(r'^共用时'))
            if steps.count() and steps.get_attribute('aria-expanded') != 'true':
                steps.click()
            # Reused sessions need not reread the skill. The generation step is
            # the visible tool result; the accompanying video is mandatory.
            step_text = ' '.join(answer.locator('[data-thinking-box="step-message"]').all_inner_texts())
            tool_seen = tool_seen or '已生成视频' in step_text or '正在生成视频' in step_text
        video_card = answer.locator('[data-video-conner-tag="true"]')
        if (video.count() or video_card.count()) and not active:
            if not tool_seen:
                raise RuntimeError('豆包没有按要求直接生视频，请重试')
            output = ROOT / (pending['task_id'] + '.mp4')
            # Use the site's own download action so signed URL/redirect/referrer
            # behavior stays with Chrome, just as with a manual download.
            answer.locator('[class*="block-video-"]').hover()
            download_button = answer.get_by_test_id('edit_image_hover_tag_download_btn')
            with page.expect_download(timeout=120000) as downloading:
                download_button.click()
            downloading.value.save_as(str(output))
            with output.open('rb') as downloaded:
                header = downloaded.read(12)
            if len(header) < 12 or header[4:8] != b'ftyp':
                raise RuntimeError('豆包没有返回有效 MP4 视频，请重试')
            page.screenshot(path=str(ROOT / 'last-result.png'))
            (ROOT / 'pending.json').unlink()
            return {'status': 'completed', 'tool': 'doubao-creative-video', 'video_file': str(output)}
        if terminal_since and time.monotonic() - terminal_since > 30 and not video.count() and not video_card.count():
            # A completed answer with no video is a terminal failure, not a retry.
            if not tool_seen:
                (ROOT / 'pending.json').unlink()
            raise RuntimeError('豆包没有返回可下载视频，可继续查询原任务：' + text[-200:])
        page.wait_for_timeout(2000)
    raise RuntimeError('生成超时；豆包任务可能仍在运行，请恢复原任务后再生成')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--login', action='store_true')
    parser.add_argument('--recover', action='store_true')
    parser.add_argument('--task-id')
    args = parser.parse_args()
    from playwright.sync_api import sync_playwright
    with exclusive(), sync_playwright() as playwright:
        pending = read('pending.json')
        if pending and not (args.recover or args.login):
            raise RuntimeError(BUSY + '；上次连接中断，请先恢复原任务')
        if args.recover and pending and args.task_id and pending['task_id'] != args.task_id:
            raise RuntimeError('待恢复的豆包任务不匹配')
        if args.recover and not pending:
            raise RuntimeError('没有待恢复的豆包任务')
        context = playwright.chromium.launch_persistent_context(
            str(ROOT / 'profile'), channel='chrome', headless=False,
            chromium_sandbox=True, accept_downloads=True)
        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.set_default_timeout(20000)
            url = HOME if args.login else (pending['url'] if args.recover else read('session.json', {'url': HOME})['url'])
            if not re.fullmatch(r'https://www\.doubao\.com/chat/(?:\d+)?', url):
                raise RuntimeError('豆包会话地址无效')
            page.goto(url, wait_until='domcontentloaded')
            if args.login:
                (ROOT / "ready").unlink(missing_ok=True)
                page.get_by_test_id('general-agent-skill-button').wait_for(timeout=600000)
                preflight(page)
                (ROOT / 'ready').write_text('ready\n')
                return {'status': 'ready'}
            if not (ROOT / 'ready').is_file():
                raise RuntimeError('请先运行豆包网页登录设置并完成登录')
            if not args.recover:
                request = json.load(sys.stdin)
                if not re.fullmatch(r'[a-zA-Z0-9_-]+', request.get('task_id', '')):
                    raise RuntimeError('生成任务标识无效')
                pending = submit(page, request)
            return collect(page, pending)
        except Exception as exc:
            (ROOT / 'last-error.txt').write_text(str(exc))
            try:
                page.screenshot(path=str(ROOT / 'last-error.png'))
            except Exception:
                pass
            raise
        finally:
            context.close()


if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=False))
    except ImportError:
        print(json.dumps({'status': 'failed', 'error': '请先安装豆包网页连接器依赖：pip install -r requirements-doubao.txt'}, ensure_ascii=False))
        sys.exit(1)
    except Exception as exc:
        message = str(exc)[:300]
        if type(exc).__module__.startswith('playwright'):
            message = '豆包网页操作超时或连接中断，请打开专用会话检查后继续查询'
        print(json.dumps({'status': 'failed', 'error': message}, ensure_ascii=False))
        sys.exit(1)
