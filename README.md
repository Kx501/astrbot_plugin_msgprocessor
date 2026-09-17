# MsgProcessor

面向 [AstrBot](https://github.com/AstrBotDevs/AstrBot) 的插件：按自定义规则调整 **LLM 请求**与**消息发送**两个阶段的内容。

## 规则分类

在规则顶部选择分类，模块列表只显示该分类支持的模块：

- **消息发送**：发送到聊天平台之前改写文本，覆盖被动回复链与主动 `send_message`。模块继续使用原来的「通用」「标记」分组。
- **LLM 请求**：在 `on_llm_request` 阶段修改发给模型的内容，目前提供「注入」模块。

旧规则未填写 `target` 时默认归入「消息发送」，原来的规则列表和流水线编辑入口保持不变。新文档使用 `schema_version: 6`，规则的 `target` 为 `outbound` 或 `llm_request`。不同分类不会互相执行规则，切换已有规则分类前会提示清空不适用的模块。

### 注入模块

选择「LLM 请求」后，可配置：

- 位置：System 开头/末尾、用户消息开头、用户消息末尾的附加内容、替换用户消息。
- 模板：`{{date}}`、`{{time}}`、`{{datetime}}`、`{{weekday}}`、`{{user}}`、`{{id}}`、`{{content}}` 等变量。其中 `user`、`id`、`content` 做 XML 转义，`user_nickname`、`user_id`、`user_message` 为原始值。
- 条件：私聊/群聊、用户/群白名单、原始用户消息包含文本或匹配正则。
- 频率：每次请求，或每个会话每日一次。每个注入步骤独立计次，未命中条件不会计次；切换对话后重新计次，拖动步骤不会重置其计次。
- 临时内容：仅用户消息末尾支持「仅本轮有效」，通过 AstrBot 临时内容标记避免写入对话历史。

每次请求的步骤先执行，每日一次的步骤随后执行；同频率内按规则优先级从大到小执行，规则内按模块顺序执行。条件匹配原始输入，模板读取此前步骤改写后的用户消息。连续前插时，后执行的内容位于更前方；连续替换时，后执行的替换继续作用于当前内容。为兼容旧消息包装规则，已有 `<msg ...>...</msg>` 包装或空用户消息会跳过替换。

每日一次仅限制执行次数，**不会让 System 注入自动保留到后续请求**。需要每轮提供的 System 内容应选「每次请求」。每日状态记录于插件 KV `injection_daily_dates`；修改规则标识会重新计次。注入结果继续写入 MsgDebugger 的 `_md_injection` 追踪字段。

测试区随当前规则分类切换。LLM 请求预览可填写 System、用户信息、群 ID、会话和时区，并展示用户消息、System 和附加内容。测试计次仅保留在页面内，点击「重置测试计次」可重新预览首次请求，不影响真实会话。

旧 InfoInjection 规则导入入口已移除，已导入的规则仍可在「LLM 请求」分类中编辑，无需再次迁移。请保持旧 InfoInjection 插件停用，避免重复注入。

## 功能

- **独立规则**：每条规则可单独开关、按优先级先后执行。
- **独立模块**：各模块独立处理，可自定义顺序。
- 多种匹配方式：正则、锚点、简单匹配。
- **多种处理操作**：替换、删除、**前方/后方拼接**、**按标记拆分**、**AI翻译**。
- **Web 界面**：在插件页面编辑规则、测试。

典型用途：清洗命令前缀、给括号或标签内文字加统一标记、按简单模式改写转发内容等。

## 快速开始（AstrBot）

1. 将本仓库作为插件目录放入 AstrBot 的插件路径（或按平台说明安装）。
2. 在插件根目录安装 Python 依赖：`pip install -r requirements.txt`（或与 AstrBot 共用环境时安装所列包）。
3. 源码安装时，在 `web/` 下执行 `npm install`、`npm run build`，生成 `pages/settings/index.html` 及资源文件。页面产物必须随插件一起发布；只有前端源码时，AstrBot 不会显示 Page 入口。
4. 启动 AstrBot 并启用插件，在「插件 → MsgProcessor → 规则配置」打开页面。首次运行会在插件数据目录下准备 `rules.json`（可由仓库里的 `sample_rules.json` 初始化）。新增 Pages 后需要重载插件。

需要支持插件 Pages 和 `astrbot.api.web` 的 AstrBot 版本。页面通过 AstrBot bridge 访问插件接口，沿用 Dashboard 登录身份，主题跟随 AstrBot。

旧入口 `http://127.0.0.1:5878` → 新入口「AstrBot WebUI → 插件 → MsgProcessor → 规则配置」。不再启动独立 Web 服务，`web_enabled`、`web_host`、`web_port` 已移除；旧配置文件中的这些字段会被忽略。已有 `rules.json`、其他配置和每日计次数据继续使用，不需要重新导入。

可选：将 `sample_config.json` 复制为数据目录下的 `config.json` 作为运行时配置底稿；翻译模型与提示词仍由 AstrBot 插件配置界面设置。另支持 `process_messages`（默认真，可不写）：为假则不处理待发文本，不影响 LLM 请求注入。

## 数据文件（插件数据目录）


| 文件            | 说明                              |
| ------------- | ------------------------------- |
| `rules.json`  | 规则主文件：在 Web 或编辑器里维护的处理流程        |
| `config.json` | 运行时配置：核心项见 `sample_config.json` |


仓库根的 `**sample_rules.json**`、`**sample_config.json**` 仅作示例，可随版本更新。

## 前端开发

前端源码仍位于 `web/`，构建目标为插件 Pages：

```bash
cd web
npm install
npm run build
```

构建后从 AstrBot 打开「规则配置」。页面依赖宿主 bridge，不再提供独立后端；直接打开 Vite 开发地址不能读写规则。修改静态资源后刷新 Page，新增 Page 后重载插件。`web/dist/` 为旧构建目录，不再用于运行或发布。

## 项目结构（概要）

```text
├── main.py                 # AstrBot 插件入口
├── metadata.yaml           # 插件元数据
├── _conf_schema.json       # AstrBot 插件配置表单说明（可选参考）
├── sample_rules.json
├── sample_config.json
├── requirements.txt
├── .astrbot-plugin/i18n/   # Pages 标题与说明
├── pages/settings/         # 前端构建生成的插件页面
├── core/                   # 核心引擎、规则执行、Pages API
└── web/                    # 配置台前端（Vite + React）
```

若在其他 Python 代码中集成，可使用 `from core.engine import process_text` 等（需正确设置包路径）。

## 技术栈

- **后端**：Python 3.10+，AstrBot Web API、Pydantic
- **前端**：TypeScript、React、Vite

---

如有问题或需求，欢迎通过仓库 Issue 反馈。
