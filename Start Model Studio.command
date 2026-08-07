#!/bin/zsh
set -e
cd "$(dirname "$0")"

if [[ ! -x .venv/bin/python3 ]]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python3 -c 'import tos' >/dev/null 2>&1; then
  echo "首次启动：正在安装 TOS 依赖……"
  .venv/bin/python3 -m pip install -r requirements.txt
fi

# Restart a previous Model Studio instance so code updates take effect.
# Refuse to touch the port if it belongs to another local app.
if curl -fsSI --max-time 1 http://127.0.0.1:4178/api/health 2>/dev/null | grep -q 'Server: ModelStudio'; then
  existing_pid=$(lsof -tiTCP:4178 -sTCP:LISTEN | head -n 1)
  if [[ -n "$existing_pid" ]]; then
    kill "$existing_pid"
    sleep 0.4
  fi
elif curl -fsS --max-time 1 http://127.0.0.1:4178/api/health >/dev/null 2>&1; then
  echo "4178 端口正被另一项本地服务使用，未启动 Model Studio。"
  exit 1
fi

nohup .venv/bin/python3 server.py >> model-studio.log 2>&1 < /dev/null &
server_pid=$!

for _ in {1..20}; do
  if curl -fsS --max-time 1 http://127.0.0.1:4178/api/health >/dev/null 2>&1; then
    open http://127.0.0.1:4178
    exit 0
  fi
  sleep 0.25
done

echo "Model Studio 启动失败。请查看：$(pwd)/model-studio.log"
kill "$server_pid" 2>/dev/null || true
exit 1
