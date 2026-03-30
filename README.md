# MsgProcessor

面向 [AstrBot](https://github.com/AstrBotDevs/AstrBot) 的插件：在机器人收到群聊或私聊消息后、后续逻辑执行之前，按你写好的**规则**自动改写这条消息的**纯文本**。适合统一改指令前缀、给某类内容加标记、批量替换或删除片段等。**可选 Web 配置台**在浏览器里拖拽步骤、本地试跑，改完保存即可，一般不必改代码。

## 能做什么（概念上）

- **多条规则、各管一段流程**：每条规则可单独开关、按优先级先后执行。
- **先圈定要改的片段，再逐步处理**：例如只处理两个符号之间的内容、或匹配到某段字再处理；没有圈到或条件不对时，这条规则可以跳过，原文继续交给下一条。
- **常见处理动作**：替换、删除、在前后**加前缀或后缀**；**AI翻译**（在 AstrBot 里可走已配置的聊天模型生成译文，未开启或失败时退回为「前缀 + 原文」）；**门槛**（满足额外条件才对后续步骤生效）。
- **Web 界面**：编辑规则文件、输入样例看输出；插件行为还可通过数据目录下的配置文件调整（例如是否允许调用聊天模型做 AI翻译等）。

典型用途：清洗命令前缀、给括号或标签内文字加统一标记、按简单模式改写转发内容等。

## AI翻译说明

在 AstrBot 中使用、且在插件配置里**允许**后，**AI翻译**步骤会把你圈出的那段话交给 AstrBot 的聊天模型，按步骤里填的「目标语言」等说明生成译文。选用哪家模型在 AstrBot 主程序里配置。若未开启、没有可用模型或调用失败，会退回为在原文前拼接你在该步骤里配置的「模型不可用或未开启时的前缀」（与「加前缀」步骤类似，只为保底）。纯加前缀、不需要模型时，请用规则里的「加前缀」步骤即可。

## 快速开始（AstrBot）

1. 将本仓库作为插件目录放入 AstrBot 的插件路径（或按平台说明安装）。
2. 在插件根目录安装 Python 依赖：`pip install -r requirements.txt`（或与 AstrBot 共用环境时安装所列包）。
3. 若要使用 Web 配置台：在 `web/` 下执行 `npm install`、`npm run build`，生成 `web/dist/`。
4. 启动 AstrBot 并启用插件。首次运行会在插件数据目录下准备 **`rules.json`**（可由仓库里的 `sample_rules.json` 初始化）。

可选：将 `sample_config.json` 复制为数据目录下的 **`config.json`**，用于开关 Web 服务、端口、是否处理消息，以及是否允许 AI翻译等选项。字段说明见 `_conf_schema.json` 中的中文描述。

## 数据文件（插件数据目录）

| 文件 | 说明 |
|------|------|
| `rules.json` | 规则主文件：你在 Web 或编辑器里维护的处理流程 |
| `config.json` | 可选：插件总开关、Web、翻译相关选项等 |

仓库根的 **`sample_rules.json`**、**`sample_config.json`** 仅作示例，可随版本更新。

## 本地独立运行（开发 / 调试）

不启动 AstrBot 时调试 API 与静态页：

```bash
pip install -e .
cd web && npm install && npm run build && cd ..
python -m core.server
```

默认使用仓库下 **`data/`**（已在 `.gitignore` 中忽略），其中放入或生成 `rules.json` 即可试跑。

## 项目结构（概要）

```text
├── main.py                 # AstrBot 插件入口
├── metadata.yaml           # 插件元数据
├── _conf_schema.json       # AstrBot 插件配置表单说明（可选参考）
├── sample_rules.json
├── sample_config.json
├── requirements.txt
├── pyproject.toml
├── core/                   # 核心引擎、规则执行、HTTP 服务
└── web/                    # 配置台前端（Vite + React）
```

若在其他 Python 代码中集成，可使用 `from core.engine import process_text` 等（需正确设置包路径或已 `pip install -e .`）。

## 进阶（给需要改 JSON 或对接代码的读者）

规则在内部用结构化步骤描述（例如：匹配块里包含「如何找片段」与「找到后执行的内层步骤」）。你在 Web 里配置的选项会与这些字段对应；直接编辑 `rules.json` 时，字段名与示例文件一致即可。**一般用户只用 Web 即可，不必阅读本节。** 若旧规则里仍出现已删除的配置项 `translate_stub`，引擎会按「前缀 + 原文」兼容执行，新建规则请改用作「加前缀」或「AI翻译」。

## 技术栈

- **后端**：Python 3.10+，`fastapi`、`uvicorn`（Web API 与静态资源）
- **前端**：TypeScript、React、Vite

## 版本与命名

- setuptools 项目名：**`msgprocessor`**
- AstrBot 插件名见 **`metadata.yaml`** 中的 `name` / `display_name`

---

如有问题或需求，欢迎通过仓库 Issue 反馈。
