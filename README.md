# MsgProcessor

**MsgProcessor** 是面向 [AstrBot](https://github.com/AstrBotDevs/AstrBot) 的插件：在机器人收到群聊/私聊消息后，按你配置的**规则**对 **`message_str`（纯文本）** 做处理（替换、过滤、拼接等），再交给后续逻辑。规则以 **JSON** 声明，支持可选 **Web 配置台**（拖拽流水线、试跑），无需改代码即可调整行为。

## 能做什么

- **多规则、可排序**：每条规则有优先级；按顺序尝试匹配与处理。
- **统一步骤流水线（`schema_version` 4）**：每条规则为有序 **`steps`**：`match_block`（仅含 **`matcher`** + **`region`** + 内层 **`steps`**）与 **`end_rule`**。多个 `match_block` 串联时，前一块输出整段文本作为下一块输入。
- **匹配方式（`matcher.type`）**：**`passthrough`** 整段一次进内层；**`anchor_slice`** 锚点间整段一次命中；**`regex`** / **`simple`** 在全文上查找。锚点只在 `anchor_slice`。
- **失败语义**：需锚点时解析失败，或主匹配零命中 → 不跑该块内层，消息原样进入下一块。
- **内层模块**：`match_block` 内为替换、追加、过滤、翻译占位等；`ProcessingContext.extra` 含本次命中 **`hit_index` / `hit_count`**（文档序，从 0 起）。
- **Web 配置台**：浏览器里编辑 `rules.json`、试跑输入输出；可通过 `config.json` 开关服务与监听地址。

适合需要**统一清洗指令前缀、抽取括号内内容、按模式改写回复文本**等场景。

## 快速开始（AstrBot）

1. 将本仓库作为插件目录放入 AstrBot 的插件路径（或按平台说明安装）。
2. 安装 Python 依赖：在插件根目录执行  
   `pip install -r requirements.txt`（或与 AstrBot 共用环境时等价安装 `fastapi`、`uvicorn`）。
3. 构建前端（提供 Web 界面时）：在 `web/` 下执行 `npm install` 与 `npm run build`，生成 `web/dist/`。
4. 启动 AstrBot 并启用插件。首次运行会在 **`StarTools.get_data_dir(None)`** 下自动准备 **`rules.json`**（由仓库根 `sample_rules.json` 复制，若不存在）。

可选：将 `sample_config.json` 复制为数据目录下的 **`config.json`**，控制 Web 是否启用、端口、是否处理消息等。

## 数据文件（插件数据目录）

| 文件 | 说明 |
|------|------|
| `rules.json` | 规则主文件（`schema_version`、规则列表；每条规则为 `steps` 有序步骤） |
| `config.json` | 可选；字段示例见仓库根 `sample_config.json` |

仓库根 **`sample_rules.json`**、**`sample_config.json`** 仅作模板与说明，可随版本更新。

## 本地独立运行（开发 / 调试）

用于不启动 AstrBot 时调试 API 与静态页：

```bash
pip install -e .
cd web && npm install && npm run build && cd ..
python -m core.server
```

默认使用仓库下 **`data/`** 目录（已在 `.gitignore` 中忽略），逻辑与插件数据目录一致：放置或生成 `rules.json` 即可。

## 项目结构（概要）

```text
├── main.py                 # AstrBot 入口（Star 注册）
├── metadata.yaml           # 插件元数据
├── sample_rules.json
├── sample_config.json
├── requirements.txt
├── pyproject.toml
├── core/                   # 核心：引擎、匹配、模块、加载、HTTP 服务
│   ├── engine.py
│   ├── server.py
│   └── …
└── web/                    # 配置台前端（Vite + React）
```

业务侧集成可使用：`from core.engine import process_text` 等（需正确设置 `PYTHONPATH` 或已 `pip install -e .`）。

## 技术栈

- **后端**：Python 3.10+，`fastapi` + `uvicorn`（Web API 与静态资源）
- **前端**：TypeScript、React、Vite

## 版本与命名

- PyPI/ setuptools 项目名：**`msgprocessor`**
- AstrBot 插件名见 **`metadata.yaml`** 中 `name` / `display_name`

---

如有问题或需求，欢迎通过仓库 Issue 反馈。
