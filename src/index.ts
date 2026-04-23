import { EventType } from "napcat-types/napcat-onebot/event/index";
import { join } from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import type {
  NapCatPluginContext,
  PluginConfigSchema,
  PluginModule,
} from "napcat-types/napcat-onebot/network/plugin/types";
import { loadRuleDoc, normalizeConfig, processText } from "./engine";
import type { ScopeMode, ScopeSettings } from "./types";

let ctxRef: NapCatPluginContext | null = null;
let cfg = normalizeConfig({});
let scopeSettings: ScopeSettings = defaultScopeSettings();

export const plugin_config_ui: PluginConfigSchema = [
  { key: "enable_private", label: "启用私聊处理", type: "boolean", default: true },
  { key: "enable_group", label: "启用群聊处理", type: "boolean", default: true },
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
  await ensureScopeSettingsFile(ctx);
  scopeSettings = await loadScopeSettings(ctx);
  registerWebUi(ctx);
  ctx.logger.info("MsgProcessor initialized");
};

export const plugin_on_config_change: PluginModule["plugin_on_config_change"] = async (ctx) => {
  cfg = normalizeConfig(await safeGetConfig(ctx));
  await ensureRulesFile(ctx);
  scopeSettings = await loadScopeSettings(ctx);
  ctx.logger.info("MsgProcessor config reloaded");
};

export const plugin_onmessage: PluginModule["plugin_onmessage"] = async (ctx, event) => {
  if (event.post_type !== EventType.MESSAGE || !event.raw_message) return;
  if (event.message_type === "private" && !cfg.enable_private) return;
  if (event.message_type === "group" && !cfg.enable_group) return;
  if (!shouldHandleByScope(event)) return;

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

  router.getNoAuth("/scope-settings", async (_req: any, res: any) => {
    scopeSettings = await loadScopeSettings(ctx);
    res.json({ code: 0, data: scopeSettings });
  });

  router.postNoAuth("/scope-settings", async (req: any, res: any) => {
    try {
      const body = req.body ?? {};
      const next = normalizeScopeSettings(body);
      const fullPath = join(ctx.dataPath, "scope_settings.json");
      await mkdir(ctx.dataPath, { recursive: true });
      await writeFile(fullPath, JSON.stringify(next, null, 2), "utf-8");
      scopeSettings = next;
      res.json({ code: 0, data: scopeSettings });
    } catch (err) {
      res.status(500).json({ code: -1, message: `保存消息范围设置失败: ${String(err)}` });
    }
  });

  router.getNoAuth("/scope-targets", async (_req: any, res: any) => {
    try {
      const [friends, groups] = await Promise.all([listFriendTargets(ctx), listGroupTargets(ctx)]);
      res.json({ code: 0, data: { friends, groups } });
    } catch (err) {
      res.status(500).json({ code: -1, message: `读取可选目标失败: ${String(err)}` });
    }
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

async function ensureScopeSettingsFile(ctx: NapCatPluginContext): Promise<void> {
  const settingsPath = join(ctx.dataPath, "scope_settings.json");
  try {
    await mkdir(ctx.dataPath, { recursive: true });
    await access(settingsPath);
  } catch {
    await writeFile(settingsPath, JSON.stringify(defaultScopeSettings(), null, 2), "utf-8");
    ctx.logger.info(`MsgProcessor: 已初始化消息范围设置 ${settingsPath}`);
  }
}

async function loadScopeSettings(ctx: NapCatPluginContext): Promise<ScopeSettings> {
  const settingsPath = join(ctx.dataPath, "scope_settings.json");
  try {
    const raw = await readFile(settingsPath, "utf-8");
    return normalizeScopeSettings(JSON.parse(raw));
  } catch {
    return defaultScopeSettings();
  }
}

function defaultScopeSettings(): ScopeSettings {
  return {
    enable_private: true,
    enable_group: true,
    private_mode: "all",
    private_whitelist: [],
    private_blacklist: [],
    group_mode: "all",
    group_whitelist: [],
    group_blacklist: [],
  };
}

function normalizeScopeSettings(raw: unknown): ScopeSettings {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enable_private: obj.enable_private !== false,
    enable_group: obj.enable_group !== false,
    private_mode: normalizeScopeMode(obj.private_mode),
    private_whitelist: normalizeIdList(obj.private_whitelist),
    private_blacklist: normalizeIdList(obj.private_blacklist),
    group_mode: normalizeScopeMode(obj.group_mode),
    group_whitelist: normalizeIdList(obj.group_whitelist),
    group_blacklist: normalizeIdList(obj.group_blacklist),
  };
}

function normalizeScopeMode(raw: unknown): ScopeMode {
  const mode = String(raw ?? "all").toLowerCase();
  if (mode === "whitelist" || mode === "blacklist") return mode;
  return "all";
}

function normalizeIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    const value = String(item ?? "").trim();
    if (value) out.add(value);
  }
  return [...out];
}

function shouldHandleByScope(event: { message_type?: unknown; user_id?: unknown; group_id?: unknown }): boolean {
  const messageType = String(event.message_type ?? "");
  if (messageType === "private") {
    if (!scopeSettings.enable_private) return false;
    return checkMode(scopeSettings.private_mode, String(event.user_id ?? ""), scopeSettings.private_whitelist, scopeSettings.private_blacklist);
  }
  if (messageType === "group") {
    if (!scopeSettings.enable_group) return false;
    return checkMode(scopeSettings.group_mode, String(event.group_id ?? ""), scopeSettings.group_whitelist, scopeSettings.group_blacklist);
  }
  return true;
}

function checkMode(mode: ScopeMode, id: string, whitelist: string[], blacklist: string[]): boolean {
  if (mode === "all") return true;
  if (!id) return false;
  if (mode === "whitelist") return whitelist.includes(id);
  return !blacklist.includes(id);
}

interface ScopeTargetItem {
  id: string;
  label: string;
}

async function listFriendTargets(ctx: NapCatPluginContext): Promise<ScopeTargetItem[]> {
  const raw = await callActionSafe(ctx, "get_friend_list");
  const items = pickArrayPayload(raw);
  return normalizeTargets(items, ["user_id", "uid", "uin"], ["nickname", "remark", "card"]);
}

async function listGroupTargets(ctx: NapCatPluginContext): Promise<ScopeTargetItem[]> {
  const raw = await callActionSafe(ctx, "get_group_list");
  const items = pickArrayPayload(raw);
  return normalizeTargets(items, ["group_id"], ["group_name", "name"]);
}

async function callActionSafe(ctx: NapCatPluginContext, action: "get_friend_list" | "get_group_list"): Promise<unknown> {
  try {
    return await ctx.actions.call(action, {}, ctx.adapterName, ctx.pluginManager.config);
  } catch {
    return null;
  }
}

function pickArrayPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    if (Array.isArray(rec.data)) return rec.data;
  }
  return [];
}

function normalizeTargets(items: unknown[], idKeys: string[], nameKeys: string[]): ScopeTargetItem[] {
  const out = new Map<string, ScopeTargetItem>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = pickFirstString(rec, idKeys).trim();
    if (!id) continue;
    const name = pickFirstString(rec, nameKeys).trim();
    const label = name ? `${name} (${id})` : id;
    out.set(id, { id, label });
  }
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
}

function pickFirstString(rec: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = rec[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return "";
}
