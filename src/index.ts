import { EventType } from "napcat-types/napcat-onebot/event/index";
import { join } from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import type {
  NapCatPluginContext,
  PluginConfigSchema,
  PluginModule,
} from "napcat-types/napcat-onebot/network/plugin/types";
import { loadRuleDoc, normalizeConfig, processText } from "./engine";

let ctxRef: NapCatPluginContext | null = null;
let cfg = normalizeConfig({});

export const plugin_config_ui: PluginConfigSchema = [
  { key: "process_messages", label: "启用消息处理", type: "boolean", default: true },
  { key: "rules_file", label: "规则文件名（位于 dataPath）", type: "string", default: "rules.json" },
  { key: "astrbot_api_base", label: "AstrBot API Base", type: "string", default: "http://127.0.0.1:6185" },
  { key: "astrbot_api_key", label: "AstrBot API Key", type: "string", default: "" },
  { key: "astrbot_username", label: "AstrBot username", type: "string", default: "napcat-user" },
  { key: "astrbot_session_id", label: "AstrBot session_id", type: "string", default: "msgprocessor" },
  { key: "llm_translate_prompt", label: "翻译提示词", type: "string", default: "请将以下文本翻译，只输出译文，不要解释。" },
];

export const plugin_init: PluginModule["plugin_init"] = async (ctx) => {
  ctxRef = ctx;
  cfg = normalizeConfig(await safeGetConfig(ctx));
  await ensureRulesFile(ctx);
  registerWebUi(ctx);
  ctx.logger.info("MsgProcessor initialized");
};

export const plugin_on_config_change: PluginModule["plugin_on_config_change"] = async (ctx) => {
  cfg = normalizeConfig(await safeGetConfig(ctx));
  await ensureRulesFile(ctx);
  ctx.logger.info("MsgProcessor config reloaded");
};

export const plugin_onmessage: PluginModule["plugin_onmessage"] = async (ctx, event) => {
  if (!cfg.process_messages) return;
  if (event.post_type !== EventType.MESSAGE || !event.raw_message) return;

  const rulesPath = join(ctx.dataPath, cfg.rules_file);
  const doc = await loadRuleDoc(rulesPath, ctx.logger);
  const out = await processText(doc, event.raw_message, {
    translateLlm: async (text) => translateByAstrBotApi(text),
  });
  if (out === event.raw_message) return;

  const params: Record<string, unknown> = { message: out, message_type: event.message_type };
  if (event.message_type === "group" && event.group_id) params.group_id = String(event.group_id);
  if (event.message_type === "private" && event.user_id) params.user_id = String(event.user_id);
  await ctx.actions.call("send_msg", params, ctx.adapterName, ctx.pluginManager.config);
};

async function translateByAstrBotApi(text: string): Promise<string> {
  if (!ctxRef || !cfg.astrbot_api_key) return `[译]${text}`;
  const body = {
    username: cfg.astrbot_username,
    session_id: cfg.astrbot_session_id,
    message: `${cfg.llm_translate_prompt}\n\n${text}`,
    enable_streaming: false,
  };
  try {
    const resp = await fetch(`${cfg.astrbot_api_base}/api/v1/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.astrbot_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return `[译]${text}`;
    const payload = (await resp.json()) as { message?: string; text?: string; answer?: string };
    const output = String(payload.message ?? payload.text ?? payload.answer ?? "").trim();
    return output || `[译]${text}`;
  } catch (err) {
    ctxRef.logger.warn("MsgProcessor astrbot api failed", err);
    return `[译]${text}`;
  }
}

async function safeGetConfig(ctx: NapCatPluginContext): Promise<Record<string, unknown>> {
  try {
    const conf = await ctx.pluginManager.getPluginConfig();
    return (conf ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function registerWebUi(ctx: NapCatPluginContext): void {
  const router = ctx.router as any;

  router.static("/static", "webui");
  router.page({
    path: "rules-editor",
    title: "规则编辑器",
    htmlFile: "webui/index.html",
    description: "MsgProcessor 可视化规则编辑",
  });

  router.getNoAuth("/status", async (_req: any, res: any) => {
    const rulesPath = join(ctx.dataPath, cfg.rules_file);
    res.json({
      code: 0,
      data: {
        pluginName: ctx.pluginName,
        dataPath: ctx.dataPath,
        rulesFile: cfg.rules_file,
        rulesPath,
      },
    });
  });

  router.getNoAuth("/config", async (_req: any, res: any) => {
    res.json({ code: 0, data: cfg });
  });

  router.getNoAuth("/rules/:name", async (req: any, res: any) => {
    try {
      const name = sanitizeRulesName(String(req.params?.name ?? "rules.json"));
      const fullPath = join(ctx.dataPath, name);
      const raw = await readFile(fullPath, "utf-8");
      res.json({ code: 0, data: JSON.parse(raw) });
    } catch (err) {
      res.status(500).json({ code: -1, message: `读取规则失败: ${String(err)}` });
    }
  });

  router.postNoAuth("/rules/:name", async (req: any, res: any) => {
    try {
      const name = sanitizeRulesName(String(req.params?.name ?? "rules.json"));
      const fullPath = join(ctx.dataPath, name);
      const body = req.body ?? {};
      await mkdir(ctx.dataPath, { recursive: true });
      await writeFile(fullPath, JSON.stringify(body, null, 2), "utf-8");
      res.json({ code: 0, data: { saved: fullPath } });
    } catch (err) {
      res.status(500).json({ code: -1, message: `保存规则失败: ${String(err)}` });
    }
  });

  router.postNoAuth("/process", async (req: any, res: any) => {
    try {
      const message = String(req.body?.message ?? "");
      const rules = req.body?.rules;
      const output = await processText(rules, message, {
        // 前端测试区使用占位翻译，避免依赖外部 API 和鉴权状态
        translateLlm: async (text, stepCfg) => `${String(stepCfg.prefix ?? "[译]")}${text}`,
      });
      res.json({ code: 0, data: { output } });
    } catch (err) {
      res.status(500).json({ code: -1, message: `测试处理失败: ${String(err)}` });
    }
  });
}

function sanitizeRulesName(name: string): string {
  const trimmed = name.trim() || "rules.json";
  return trimmed.replace(/[\\/]/g, "_");
}

async function ensureRulesFile(ctx: NapCatPluginContext): Promise<void> {
  const rulesPath = join(ctx.dataPath, cfg.rules_file);
  const defaultRules = {
    schema_version: 4,
    rules: [],
  };
  try {
    await mkdir(ctx.dataPath, { recursive: true });
    await access(rulesPath);
  } catch {
    await writeFile(rulesPath, JSON.stringify(defaultRules, null, 2), "utf-8");
    ctx.logger.info(`MsgProcessor: 已初始化规则文件 ${rulesPath}`);
  }
}
