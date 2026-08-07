# Model Studio

一个运行在本机的多供应商图像与视频生成控制台。支持 Ark 与 HFSY API、多参考素材、任务队列、历史恢复和结果预览，服务默认只监听 `127.0.0.1:4178`。

> 本项目不包含任何 API Key。每位使用者都需要自行申请并在本机配置，`.env` 已被 Git 忽略，不会随代码提交。

## 功能

- 图片：Seedream 5.0 Pro、Seedream 4.3，支持多张参考图和原图预览。
- 视频：Seedance Reference Video，支持图片、视频、音频参考素材及带音频视频生成。
- HFSY 图片：GPT Image 2（`gpt-image-2`）、GPT Image 2 Pro（`gpt-image-2pro`）、Nano Banana 2（`nano-banana-2`）、Nano Banana 2 Pro（`nano-banana-pro`）。
- HFSY 视频：Minimax H3（`minimax-h3`），支持 5–15 秒文生视频、图生视频和单条音频参考，不支持视频参考。
- 任务：一次提交对应一个完整任务；多行提示词不会被拆分。
- 本地记录：任务状态保存在本机，重启后可以恢复查看。

## 1. 申请 API Key

访问[方舟模型接入点](https://cloud.bytedance.net/ark/region:ark+cn-beijing/endpoint/detail?Id=ep-20260422194853-4h52t&Tab=overview&arkAccountId=2110547014&arkProjectName=ark_project_20260413_9u9f9&type=&x-bc-region-id=bytedance&x-resource-account=public)，按照页面指引申请访问权限并获取 API Key。

图片使用 `ARK_API_KEY`。视频调用使用独立的 `SEEDANCE_ARK_API_KEY`；如果你没有视频权限，可以先留空，只使用图片功能。请勿把真实 Key 写进 README、代码或提交到 Git。

HFSY 模型使用 `HFSY_API_KEY`，可在 [HFSY API](https://www.hfsyapi.cn) 申请，接口说明见[HFSY 文档](https://www.hfsyapi.cn/docs)。HFSY 与 Ark 是完全独立的调用链路，未配置某一侧的 Key 不影响另一侧。

HFSY 只接收公网 URL，所以本地参考素材会先自动上传到你的私有火山引擎 TOS Bucket，再生成短时 GET 签名 URL 交给 HFSY。任务结束后服务会主动删除临时对象；也可在页面直接填公网 URL，此时不需要 TOS。

## 2. 配置

要求：Python 3.9 或更高版本。项目仅使用 Python 标准库，无需安装第三方依赖。

```bash
git clone <你的仓库地址>
cd <项目目录>
cp .env.example .env
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
python3 server.py
```

然后打开 [http://127.0.0.1:4178](http://127.0.0.1:4178)。不要直接打开 `index.html`，否则页面无法调用本地服务。

## 数据与安全

- `.env`、上传素材、生成结果、任务历史和日志均已写入 `.gitignore`。
- `uploads/` 保存参考素材，`results/` 保存下载后的图片与视频，`task-history.jsonl` 保存本机任务记录。
- 生成结果的远程 URL 可能有有效期；图片完成后会自动下载到本地 `results/`。
- 服务只监听本机回环地址，不应直接暴露到公网。

停止服务时，在启动终端按 `Ctrl+C`。通过 macOS 启动器启动时，可运行：

```bash
pkill -f 'server.py'
```

## 测试

```bash
python3 -m unittest discover -v
```
