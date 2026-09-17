import type { ProcessResponseWire, RulesDocumentUI, RulesDocumentWire, TestScope, RuleTarget } from "./types";
import { uiToWire } from "./types";

interface PluginPageBridge {
  ready(): Promise<unknown>;
  apiGet<T>(endpoint: string): Promise<T>;
  apiPost<T>(endpoint: string, body: unknown): Promise<T>;
}

declare global {
  interface Window {
    AstrBotPluginPage?: PluginPageBridge;
  }
}

async function getBridge(): Promise<PluginPageBridge> {
  const bridge = window.AstrBotPluginPage;
  if (!bridge) throw new Error("请从 AstrBot 插件详情页打开 MsgProcessor 配置页。");
  await bridge.ready();
  return bridge;
}

export async function fetchRules(): Promise<RulesDocumentWire> {
  return (await getBridge()).apiGet<RulesDocumentWire>("rules");
}

export async function saveRules(doc: RulesDocumentUI): Promise<{ saved: string }> {
  return (await getBridge()).apiPost<{ saved: string }>("rules/save", uiToWire(doc));
}

export async function processMessage(
  message: string,
  doc: RulesDocumentUI,
  options?: { scope?: TestScope; selectedRuleId?: string; target?: RuleTarget; systemPrompt?: string; context?: Record<string, string>; dailyDates?: Record<string, string> },
): Promise<ProcessResponseWire> {
  const rules = uiToWire(doc);
  const scope = options?.scope ?? "all";
  const ruleIds =
    scope === "selected" && options?.selectedRuleId?.trim()
      ? [options.selectedRuleId.trim()]
      : undefined;
  return (await getBridge()).apiPost<ProcessResponseWire>("process", {
    message, rules, rule_ids: ruleIds,
    target: options?.target ?? "outbound",
    system_prompt: options?.systemPrompt ?? "",
    context: options?.context ?? {},
    daily_dates: options?.dailyDates ?? {},
  });
}
