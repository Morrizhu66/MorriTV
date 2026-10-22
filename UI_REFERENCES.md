# 画板 UI 参考与实现记录

更新：2026-10-23。以下为本轮实际打开、查阅的官方组件页面，以及落地位置。
项目使用原生 DOM 渲染，因此采用组件的视觉与交互方式实现；没有把这些 React 组件库声明成已安装依赖。
弹层定位与短过渡继续使用项目已有的本地 Floating UI 和 Motion。

| 来源 | 查阅内容 | 本次落地 |
| --- | --- | --- |
| [Beautiful UI](https://www.beautifului.dev/) | Prompt Bar、Selection Actions、Task Rows、Flowchart | 紧凑提示词编辑区；进入选择模式后才出现批量操作；任务摘要与详情分层。Selection Actions 原本用于文本选择，这里只借鉴选中后显示相关操作的方式。 |
| [beUI Motion](https://beui.dev/components/motion) | Tabs、Checkbox、Dock、Context Menu | 素材分类滑块、方形勾选框、底部工具栏与短弹层过渡；减少无关装饰动画。 |
| [AI Elements Connection](https://elements.ai-sdk.dev/components/connection)、[Node](https://elements.ai-sdk.dev/components/node) | 连线预览、端点和节点结构 | 统一三次曲线，拖线末端圆点，目标吸附高亮；输入和输出端口均可拖动；拖到空白处创建并连接。 |
| [Generative Loaders](https://generativeloaders.com/docs) | ImageLoader 像素网格与减少动态效果设置 | 生成中状态采用低幅度像素网格，并提供状态文字与 reduced-motion 支持；替换扫光。 |
| [shadcn UI Dropdown Menu](https://ui.shadcn.com/docs/components/base/dropdown-menu) | 菜单结构、键盘导航、焦点和关闭行为 | 统一菜单间距、悬停态、箭头键选择、Escape 关闭；修复工具菜单执行后不关闭。 |

## 行为调整

- 素材库和素材选择器均以“多选”进入选择模式，初始选中数为 0；“全选”是单独动作，完成或切换分类会清空选择。
- 空节点可建立引用，也可拖出创建上下游节点。上游尚无内容时保留等待关系，有内容后绑定首次可用版本。
- 连线按动画帧更新；端点使用节点内坐标，避免缩放或自动定位时读取旧画面导致闪跳；取消后清理临时线与目标高亮。已有连接和拖线预览使用相同曲线。
- 分组保持展开，保留整体移动、命名和取消分组；取消分组不会删除成员。
- 精简素材侧栏、提示词区、镜头页和任务详情的重复文案；统一深浅色边框、间距和控件。

## 验证边界

使用 Chrome Computer Use 在独立的“交互验收 · 10月22日”画板测试，保留原有工作画板。
实际操作通过：多选初始为 0、逐项选择、全选、退出；素材搜索与分类；空节点拖出创建；输入端反向创建；已有节点连接；Escape 取消清理；撤销重做；分组移动与取消分组；模型键盘选择；自动排列；镜头创建、关联节点及打开定位；任务详情；深浅色切换。最终页面检查未发现浏览器错误或警告；两条连线四个端点与端口中心的测量偏差均小于 0.01 像素。

自动上传被 Chrome 扩展的本地文件读取权限阻止，未算作通过。未发起付费模型生成，因此实际供应商生成及生成中动画没有做端到端验收。等待引用转为固定版本的行为由回归测试覆盖。

前端行为测试：`node --test test_canvas_ui.cjs`，13/13 通过。画板服务测试：`PYTHONPATH=.deps python3 -m unittest test_canvas -v`，9/9 通过。后者使用模拟供应商，不产生真实生成费用。JavaScript 语法检查与 `git diff --check` 均通过。

界面截图：[深色画板](outputs/ui-review-20261022/canvas-dark.jpg)。

## 2026-10-23 宽面板与模型更新

操作区为图片下方独立的 620px 面板，底部单行模型、比例、清晰度和生成。去掉节点尾部的引用、镜头关联和积分提示。图片按原始宽高比计算显示宽度，不铺固定比例黑底。展开仅在必要时平移，不缩放。

参考排序增加 10px 起拖阈值、相邻卡片中部命中和 220ms 换位间隔。Computer Use 实测轻微移动不排序、明确拖动排序、撤销还原、展开前后均为 106%。加载使用同一 CSS 的独立本地预览验收，2.4 秒循环正常；没有提交付费任务。

新模型：gpt-image-2.5-sunburst、gpt-image-2-special、SD-2.5-PX-VIP。智能比例依据第一张参考图片匹配当前清晰度支持的最近比例，无图片时选方图；3:2 / 2:3 仅开放用户提供的 1K 规格。2K / 4K 的 16:9 使用 2048×1152 / 4096×2304，9:16 对调，方图分别 2048 / 4096。

SD-2.5-PX-VIP 按用户提供的 DOCX 接入异步上传、创建、查询、下载，使用模型名 SD-2.5-PX-VIP，5–30 秒、480p/720p/1080p、七种画幅。按用户要求，未对该模型执行测试调用。现有客户端和画板服务的 19 项本地测试通过，其中新增图片 Sunburst 请求和智能比例测试；它们使用模拟请求，不调用供应商。

## 2026-10-23 组件盘点与生成反馈

| 页面组件 | 对应参考 | 本轮处理 |
| --- | --- | --- |
| 首次生成／已有结果再次生成 | [BeUI Loader](https://beui.dev/components/motion/loader) Comet | 共用轨道光点加载层，已有图片保留在模糊背景下；减少动态效果设置下停用旋转 |
| 画板／镜头、素材分类 | [BeUI Tabs](https://beui.dev/components/motion/tabs) Segment | 主视图也接入滑动指示器，左右键与 Home/End 切换 |
| 模型、画幅、清晰度选择 | Select | 统一悬停边框和展开底色，保留键盘选择 |
| 素材卡片与多选 | Card、Checkbox | 卡片悬停层次与勾选态分开，默认不选择素材 |
| 节点操作菜单 | Context Menu、Popover | 使用已有统一弹层和关闭行为 |
| 提示词操作区 | Collapsible、Prompt Input | 保留独立宽面板、单行参数、收起操作，不增加自动缩放 |
| 任务监视窗 | Animated Alert、Badge | 任务卡片、状态徽标和错误区统一；本地提交错误进入监视窗，保留输入和旧结果 |
| 参考图顺序 | Sortable List | 保留起拖阈值、中心命中与换位间隔 |

本轮实际新增视觉实现为 Loader、主视图 Tabs、Select 反馈和任务状态卡片；其他行是当前组件盘点，并非声称重新安装了整套 BeUI。原生 DOM 实现借鉴交互方式，未引入 React。

提交路径现在先标记 pending 并绘制，再执行校验、保存、上传和网络请求。收到创建回执后立即放入任务索引，避免等待下一次轮询期间加载态消失。所有失败路径清理 pending，本地错误留在当前会话的任务监视窗。

验收：14 项前端回归通过。Computer Use 在复用真实提交包装函数和 Loader 的本地模拟页确认：点击后立刻显示加载层并禁用重复提交，3.5 秒后模拟失败进入监视窗；没有请求供应商。实际画板／镜头切换已操作，浏览器未记录错误。未进行付费端到端生成。

## 2026-10-23 脚本 / BeUI 实际组件接入

本轮新增隔离的 React 脚本面板，直接使用 BeUI Agents 注册表提供的 TSX：ChatApp、PromptInput、Message、MessageScroller、StreamingResponse、AgentActivity。源码与 MIT 许可证在 frontend/，构建产物为 script-app.js / script-app.css。此前“未引入 React”的描述仅对应早期原生画板工作。

官方 DeepSeek Harness 已本地安装；实时扩展从 llm/stream 转发真实正文和思考增量，服务端 SSE 推送。浏览器实测在完成前收到 89 → 476 → 904 字的正文，之后到达完成状态；思考记录完成后可展开，停止按钮终止独立任务。API Key 输入位于面板右上角连接设置，只显示配置状态及末四位。

灵感详情默认显示三行提示词，支持展开；图片从缩略图位置过渡至详情，文字单独淡入，避免整体弹窗缩放拉伸。Computer Use 已实际操作打开、展开提示词、关闭；该动效为现有原生画板的适配实现，并未冒称直接渲染 React Image Viewer。

验证：17 项画板交互测试、7 项脚本持久化与流事件测试；官方 Harness 的真实写作和 Skill 读取成功；未调用图片或视频生成模型。安装和接入说明见 SCRIPT_STUDIO.md。


## 2026-10-23 脚本交互补全

- PromptInput 继续使用 BeUI 原版，接入真实附件上传与移除、发送/停止；新增历史记录和独立 Skill 安装器，统一页面进出动效。
- 思考强度直接安装 [BeUI Range Slider](https://beui.dev/components/motion/range-slider) 注册表源文件及 use-slider hook。原始注册响应保存于 frontend/registry/range-slider.json；组件只增加填充样式标记，主题覆写为绿色渐变。四档映射官方 Harness off / low / high / max，默认 high，并随对话恢复。
- 图片/视频生成与脚本发送使用用户提供的 MagicUI Interactive Hover Button 结构和扩散交互；等待首 token 使用用户给出的像素格、扫光与计时设计。
- 图片/视频提示词支持独立展开编辑器，复用原输入与参数绑定。Computer Use 检查展开前后缩放不变、提示词和参数保留。
- 本轮未提交任何图片或视频生成请求。界面证据位于 outputs/ui-review-20261023/。


## 2026-10-23 · 操作区与底部工具栏收尾

- 使用用户提供的 beUI Expandable Action Bar 文档，将悬停／聚焦展开、触屏首次展开的交互适配到原生 DOM 画板；不是直接挂载 React 版本。底栏始终居中，默认所有图标同亮度，悬停项使用主题绿色。
- 参考素材改为 58px 缩略图，移除用途下拉；富文本提示词占满编辑器宽度，统一底部参数高度。
- 图片引用保留纯文本存储，以不可拆分缩略图标签编辑。
- 脚本正文使用 react-markdown + remark-gfm；深浅色跟随画板。
- 回收站入口移至底栏，使用垃圾桶图标，显示媒体缩略图与画板内容概览。

- 脚本独立球形入口直接使用 beUI Voice Orb 源码与 WebGL renderer（https://beui.dev/r/voice-orb），配色 `#91cf28 / #d7ff94 / #071209`。保留离屏暂停、减少动态效果和 WebGL 不可用时的静态渐变回退。无麦克风调用。
