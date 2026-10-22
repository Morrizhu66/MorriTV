# Morri · 创作画板

把脚本、参考图片、生成任务和可复用的灵感放在同一个创作空间。围绕节点组织创作过程：从一个想法出发，引用素材，生成图片或视频，再把值得保留的工作方法收藏起来。

![操作演示：展开编辑与打开脚本](docs/images/workflow.gif)

## 从画板开始

底部工具栏居中悬浮，平时只显示图标，悬停或键盘聚焦时展开名称。每张画板就是一个独立项目。可以新建、切换、重命名、备份或移入回收站；节点支持拖动、框选、Shift 多选、分组、复制与撤销。

图片、视频和文本节点通过连线建立引用关系。拖出连接点可以创建下一步，也可以连接已有素材。生成记录保留多个版本，方便比较和继续创作。

![画板与节点编辑](docs/images/canvas.png)

## 写提示词、引用素材、查看结果

- 图片和视频操作区位于节点下方，模型与参数集中在底部，也可以展开编辑长提示词。
- 输入 `@` 选择画板图片。引用在编辑时显示为带缩略图的整体标签，删除时按整个引用处理，保存时仍使用文本形式。
- 参考图可调整顺序；图片按自身宽高比展示。
- 生成时立即进入等待状态，错误在任务中心显示；已有结果可继续查看历史版本。
- 图片双击放大；视频使用统一播放器，支持播放、暂停、进度定位、静音和预览。
- 视频右键菜单支持提取当前帧或尾帧、续帧和导出。

## 脚本 Agent：让写作方法可以复用

点击底部工具栏右侧的绿黑色动态球「脚本」，右侧打开对话面板。已接入 **DeepSeek Harness 官方 SDK**，当前脚本 Agent **只能使用 DeepSeek 官方 API**。在连接设置中填写自己的 API Key。

![脚本 Agent 与思考设置](docs/images/script-agent.png)

对话支持真实流式正文、模型返回的思考与执行记录、首 token 等待动画、停止生成、历史对话和文件附件。模型入口同时提供关闭、轻度、深入、极致四档思考强度，恢复历史时沿用上次发送的档位。

输入 `@` 也可引用当前画板图片；发送时会把所选图片作为模型输入，而不只发送图片名称。

正文支持 Markdown 标题、列表、引用、代码块、表格和任务清单；脚本面板跟随画板统一切换深浅色。

![浅色模式与 Markdown 排版](docs/images/markdown-light.png)

### 安装和挂载 Skills

上传写作资料或粘贴规则，独立安装器会通过 Harness 整理成可挂载的 Skill。安装会话不混入写作历史。安装进度是等待提示，只有后端确认完成才显示 100%。

![Skill 安装器](docs/images/skill-installer.png)

支持文本、Markdown、Word、PDF、常见 Office 文档、图片和 ZIP 内的文本资料；无法解析的格式会明确报错。单文件上限 20 MB，单次最多 6 个附件。扫描 PDF 暂无 OCR。上传内容不会作为程序执行。

## 灵感收藏

从图片或视频节点收藏灵感，保留节点、提示词、参数和引用素材。按文件夹分类，用名称或提示词关键词检索；打开查看节点详情，提示词默认收起为短摘要。视频可以在收藏区播放，也可以打开统一预览播放器。

![灵感收藏](docs/images/inspirations.png)

复用灵感会将节点及引用关系放回画板，不会自动产生付费生成任务。

## 统一回收站

入口在**画板底部工具栏**。素材、灵感与画板分开浏览，可多选恢复或彻底删除。素材和灵感展示媒体缩略图；画板以已有图片或节点数量展示内容。彻底删除前会再次确认。

![统一回收站](docs/images/recycle-bin.png)

## 接口接入须知

**图片生成和视频生成 API 需要使用者自行重新接入。** 仓库内有历史适配代码，但不提供可共享的供应商账号、API Key、额度或可直接使用的生成服务，也不保证这些历史接口对你的账号仍可用。

建议把本项目交给自己的 coding agent，并提供供应商接口文档，让 agent 完成：

1. 模型列表、尺寸、清晰度、时长和参考素材的参数映射。
2. 上传、任务创建、轮询、失败处理与结果下载。
3. 在你授权的额度内进行小规模验证，再开放正式生成。

脚本 Agent 与媒体供应商独立配置；填写 DeepSeek Key 并不会同时开通图片或视频生成。

## 本地运行

主服务建议 Python 3.12；Node.js 用于重新构建脚本前端。

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
python3.12 -m venv .script-venv
.script-venv/bin/pip install -r requirements-script.txt
cd frontend
npm ci
npm run build
cd ..
.venv/bin/python server.py
```

打开 `http://127.0.0.1:4178/canvas.html`。前端构建产物已包含在仓库中。Harness 安装和运行说明见 [SCRIPT_STUDIO.md](SCRIPT_STUDIO.md)。

API Key、画板数据、对话、已安装 Skills、上传文件和生成结果保存在本地忽略目录，不应提交到 Git。服务面向本机使用，未经额外鉴权设计不应直接暴露公网。

## 技术与组件来源

画板使用原生 DOM / SVG；脚本面板使用 React、Motion 和 BeUI 的实际组件源码。包括 PromptInput、StreamingResponse、AgentActivity、MessageScroller、RangeSlider；发送按钮适配 MagicUI Interactive Hover Button。来源与改动记录见 [UI_REFERENCES.md](UI_REFERENCES.md)，BeUI MIT 许可见 [frontend/BEUI-LICENSE.txt](frontend/BEUI-LICENSE.txt)。

验证命令：

```bash
node --test test_canvas_ui.cjs
python3 -m unittest test_script_studio.py test_script_workflows.py
```

截图来自本地运行界面，使用演示提示词；Markdown 截图为排版示例，不代表一次模型生成。媒体生成接口不属于开箱即用的公共服务。
