# Model Studio

一个运行在本机的多供应商图像与视频生成控制台。支持 Ark 与灵感鸭 API、节点画板、多参考素材、任务队列、历史恢复和结果预览，服务默认只监听 `127.0.0.1:4178`。

> 本项目不包含任何 API Key。每位使用者都需要自行申请并在本机配置，`.env` 已被 Git 忽略，不会随代码提交。

## 功能

- 图片：Seedream 5.0 Pro、Seedream 4.3，支持多张参考图和原图预览。
- 视频：Seedance Reference Video，支持图片、视频、音频参考素材及带音频视频生成。
- 灵感鸭图片：`gpt-image-2.5-sunburst-special`，文生图与参考图编辑；当前开放文档明确的 `1024x1024` 基础规格。
- 灵感鸭视频：`sd-2.0-mini`，5–15 秒、720p、16:9 / 9:16；最多 6 图、3 视频、3 音频，音视频参考须同时带图片。
- 创作画板：节点内提示词、@ 固定版本素材、拖线引用、视频截帧与后续镜头、镜头采用版本、素材包导出。
- 任务：一次提交对应一个完整任务；多行提示词不会被拆分。
- 本地记录：任务状态保存在本机，重启后可以恢复查看。

## 1. 申请 API Key

访问[方舟模型接入点](https://cloud.bytedance.net/ark/region:ark+cn-beijing/endpoint/detail?Id=ep-20260422194853-4h52t&Tab=overview&arkAccountId=2110547014&arkProjectName=ark_project_20260413_9u9f9&type=&x-bc-region-id=bytedance&x-resource-account=public)，按照页面指引申请访问权限并获取 API Key。

图片使用 `ARK_API_KEY`。视频调用使用独立的 `SEEDANCE_ARK_API_KEY`；如果你没有视频权限，可以先留空，只使用图片功能。请勿把真实 Key 写进 README、代码或提交到 Git。

灵感鸭使用 `LINGGANYA_API_KEY`，基础地址为 `https://www.lingganyaapi.com`。接口依据[官方统一文档](https://lingganya.apifox.cn/9147007m0)；参考图片直接以 multipart 上传，视频参考使用供应商临时文件接口，不要求 TOS。HFSY 生成入口已移除，历史记录与素材保留。

文生图与编辑优先读取同步 Base64 结果；只有收到真实任务 ID 才查询异步任务。创建请求不会自动重试，查询暂停后可使用“继续查询”恢复原任务。超时且没有任务 ID 时先核对供应商记录，避免重复收费。

## 2. 配置

要求：Python 3.9–3.12（当前服务使用的 `cgi` 模块在 Python 3.13 中已移除）。TOS 上传和图片处理依赖 `requirements.txt` 中的 TOS SDK 与 Pillow。

```bash
git clone <你的仓库地址>
cd <项目目录>
cp .env.example .env
python3 -m pip install --target .deps -r requirements.txt
```

打开 `.env`，填入申请到的 Key：

```dotenv
ARK_API_KEY=你的图片生成APIKey
SEEDANCE_ARK_API_KEY=你的视频生成APIKey
LINGGANYA_API_KEY=你的灵感鸭APIKey
TOS_ACCESS_KEY=你的TOS Access Key
TOS_SECRET_KEY=你的TOS Secret Key
TOS_ENDPOINT=tos-cn-beijing.volces.com
TOS_REGION=cn-beijing
TOS_BUCKET=你的私有Bucket名
TOS_SIGNED_URL_TTL=1800
```

TOS Bucket 保持私有，签名 URL 默认有效 30 分钟。旧 HFSY 临时对象若仍存在，可继续按既有生命周期清理；新接入不再创建该类临时对象。

也可以不创建 `.env`，直接在启动前设置同名环境变量。进程环境变量的优先级高于 `.env`。

## 3. 启动

macOS 可以直接双击：

```text
Start Model Studio.command
```

其他系统或习惯使用终端的用户可以运行：

```bash
PYTHONPATH=.deps python3 server.py
```

然后打开 [http://127.0.0.1:4178](http://127.0.0.1:4178)。不要直接打开 `index.html`，否则页面无法调用本地服务。

## 数据与安全

- `.env`、上传素材、生成结果、任务历史和日志均已写入 `.gitignore`。
- `uploads/` 保存参考素材，`results/` 保存下载后的图片与视频，`task-history.jsonl` 保存本机任务记录。
- 生成结果的远程 URL 可能有有效期；图片和视频完成后都会自动下载到本地 `results/`。
- 服务只监听本机回环地址，不应直接暴露到公网。

停止服务时，在启动终端按 `Ctrl+C`。通过 macOS 启动器启动时，可运行：

```bash
pkill -f 'server.py'
```

## 测试

```bash
PYTHONPATH=.deps python3 -m unittest discover -v
```


### 图片云存储与回收站

配置现有 TOS 后，新生成和导入的图片会将未压缩原图保存到私有桶的 `studio-originals/`，本地只保留最长边 480px 的 WebP 缩略图。列表使用缩略图；预览、下载、复制图片和填入参考图通过本机服务读取云端原图。上传或缩略图持久化失败时保留本地原图，页面显示待同步数量，可点击“同步已有原图”重试。已有图片也通过此入口同步；视频与任务参考素材仍保存本地。

`cloud-images.json` 是云端对象索引，应与任务历史、素材库清单及本地缩略图一同备份。访问签名由后端按需刷新，不把短期签名作为长期地址保存。`studio-originals/` 不参与参考素材 `hfsy-temp/` 的任务结束清理；桶生命周期规则须排除该长期保存目录。

成片区、收藏夹和视频灵感库支持卡片多选、全选和批量移入回收站，不弹出二次确认。回收站支持预览、单条恢复和批量恢复；删除的收藏夹不存在时恢复到成片区。旧的缺少恢复信息的条目仍显示，但不能自动恢复。回收站不会自动清空，云端原图继续保留。


## 创作画板

打开 [创作画板](http://127.0.0.1:4178/canvas.html)，也可从旧版控制台顶部进入。

- 项目下创建多个画板，直接创建图片、视频或文本节点；镜头顺序与画板位置独立。
- 节点内输入 `@`，在候选列表中选择素材，绑定当时的具体版本。点选与拖线建立相同引用；仅输入文件名不构成素材绑定。
- 引用用途作为文字约束随提示词提交。当前视频模型提供图片参考，不承诺首帧/尾帧精确控制。切换模型时不静默丢弃不兼容引用。
- 每次生成保留结果版本和提示词/参数/引用快照。选择“采用”后关联镜头；下游已有引用不随上游切换而变化。
- 视频可提取首帧、尾帧、当前帧；保存独立图片及来源时间。“尾帧续接”创建引用尾帧的新视频节点，由用户填写下一段动作并手动生成。浏览器按媒体时间定位，前后逐帧按钮以约 30fps 步进，变帧率视频可手动拖动调整。
- 空格拖动平移，滚轮平移，Ctrl/⌘ + 滚轮缩放，Shift 多选，空白处拖动框选，Ctrl/⌘C/V 复制粘贴节点，Ctrl/⌘Z 撤销。
- 自动保存至本机 `boards.json`，带版本冲突检测和浏览器草稿备份。项目及素材未实现跨设备云同步，需与历史、素材清单一起备份。移除节点不删除源素材。
- “导出采用素材”生成 ZIP，包含按镜头顺序命名的采用图片/视频、分镜 CSV/JSON 和生成参数快照。画板 JSON 可单独导出备份。
- 费用从供应商当前公开目录读取估算；账户专属折扣、余额、实际扣费和退款以供应商账单为准。目录不可用时明确显示暂无可靠报价。

当前侧重节点创作闭环；AI 拆分镜、多人协作、完整素材云同步、粗剪拼接和未接入模型的高级编辑能力不在本版内。所有本机 HTTP 接口仅供可信本地环境使用。
