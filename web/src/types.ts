export type SimpleOp = "equals" | "contains" | "startswith" | "endswith";

export interface WindowAnchor {
  literal: string;
  occurrence: number;
  inclusive: boolean;
}

export interface PipelineStepWire {
  id: string;
  config: Record<string, unknown>;
}

/** 磁盘 rules.json（schema_version 4） */
export interface RuleWire {
  id: string;
  enabled: boolean;
  priority: number;
  limits?: { max_matches?: number; max_message_length?: number };
  /** 缺省按空数组处理 */
  steps?: Array<{ id: string; config?: Record<string, unknown> }>;
}

export interface RulesDocumentWire {
  schema_version: number;
  rules: RuleWire[];
}

export interface PipelineStepUI extends PipelineStepWire {
  _key: string;
}

export interface RuleStepUI {
  _key: string;
  id: string;
  config: Record<string, unknown>;
}

export interface RuleUI {
  id: string;
  enabled: boolean;
  priority: number;
  limits?: { max_matches?: number; max_message_length?: number };
  steps: RuleStepUI[];
}

export interface RulesDocumentUI {
  schema_version: number;
  rules: RuleUI[];
}

export function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `k_${Math.random().toString(36).slice(2)}`;
}

function stepWireToUI(s: { id: string; config?: Record<string, unknown> }): RuleStepUI {
  const c = s.config && typeof s.config === "object" ? { ...s.config } : {};
  if (s.id === "match_block") {
    const raw = c.steps;
    const arr = Array.isArray(raw) ? (raw as PipelineStepWire[]) : [];
    return {
      _key: newKey(),
      id: "match_block",
      config: {
        matcher: c.matcher,
        region: c.region,
        steps: arr.map((p) => ({
          ...p,
          _key: newKey(),
          config: p.config && typeof p.config === "object" ? p.config : {},
        })),
      },
    };
  }
  return { _key: newKey(), id: s.id, config: c };
}

function ruleWireToUI(r: RuleWire): RuleUI {
  const steps = Array.isArray(r.steps) ? r.steps : [];
  return {
    id: r.id,
    enabled: r.enabled ?? true,
    priority: Number(r.priority) || 0,
    limits: r.limits,
    steps: steps.map((s) => stepWireToUI(s)),
  };
}

export function wireToUI(doc: RulesDocumentWire): RulesDocumentUI {
  return {
    schema_version: doc.schema_version >= 4 ? doc.schema_version : 4,
    rules: (doc.rules ?? []).map((r) => ruleWireToUI(r)),
  };
}

function stepUIToWire(s: RuleStepUI): { id: string; config: Record<string, unknown> } {
  if (s.id === "match_block") {
    const nested = (s.config.steps as PipelineStepUI[] | undefined) ?? [];
    return {
      id: "match_block",
      config: {
        matcher: s.config.matcher,
        region: s.config.region,
        steps: nested.map(({ id, config }) => ({
          id,
          config: { ...(config && typeof config === "object" ? config : {}) },
        })),
      },
    };
  }
  return {
    id: s.id,
    config: { ...s.config },
  };
}

export function uiToWire(doc: RulesDocumentUI): RulesDocumentWire {
  return {
    schema_version: 4,
    rules: doc.rules.map((r) => ({
      id: r.id,
      enabled: r.enabled,
      priority: r.priority,
      limits: r.limits,
      steps: r.steps.map((s) => stepUIToWire(s)),
    })),
  };
}
