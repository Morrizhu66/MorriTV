# HFSY 图像模型接入设计

## 目标

在保留现有 Ark / Seedream / Seedance 链路的前提下，将 HFSY 作为独立供应商接入，新增 GPT Image 2、GPT Image 2 Pro、Nano Banana 2 和 Nano Banana 2 Pro 四个图片模型选项。Minimax H3 不再接入。

## 架构

新建 `hfsy_client.py` 承担 HFSY 协议差异，`tos_uploader.py` 负责将本地参考素材临时上传至私有 TOS 并生成短时签名 URL。`server.py` 仍负责本地任务队列与历史，根据 profile 分发任务，不改动旧的 Ark 子进程调用。

## 数据流

服务端先校验提示词和素材。HFSY 生成接口只接受公网 URL；前端统一使用本地素材选择器，本地文件会上传到 `hfsy-temp/` 前缀，以预签名 GET URL 调用 HFSY，并在任务结束后主动删除。后端保留公网 URL 入参作为 API 兼容能力。

## 安全与失败处理

HFSY 密钥只从 `HFSY_API_KEY` 环境变量或已忽略的 `.env` 读取，不进入源码、任务历史和前端响应。HTTP 错误、非法 JSON、远程失败状态和轮询超时都转成可读的本地任务错误。

## 验证

自动测试覆盖模型目录、三类请求体、结果解析、后端路由、参数限制、前端选项和密钥不泄漏。最后运行全量 unittest、语法检查、本地 HTTP 冒烟验证，并使用真实 HFSY 密钥至少完成一次低成本图片生成。
