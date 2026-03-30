# MsgProcessor

面向 [AstrBot](https://github.com/AstrBotDevs/AstrBot) 的插件：在机器人收到消息后，按自定义的**规则**自动改写消息**文本**。



## 功能

- **独立规则**：每条规则可单独开关、按优先级先后执行。
- **独立模块**：各模块独立处理，可自定义顺序。
- 多种匹配方式：正则、锚点、简单匹配。
- **多种处理操作**：替换、删除、插入**前缀/后缀**、**AI翻译**。
- **Web 界面**：在插件页面编辑规则、测试。

典型用途：清洗命令前缀、给括号或标签内文字加统一标记、按简单模式改写转发内容等。



## 快速开始（AstrBot）

1. 将本仓库作为插件目录放入 AstrBot 的插件路径（或按平台说明安装）。
2. 在插件根目录安装 Python 依赖：`pip install -r requirements.txt`（或与 AstrBot 共用环境时安装所列包）。
3. 若要使用 Web 配置台：在 `web/` 下执行 `npm install`、`npm run build`，生成 `web/dist/`。
4. 启动 AstrBot 并启用插件。首次运行会在插件数据目录下准备 `**rules.json`**（可由仓库里的 `sample_rules.json` 初始化）。

可选：将 `sample_config.json` 复制为数据目录下的 `**config.json**` 作为 Web 相关底稿；翻译模型与提示词由 AstrBot 配置界面写入同一文件（或框架存储），与样本无关。另支持 `**process_messages**`（默认真，可不写）：为假则本条插件不处理入站文本。



## 数据文件（插件数据目录）


| 文件            | 说明                              |
| ------------- | ------------------------------- |
| `rules.json`  | 规则主文件：在 Web 或编辑器里维护的处理流程        |
| `config.json` | 运行时配置：核心项见 `sample_config.json` |


仓库根的 `**sample_rules.json**`、`**sample_config.json**` 仅作示例，可随版本更新。



## 本地独立运行（开发 / 调试）

不启动 AstrBot 时调试 API 与静态页：

```bash
pip install -e .
cd web && npm install && npm run build && cd ..
python -m core.server
```

默认使用仓库下 `**data/**`（已在 `.gitignore` 中忽略），其中放入或生成 `rules.json` 即可试跑。



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



## 技术栈

- **后端**：Python 3.10+，`fastapi`、`uvicorn`（Web API 与静态资源）
- **前端**：TypeScript、React、Vite



## 版本与命名

- setuptools 项目名：`**msgprocessor`**
- AstrBot 插件名见 `**metadata.yaml**` 中的 `name` / `display_name`

---

如有问题或需求，欢迎通过仓库 Issue 反馈。