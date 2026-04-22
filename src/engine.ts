import { readFile } from "node:fs/promises";
import { PluginConfig, RuleConfig, RuleDoc, RuleStep } from "./types";

interface Hit {
  regionSpan: { start: number; end: number };
  regionText: string;
}

interface RuntimeMeta {
  translateLlm: (text: string, stepCfg: Record<string, unknown>) => Promise<string>;
}

export async function loadRuleDoc(path: string, logger: { warn: (...args: unknown[]) => void }): Promise<RuleDoc> {
  try {
    const raw = await readFile(path, "utf-8");
    const doc = JSON.parse(raw) as RuleDoc;
    return typeof doc === "object" && doc ? doc : { schema_version: 4, rules: [] };
  } catch (err) {
    logger.warn("MsgProcessor: 加载 rules 失败，使用空规则", err);
    return { schema_version: 4, rules: [] };
  }
}

export async function processText(doc: RuleDoc, text: string, meta: RuntimeMeta): Promise<string> {
  const rules = (doc.rules ?? []).filter((x): x is RuleConfig => !!x && typeof x === "object");
  const ordered = [...rules].sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
  let out = text;
  for (const rule of ordered) {
    if (rule.enabled === false) continue;
    out = await applyRule(out, rule, meta);
  }
  return out;
}

function parseMaxMatches(rule: RuleConfig): number {
  const v = Number(rule.limits?.max_matches ?? 0);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 256) : 0;
}

async function applyRule(text: string, rule: RuleConfig, meta: RuntimeMeta): Promise<string> {
  const steps = (rule.steps ?? []).filter((x): x is RuleStep => !!x && typeof x === "object");
  let out = text;
  for (const step of steps) {
    if (step.id === "end_rule") break;
    if (step.id !== "match_block") continue;
    out = await runMatchBlock(out, asObj(step.config) ?? {}, parseMaxMatches(rule), meta);
  }
  return out;
}

async function runMatchBlock(
  message: string,
  cfg: Record<string, unknown>,
  maxMatches: number,
  meta: RuntimeMeta
): Promise<string> {
  const matcher = asObj(cfg.matcher) ?? { type: "regex", pattern: ".*" };
  const subSteps = Array.isArray(cfg.steps) ? cfg.steps : [];
  const hits = findHits(message, matcher, maxMatches);
  if (!hits.length) return message;
  let out = message;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const hit = hits[i];
    const rewritten = await runSubSteps(hit.regionText, subSteps, meta);
    out = `${out.slice(0, hit.regionSpan.start)}${rewritten}${out.slice(hit.regionSpan.end)}`;
  }
  return out;
}

async function runSubSteps(input: string, subSteps: unknown[], meta: RuntimeMeta): Promise<string> {
  let text = input;
  for (const st of subSteps) {
    if (!st || typeof st !== "object") continue;
    const id = String((st as { id?: unknown }).id ?? "");
    const cfg = asObj((st as { config?: unknown }).config) ?? {};
    if (id === "translate_llm") {
      text = await meta.translateLlm(text, cfg);
      continue;
    }
    if (id === "translate_stub") text = `${String(cfg.prefix ?? "[译]")}${text}`;
    if (id === "prepend") text = `${String(cfg.prefix ?? "")}${text}`;
    if (id === "append") text = `${text}${String(cfg.text ?? "")}`;
    if (id === "replace") {
      const from = String(cfg.from ?? "");
      if (from) text = text.split(from).join(String(cfg.to ?? ""));
    }
    if (id === "delete") {
      const from = String(cfg.from ?? "");
      if (from) text = text.split(from).join("");
    }
  }
  return text;
}

function findHits(message: string, matcher: Record<string, unknown>, maxMatches: number): Hit[] {
  const type = String(matcher.type ?? "regex").toLowerCase();
  if (type === "passthrough" && message.length) return [{ regionSpan: { start: 0, end: message.length }, regionText: message }];
  if (type === "simple") return findSimpleHits(message, matcher, maxMatches);
  if (type === "anchor_slice") return findAnchorSliceHit(message, matcher);
  return findRegexHits(message, matcher, maxMatches);
}

function findRegexHits(message: string, matcher: Record<string, unknown>, maxMatches: number): Hit[] {
  const regex = new RegExp(String(matcher.pattern ?? ""), "g");
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(message)) !== null) {
    hits.push({ regionSpan: { start: m.index, end: m.index + m[0].length }, regionText: m[0] });
    if (maxMatches > 0 && hits.length >= maxMatches) break;
    if (m[0].length === 0) regex.lastIndex += 1;
  }
  return hits;
}

function findSimpleHits(message: string, matcher: Record<string, unknown>, maxMatches: number): Hit[] {
  const op = String(matcher.op ?? "contains").toLowerCase();
  const value = String(matcher.value ?? "");
  if (!value) return [];
  const source = Boolean(matcher.ignore_case) ? message.toLowerCase() : message;
  const target = Boolean(matcher.ignore_case) ? value.toLowerCase() : value;
  const out: Hit[] = [];
  const add = (start: number, end: number) => out.push({ regionSpan: { start, end }, regionText: message.slice(start, end) });
  if (op === "startswith" && source.startsWith(target)) add(0, value.length);
  else if (op === "endswith" && source.endsWith(target)) add(message.length - value.length, message.length);
  else if (op === "equals" && source === target) add(0, message.length);
  else if (op === "contains") {
    let pos = 0;
    while (pos <= source.length) {
      const idx = source.indexOf(target, pos);
      if (idx < 0) break;
      add(idx, idx + value.length);
      pos = idx + Math.max(1, value.length);
      if (maxMatches > 0 && out.length >= maxMatches) break;
    }
  }
  return out;
}

function findAnchorSliceHit(message: string, matcher: Record<string, unknown>): Hit[] {
  const start = asObj(matcher.start);
  const end = asObj(matcher.end);
  if (!start || !end) return [];
  const s = String(start.literal ?? "");
  const e = String(end.literal ?? "");
  if (!s || !e) return [];
  const sPos = message.indexOf(s);
  if (sPos < 0) return [];
  const ePos = message.indexOf(e, sPos + s.length);
  if (ePos < 0) return [];
  const from = Boolean(start.inclusive) ? sPos : sPos + s.length;
  const to = Boolean(end.inclusive) ? ePos + e.length : ePos;
  if (from >= to) return [];
  return [{ regionSpan: { start: from, end: to }, regionText: message.slice(from, to) }];
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function normalizeConfig(raw: Record<string, unknown>): PluginConfig {
  return {
    process_messages: raw.process_messages !== false,
    rules_file: String(raw.rules_file ?? "rules.json"),
    astrbot_api_base: String(raw.astrbot_api_base ?? "http://127.0.0.1:6185"),
    astrbot_api_key: String(raw.astrbot_api_key ?? ""),
    astrbot_username: String(raw.astrbot_username ?? "napcat-user"),
    astrbot_session_id: String(raw.astrbot_session_id ?? "msgprocessor"),
    llm_translate_prompt: String(raw.llm_translate_prompt ?? "请将以下文本翻译，只输出译文，不要解释。"),
  };
}
