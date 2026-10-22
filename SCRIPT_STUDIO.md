# 脚本编写器

画板底部「脚本」打开右侧面板。右上角「连接设置」填写 DeepSeek 官方 API Key。
Key 只存本机 `script-data/connection.json`（0600）；也支持 `.env` 中的 DEEPSEEK_API_KEY。浏览器仅接收已配置状态和末四位。

## 安装 / 重建

主服务继续使用现有 Python 环境。Harness 单独需要 Python 3.12+：

```sh
python3.12 -m venv .script-venv
.script-venv/bin/pip install -r requirements-script.txt
cd frontend
npm ci
npm run build
```

启动主服务：`.venv/bin/python server.py`。浏览器入口 `/canvas.html`。

下载的官方源代码在 `integrations/deepseek-harness/`；运行时来自官方 Python wheel。源码固定版本：
https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317

若需要重新获取源码：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git integrations/deepseek-harness
git -C integrations/deepseek-harness checkout 687f282e8625c6b8d11ff58211a90524be2e4317
```

## 实时过程

使用官方 Harness SDK、真实会话和 Skill 工具。SDK 默认只广播持久化消息；本地 `script-stream-plugin.mjs` 通过官方 `llm/stream` 扩展点转发实际 `text-delta` / `reasoning-delta`，不更改模型请求或伪造打字动画。服务端 SSE 推送快照，浏览器断线可重连，刷新后继续接收活动任务。

BeUI 原版 StreamingResponse 渲染 Markdown 正文；AgentActivity 呈现返回的思考和 Skill 读取，完成后折叠。停止会终止该次独立 Harness 进程，保留已收到的内容。

## 历史与思考强度

右上角历史入口按画板列出对话，新对话保留旧记录；选择历史会恢复官方 Harness session、挂载 Skill 和上次发送的思考档位。初次读取会迁移旧单对话数据，保留原文件。

思考强度使用实际 BeUI RangeSlider TSX：关闭 / 轻度 / 深入 / 极致，分别传入 SDK `reasoning_effort` 的 `off / low / high / max`，默认 high。四个离散刻度支持拖动、方向键和 Home/End，生成期间锁定；选中范围采用主题绿色渐变。每次请求按所选档位初始化独立 Harness 进程，关闭会禁用模型思考，其他档位控制官方 effort 参数。

## 附件与 Skills

PromptInput 的附件入口支持每轮最多 6 个文件、每个 20 MB。文本、Markdown、Word、PDF、PPTX、XLSX、ODT 和 ZIP 中可读取的文本提取为本轮上下文；PNG/JPEG/WebP/GIF 使用 DeepSeek Flash 原生图片输入。单轮提取文本最多 15 万字符。扫描 PDF 尚无 OCR，不支持解析的二进制格式给出错误，不伪称已读取。

独立 Skill 安装器支持上传文件或粘贴文本，在单独 Harness 会话发送「帮我安装这个skill」，整理为可挂载的 SKILL.md，并保存上传原件。安装会话不进入写作历史。界面进度为等待估计：30 秒至 90%，只有后端成功注册 Skill 后达到 100% 并显示完成。安装成功自动挂载。原始文件不执行，默认个人 Skill 目录、终端和文件写入工具不开放给写作模型。

对话和已安装 Skills 存在 gitignored `script-data/`；重新构建不删除这些内容。

## 前端来源

直接使用 https://beui.dev/r/chat-app.json 及 Streaming Response、Prompt Input、Message、Message Scroller、Agent Activity、Range Slider 的实际 TSX 源码，位于 frontend/components。完整下载响应保留于 frontend/registry。适配包括中文按钮文案、窄侧栏尺寸、灰黑主题、真实数据源与 API Key / Skill 页面。MIT 许可见 frontend/BEUI-LICENSE.txt。

验收记录：outputs/ui-review-20261023/。前端状态测试 `node --test test_canvas_ui.cjs`，脚本持久化与流事件测试 `python3 -m unittest test_script_studio.py test_script_workflows.py`。

本轮本地检查：16 项脚本测试、17 项画板测试通过。真实 Harness 验证历史续聊、Skill 安装和读取、文本附件及图片输入。Computer Use 验证新对话/历史/安装页过渡、首 token 等待动效、图片与视频提示词展开后保留内容/参数/画板缩放，以及思考强度拖动与键盘操作。自动文件选择受 Chrome 扩展本地文件权限限制；附件上传接口和模型读取已单独验证。未调用图片或视频生成模型，未测试 SD-2.5-PX-VIP。
