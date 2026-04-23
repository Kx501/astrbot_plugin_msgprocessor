# MsgProcessor (NapCat Plugin)

`MsgProcessor` 已重构为纯 NapCat 插件项目。  
插件在收到消息后按 `rules.json` 规则改写文本，并支持通过 AstrBot HTTP API 执行翻译步骤。

## 功能

- 规则优先级执行（`priority`）
- 匹配器：`regex`、`simple`、`passthrough`、`anchor_slice`
- 步骤：`match_block`、`end_rule`
- 子步骤：`replace`、`delete`、`prepend`、`append`、`translate_llm`、`translate_stub`
- 翻译：调用 AstrBot `POST /api/v1/chat`

## 项目结构

```text
├── src/
│   ├── index.ts            # NapCat 插件入口与生命周期
│   ├── engine.ts           # 规则执行引擎
│   ├── types.ts            # 类型定义
│   └── webui/              # NapCat 前端（可视化规则编辑）
│       ├── index.html
│       ├── package.json
│       └── src/
│           ├── App.tsx
│           └── components/
├── sample_rules.json       # 规则样例
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 开发与构建

```bash
npm install
npm run build
```

构建会自动打包前端并输出到 `dist/webui`，后端入口为 `dist/index.mjs`。

## 数据目录与手动迁移

本插件已完全切换到 NapCat 插件数据目录（`ctx.dataPath`）读写规则文件，不再兼容 AstrBot 旧插件目录。

- 运行时规则文件路径：`<ctx.dataPath>/<rules_file>`（默认 `rules.json`）
- 消息范围配置路径：`<ctx.dataPath>/scope_settings.json`
- 不会自动搬迁旧数据
- 需要你手动把旧 AstrBot 的 `rules.json` 复制到 NapCat 对应插件的 `dataPath`

NapCat 插件生命周期与上下文字段说明可参考官方文档：  
<https://napneko.github.io/develop/plugin/>

## 配置项

插件配置页支持以下字段：

- `enable_private`：是否处理私聊消息
- `enable_group`：是否处理群聊消息
- `rules_file`：规则文件名（位于插件 `dataPath`）
- `astrbot_api_base`：AstrBot API 地址（默认 `http://127.0.0.1:6185`）
- `astrbot_api_key`：AstrBot API Key
- `astrbot_username`：调用 chat API 的 username
- `astrbot_session_id`：调用 chat API 的 session_id
- `llm_translate_prompt`：翻译提示词

其余消息范围配置（私聊/群聊模式、黑白名单）放在插件内 WebUI 的“消息范围”页签中维护，会写入 `scope_settings.json`。
