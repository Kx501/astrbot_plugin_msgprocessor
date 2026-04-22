import type { RulesDocumentUI, RulesDocumentWire } from "./types";
import { uiToWire } from "./types";

function resolvePluginName() {
  const pluginMatch = location.pathname.match(/\/plugin\/([^/]+)/);
  if (pluginMatch) return pluginMatch[1];
  return "napcat-plugin-msgprocessor";
}

const API_BASE = `/plugin/${resolvePluginName()}/api`;

async function errBody(r: Response): Promise<string> {
  const t = await r.text();
  return t.trim() || `HTTP ${r.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, init);
  if (!r.ok) throw new Error(await errBody(r));
  const payload = (await r.json()) as { code: number; data?: T; message?: string };
  if (payload.code !== 0) throw new Error(payload.message ?? "请求失败");
  return payload.data as T;
}

export async function fetchRules(name: string): Promise<RulesDocumentWire> {
  return request<RulesDocumentWire>(`/rules/${encodeURIComponent(name)}`);
}

export async function saveRules(name: string, doc: RulesDocumentUI): Promise<{ saved: string }> {
  const body = uiToWire(doc);
  return request<{ saved: string }>(`/rules/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function processMessage(message: string, doc: RulesDocumentUI): Promise<string> {
  const rules = uiToWire(doc);
  const data = await request<{ output: string }>("/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, rules }),
  });
  return data.output;
}
