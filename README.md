# Model Studio

一个运行在本机的 Seedream / Seedance 图像与视频生成控制台。支持多参考素材、任务队列、历史恢复和结果预览，服务默认只监听 `127.0.0.1:4178`。

> 本项目不包含任何 API Key。每位使用者都需要自行申请并在本机配置，`.env` 已被 Git 忽略，不会随代码提交。

## 功能

- 图片：Seedream 5.0 Pro、Seedream 4.3，支持多张参考图和原图预览。
- 视频：Seedance Reference Video，支持图片、视频、音频参考素材及带音频视频生成。
- 任务：一次提交对应一个完整任务；多行提示词不会被拆分。
- 本地记录：任务状态保存在本机，重启后可以恢复查看。

## 1. 申请 API Key

访问[方舟模型接入点](https://cloud.bytedance.net/ark/region:ark+cn-beijing/endpoint/detail?Id=ep-20260422194853-4h52t&Tab=overview&arkAccountId=2110547014&arkProjectName=ark_project_20260413_9u9f9&type=&x-bc-region-id=bytedance&x-resource-account=public)，按照页面指引申请访问权限并获取 API Key。

图片使用 `ARK_API_KEY`。视频调用使用独立的 `SEEDANCE_ARK_API_KEY`；如果你没有视频权限，可以先留空，只使用图片功能。请勿把真实 Key 写进 README、代码或提交到 Git。

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
```

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
- `uploads/` 保存参考素材，`results/` 保存下载后的视频，`task-history.jsonl` 保存本机任务记录。
- 图片地址通常是 Ark 返回的短期签名 URL，建议生成后及时保存。
- 服务只监听本机回环地址，不应直接暴露到公网。

停止服务时，在启动终端按 `Ctrl+C`。通过 macOS 启动器启动时，可运行：

```bash
pkill -f 'server.py'
```

## 测试

```bash
python3 -m unittest discover -v
```

