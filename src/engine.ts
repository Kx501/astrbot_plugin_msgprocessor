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
  const region = asObj(cfg.region);
  const subSteps = Array.isArray(cfg.steps) ? cfg.steps : [];
  const hits = findHits(message, matcher, region, maxMatches);
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
    const rec = st as { id?: unknown; config?: unknown };
    const id = String(rec.id ?? "");
    const cfg = asObj(rec.config) ?? {};
    if (id === "noop") continue;
    if (id === "filter") {
      const contain = cfg.contain;
      if (typeof contain === "string" && contain && !text.includes(contain)) {
        break;
      }
      continue;
    }
    if (id === "translate_llm") {
      text = await meta.translateLlm(text, cfg);
      continue;
    }
    if (id === "translate_stub") text = `${String(cfg.prefix ?? "[译]")}${text}`;
    if (id === "prepend") text = `${String(cfg.prefix ?? "")}${text}`;
    if (id === "append") text = `${text}${String(cfg.text ?? "")}`;
    if (id === "replace") {
      text = applyReplace(text, cfg);
    }
    if (id === "delete") {
      text = applyDelete(text, cfg);
    }
  }
  return text;
}

function findHits(
  message: string,
  matcher: Record<string, unknown>,
  region: Record<string, unknown> | null,
  maxMatches: number
): Hit[] {
  const type = String(matcher.type ?? "regex").toLowerCase();
  if (type === "passthrough" && message.length) return [{ regionSpan: { start: 0, end: message.length }, regionText: message }];
  if (type === "simple") return findSimpleHits(message, matcher, maxMatches);
  if (type === "anchor_slice") return findAnchorSliceHit(message, matcher);
  return findRegexHits(message, matcher, region, maxMatches);
}

function findRegexHits(
  message: string,
  matcher: Record<string, unknown>,
  region: Record<string, unknown> | null,
  maxMatches: number
): Hit[] {
  const regex = new RegExp(String(matcher.pattern ?? ""), buildRegexFlags(matcher.flags));
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(message)) !== null) {
    const kind = String(region?.kind ?? "match");
    const groupRaw = region?.index ?? region?.name;
    const groupRef =
      typeof groupRaw === "number" ? groupRaw : typeof groupRaw === "string" && groupRaw !== "" ? groupRaw : undefined;
    const span = kind === "group" && groupRef !== undefined ? safeGroupSpan(m, groupRef) : [m.index, m.index + m[0].length];
    hits.push({ regionSpan: { start: span[0], end: span[1] }, regionText: message.slice(span[0], span[1]) });
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
  else if (op === "not_contains" && !source.includes(target)) add(0, message.length);
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
  const sOcc = Number(start.occurrence ?? 0);
  const eOcc = Number(end.occurrence ?? 0);
  const sPos = findNth(message, s, Number.isFinite(sOcc) ? Math.max(0, sOcc) : 0, 0);
  if (sPos < 0) return [];
  const ePos = findNth(message, e, Number.isFinite(eOcc) ? Math.max(0, eOcc) : 0, sPos + s.length);
  if (ePos < 0) return [];
  let from = Boolean(start.inclusive) ? sPos : sPos + s.length;
  let to = Boolean(end.inclusive) ? ePos + e.length : ePos;
  if (Boolean(matcher.ignore_start_anchor_line ?? matcher.ignore_anchor_line)) {
    const nl = message.indexOf("\n", sPos);
    from = nl >= 0 ? nl + 1 : message.length;
  }
  if (Boolean(matcher.ignore_end_anchor_line ?? matcher.ignore_anchor_line)) {
    const prevNl = message.lastIndexOf("\n", ePos);
    to = prevNl >= 0 ? prevNl + 1 : 0;
  }
  if (from >= to) return [];
  return [{ regionSpan: { start: from, end: to }, regionText: message.slice(from, to) }];
}

function buildRegexFlags(raw: unknown): string {
  const src = Array.isArray(raw) ? raw.map((x) => String(x)) : typeof raw === "string" ? raw.split(",") : [];
  const map: Record<string, string> = {
    IGNORECASE: "i",
    I: "i",
    MULTILINE: "m",
    M: "m",
    DOTALL: "s",
    S: "s",
    UNICODE: "u",
    U: "u",
  };
  const flags = new Set<string>(["g"]);
  for (const item of src) {
    const key = item.trim().toUpperCase().replace(/^RE\./, "");
    const f = map[key];
    if (f) flags.add(f);
  }
  return [...flags].join("");
}

