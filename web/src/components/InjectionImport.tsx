import { useState } from "react";
import type { RuleUI, RuleWire } from "../types";
import { newKey, wireToUI } from "../types";

export function InjectionImport({ onImport }: { onImport: (rules: RuleUI[]) => void }) {
  const [message, setMessage] = useState("");
  return <div className="stack">
    <label className="field-stack">
      <span className="label-text">导入 InfoInjection 规则</span>
      <input type="file" accept=".json,application/json" onChange={async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        try {
          const doc = JSON.parse(await file.text());
          if (!Array.isArray(doc.rules) || !doc.rules.length) throw new Error("文件中没有注入规则");
          const rules: RuleWire[] = doc.rules.map((rule: Record<string, unknown>, index: number) => {
            if (!rule || typeof rule.inject !== "object" || !rule.inject) throw new Error("请选择 InfoInjection 的 rules.json");
            const inject = rule.inject as Record<string, unknown>;
            return {
              id: String(rule.id || `injection_${index + 1}`),
              enabled: rule.enabled !== false,
              priority: Number(rule.priority) || 0,
              target: "llm_request",
              pipeline: [{ id: "inject", label: "s1", config: {
                ...inject,
                state_id: newKey(),
                position: String(inject.position ?? "").trim().toLowerCase().replaceAll("-", "_"),
                ephemeral: inject.position === "message_end" && Boolean(inject.ephemeral),
                schedule: rule.schedule === "always" ? "always" : "daily",
                when: rule.when ?? { chat: "any" },
              } }],
            };
          });
          const converted = { schema_version: 6, rules };
          const response = await fetch("/api/process", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "", rules: converted, target: "llm_request" }),
          });
          if (!response.ok) throw new Error(await response.text());
          onImport(wireToUI(converted).rules);
          setMessage(`已导入 ${rules.length} 条规则，保存后生效。请停用旧 InfoInjection 插件；每日计次从首次执行重新开始。`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        } finally {
          input.value = "";
        }
      }} />
    </label>
    {message && <p className="muted" role="status">{message}</p>}
  </div>;
}
