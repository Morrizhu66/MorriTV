"""Compatibility with existing native Harness session stores."""
def session_storage_patch(home):
    # sdk-minimal wrote plain JSONL. The standard SDK defaults to zstd and
    # refuses an entire store containing the other encoding, even for new chats.
    # Keep existing stores readable; fresh installations retain SDK defaults.
    if any((home / 'sessions').rglob('session.v*.jsonl')):
        return [{'id': 'session-persistence-jsonl', 'config': {'root': str(home / 'sessions'), 'compression': 'none'}}]
    return []

def worker_error(exc):
    message = str(exc).lower()
    if 'compression' in message and 'session' in message:
        return '原生会话存储格式不兼容，历史记录已保留，请检查服务端会话配置'
    if '401' in message or 'authentication' in message:
        return 'API Key 无效或无权使用所选模型'
    if '402' in message:
        return '账户余额不足'
    if 'timeout' in message or 'timed out' in message:
        return 'DeepSeek 请求超时，请稍后重试'
    if 'connect' in message or 'fetch failed' in message:
        return '无法连接 DeepSeek，请检查网络后重试'
    return '脚本服务执行失败（' + type(exc).__name__ + '），请检查服务端运行配置'