function safeGroupSpan(m: RegExpExecArray, ref: string | number): [number, number] {
  try {
    if (typeof ref === "number") {
      const groupText = m[ref];
      if (!groupText) return [m.index, m.index + m[0].length];
      const rel = m[0].indexOf(groupText);
      if (rel < 0) return [m.index, m.index + m[0].length];
      return [m.index + rel, m.index + rel + groupText.length];
    }
    if (typeof ref === "string" && m.groups?.[ref]) {
      const groupText = m.groups[ref]!;
      const rel = m[0].indexOf(groupText);
      if (rel < 0) return [m.index, m.index + m[0].length];
      return [m.index + rel, m.index + rel + groupText.length];
    }
  } catch {
    return [m.index, m.index + m[0].length];
  }
  return [m.index, m.index + m[0].length];
}

function findNth(haystack: string, needle: string, occurrence: number, searchFrom: number): number {
  let pos = searchFrom;
  let idx = -1;
  for (let i = 0; i <= occurrence; i += 1) {
    idx = haystack.indexOf(needle, pos);
    if (idx < 0) return -1;
    pos = idx + Math.max(1, needle.length);
  }
  return idx;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function applyReplace(text: string, cfg: Record<string, unknown>): string {
  const from = String(cfg.from ?? "");
  if (!from) {
    if (Boolean(cfg.whole_from_empty)) return String(cfg.to ?? "");
    return text;
  }
  const to = String(cfg.to ?? "");
  if (!Boolean(cfg.regex)) return text.split(from).join(to);
  try {
    const re = new RegExp(from, buildRegexFlagsFromConfig(cfg.regex_flags));
    return text.replace(re, normalizeRegexReplacement(to));
  } catch {
    return text;
  }
}

function applyDelete(text: string, cfg: Record<string, unknown>): string {
  const from = String(cfg.from ?? "");
  if (!from) {
    if (Boolean(cfg.whole_from_empty)) return "";
    return text;
  }
  if (!Boolean(cfg.regex)) return text.split(from).join("");
  try {
    const re = new RegExp(from, buildRegexFlagsFromConfig(cfg.regex_flags));
    return text.replace(re, "");
  } catch {
    return text;
  }
}

function buildRegexFlagsFromConfig(raw: unknown): string {
  const src = Array.isArray(raw) ? raw.map((x) => String(x)) : typeof raw === "string" ? raw.split(",") : [];
  const map: Record<string, string> = {
    IGNORECASE: "i",
    I: "i",
    MULTILINE: "m",
    M: "m",
    DOTALL: "s",
    S: "s",
    UNICODE: "u",
    U: "u",
  };
  const flags = new Set<string>(["g"]);
  for (const item of src) {
    const key = item.trim().toUpperCase().replace(/^RE\./, "");
    const f = map[key];
    if (f) flags.add(f);
  }
  return [...flags].join("");
}

function normalizeRegexReplacement(raw: string): string {
  // 兼容从 Python 规则迁移的回填写法：\1 或 \g<name>。
  // JS replace 需要 $1 / $<name>。
  return raw.replace(/\\g<([a-zA-Z_][a-zA-Z0-9_]*)>/g, "$<$1>").replace(/\\([0-9]+)/g, "$$$1");
}

export function normalizeConfig(raw: Record<string, unknown>): PluginConfig {
  return {
    enable_private: raw.enable_private !== false,
    enable_group: raw.enable_group !== false,
    rules_file: String(raw.rules_file ?? "rules.json"),
    astrbot_api_base: String(raw.astrbot_api_base ?? "http://127.0.0.1:6185"),
    astrbot_api_key: String(raw.astrbot_api_key ?? ""),
    astrbot_username: String(raw.astrbot_username ?? "napcat-user"),
    astrbot_session_id: String(raw.astrbot_session_id ?? "msgprocessor"),
    llm_translate_prompt: String(raw.llm_translate_prompt ?? "请将以下文本翻译，只输出译文，不要解释。"),
  };
}
