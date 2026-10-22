# Model Studio

一个运行在本机的多供应商图像与视频生成控制台。支持 Ark 与 HFSY API、多参考素材、任务队列、历史恢复和结果预览，服务默认只监听 `127.0.0.1:4178`。

> 本项目不包含任何 API Key。每位使用者都需要自行申请并在本机配置，`.env` 已被 Git 忽略，不会随代码提交。

## 功能

- 图片：Seedream 5.0 Pro、Seedream 4.3，支持多张参考图和原图预览。
- 视频：Seedance Reference Video，支持图片、视频、音频参考素材及带音频视频生成。
- HFSY 图片：GPT Image 2（`gpt-image-2`）、GPT Image 2 Pro（`gpt-image-2pro`）、Nano Banana 2（`nano-banana-2`）、Nano Banana 2 Pro（`nano-banana-pro`）。
- HFSY 视频：SD 2.0（`sd-2.0`）支持 4–15 秒；SD 2.5 720P（`sd-2.5-720`）支持 4–30 秒。两者均支持图片、视频、音频混合参考。
- 任务：一次提交对应一个完整任务；多行提示词不会被拆分。
- 本地记录：任务状态保存在本机，重启后可以恢复查看。

## 1. 申请 API Key

访问[方舟模型接入点](https://cloud.bytedance.net/ark/region:ark+cn-beijing/endpoint/detail?Id=ep-20260422194853-4h52t&Tab=overview&arkAccountId=2110547014&arkProjectName=ark_project_20260413_9u9f9&type=&x-bc-region-id=bytedance&x-resource-account=public)，按照页面指引申请访问权限并获取 API Key。

图片使用 `ARK_API_KEY`。视频调用使用独立的 `SEEDANCE_ARK_API_KEY`；如果你没有视频权限，可以先留空，只使用图片功能。请勿把真实 Key 写进 README、代码或提交到 Git。

HFSY 模型使用 `HFSY_API_KEY`，可在 [HFSY API](https://www.hfsyapi.cn) 申请，接口说明见[HFSY 文档](https://www.hfsyapi.cn/docs)。HFSY 与 Ark 是完全独立的调用链路，未配置某一侧的 Key 不影响另一侧。

HFSY 只接收公网 URL，所以页面中选择的本地参考素材会先自动上传到你的私有火山引擎 TOS Bucket，再生成短时 GET 签名 URL 交给 HFSY。任务结束后服务会主动删除临时对象。后端仍保留 `reference_urls` 字段供 API 兼容调用。

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
HFSY_API_KEY=你的HFSY API Key
TOS_ACCESS_KEY=你的TOS Access Key
TOS_SECRET_KEY=你的TOS Secret Key
TOS_ENDPOINT=tos-cn-beijing.volces.com
TOS_REGION=cn-beijing
TOS_BUCKET=你的私有Bucket名
TOS_SIGNED_URL_TTL=1800
```

TOS Bucket 建议保持私有，并为 `hfsy-temp/` 前缀设置 1 天后自动过期的生命周期规则，作为异常中断时的兜底清理。签名 URL 默认有效 30 分钟。

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
