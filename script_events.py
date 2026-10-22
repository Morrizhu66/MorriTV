"""Project Harness live deltas into response text and BeUI activity entries."""
import json
import time


class ScriptEvents:
    def __init__(self, emit, skill_labels=None):
        self.emit = emit
        self.skill_labels = skill_labels or {}
        self.text = ''
        self.items = {}
        self.started = time.monotonic()
        self.activity = '正在连接 DeepSeek'

    def snapshot(self):
        return dict(text=self.text, activities=list(self.items.values()),
                    duration=round(time.monotonic()-self.started, 1), activity=self.activity)

    def observe(self, notification):
        payload = notification.payload
        if notification.method == 'morri.stream':
            kind = payload.get('type')
            if kind == 'start':
                if self.text:
                    ident = 'message-'+str(payload['requestId'])
                    self.items[ident] = dict(id=ident, type='trace', kind='message', label='写作说明', detail=self.text)
                self.text = ''
                self.activity = '正在思考'
            elif kind == 'text-delta':
                self.text += payload.get('text', '')
                self.activity = '正在撰写脚本'
            elif kind == 'reasoning-delta':
                ident = 'reasoning-{}-{}'.format(payload['requestId'], payload.get('index', 0))
                item = self.items.setdefault(ident, dict(id=ident, type='text', content=''))
                item['content'] += payload.get('text', '')
                self.activity = '正在思考'
            else:
                return
        elif notification.method == 'session.event':
            event = payload.get('event', {})
            kind, data = event.get('type'), event.get('data', {})
            if kind == 'tool/call':
                ident = 'tool-'+data['callId']
                try:
                    args = json.loads(data.get('arguments', '{}'))
                except (ValueError, TypeError):
                    args = {}
                skill = args.get('name', '')
                label = self.skill_labels.get(skill, skill) if data.get('name') == 'skill' else data.get('name', '工具')
                self.items[ident] = dict(id=ident, type='trace', kind='read', label='读取 Skill', detail=label)
                self.activity = '正在读取写作 Skill'
            elif kind == 'tool/result':
                message = data.get('message', {})
                item = self.items.get('tool-'+message.get('toolCallId', ''))
                if not item:
                    return
                item['label'] = 'Skill 读取失败' if message.get('isError') else '已读取 Skill'
            elif kind == 'assistant/message':
                message = data.get('message', data)
                self.text = ''.join(block.get('text', '') for block in message.get('content', []) if block.get('type') == 'text')
            else:
                return
        else:
            return
        self.emit(**self.snapshot())
