import type { RulesDocumentUI, RulesDocumentWire } from "./types";
import { uiToWire } from "./types";

async function errBody(r: Response): Promise<string> {
  const t = await r.text();
  return t.trim() || `HTTP ${r.status}`;
}

export async function fetchRules(name: string): Promise<RulesDocumentWire> {
  const r = await fetch(`/api/rules/${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(`加载失败：${await errBody(r)}`);
  return r.json() as Promise<RulesDocumentWire>;
}

export async function saveRules(name: string, doc: RulesDocumentUI): Promise<{ saved: string }> {
  const body = uiToWire(doc);
  const r = await fetch(`/api/rules/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`保存失败：${await errBody(r)}`);
  return r.json() as Promise<{ saved: string }>;
}

function formatProcessOutput(output: string | string[]): string {
  if (!Array.isArray(output)) {
    return output;
  }
  return output.map((part, index) => `【消息 ${index + 1}】\n${part}`).join("\n\n");
}

export async function processMessage(message: string, doc: RulesDocumentUI): Promise<string> {
  const rules = uiToWire(doc);
  const r = await fetch("/api/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, rules }),
  });
  if (!r.ok) throw new Error(`测试请求失败：${await errBody(r)}`);
  const j = (await r.json()) as { output: string | string[] };
  return formatProcessOutput(j.output);
}
