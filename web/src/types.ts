export type SimpleOp = "equals" | "contains" | "startswith" | "endswith";

export interface WindowAnchor {
  literal: string;
  occurrence: number;
  inclusive: boolean;
}

export interface PipelineStepWire {
  id: string;
  label?: string;
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

export interface ProcessSegmentWire {
  type: "plain";
  text: string;
}

export interface ProcessEffectWire {
  kind: string;
  rule_id?: string;
  detail?: string;
}

export interface ProcessResponseWire {
  schema_version: number;
  input: string;
  segments: ProcessSegmentWire[];
  effects: ProcessEffectWire[];
  unchanged: boolean;
  dropped?: boolean;
  output: string | string[] | null;
}

export type TestScope = "all" | "selected";

export function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `k_${Math.random().toString(36).slice(2)}`;
}

export function autoStepLabel(index: number): string {
  return `s${index + 1}`;
}

/** 按当前顺序生成 s1、s2…，并 remap guard 的 goto 目标。 */
export function normalizePipelineLabels(pipeline: PipelineStepUI[]): PipelineStepUI[] {
  if (pipeline.length === 0) {
    return pipeline;
  }

  const oldLabelToKey = new Map<string, string>();
  for (const step of pipeline) {
    const old = typeof step.label === "string" ? step.label.trim() : "";
    if (old) {
      oldLabelToKey.set(old, step._key);
    }
  }

  const keyToNewLabel = new Map<string, string>();
  pipeline.forEach((step, i) => {
    keyToNewLabel.set(step._key, autoStepLabel(i));
  });

  return pipeline.map((step, i) => {
    const newLabel = autoStepLabel(i);
    if (step.id !== "guard") {
      return step.label === newLabel ? step : { ...step, label: newLabel };
    }

    const config = { ...step.config };
    let configChanged = false;
    for (const gotoKey of ["when_true_goto", "when_false_goto"] as const) {
      const target = String(config[gotoKey] ?? "").trim();
      if (!target) {
        continue;
      }
      const targetKey = oldLabelToKey.get(target);
      const remapped = targetKey ? keyToNewLabel.get(targetKey) : undefined;
      if (remapped && remapped !== target) {
        config[gotoKey] = remapped;
        configChanged = true;
      }
    }
    if (!configChanged && step.label === newLabel) {
      return step;
    }
    return { ...step, label: newLabel, config: configChanged ? config : step.config };
  });
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
        steps: normalizePipelineLabels(
          arr.map((p) => ({
            ...p,
            _key: newKey(),
            label: typeof p.label === "string" ? p.label : "",
            config: p.config && typeof p.config === "object" ? p.config : {},
          })),
        ),
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
    const nested = normalizePipelineLabels(
      (s.config.steps as PipelineStepUI[] | undefined) ?? [],
    );
    return {
      id: "match_block",
      config: {
        matcher: s.config.matcher,
        region: s.config.region,
        steps: nested.map(({ id, label, config }) => {
          const wire: PipelineStepWire = {
            id,
            config: { ...(config && typeof config === "object" ? config : {}) },
          };
          const trimmed = typeof label === "string" ? label.trim() : "";
          if (trimmed) {
            wire.label = trimmed;
          }
          return wire;
        }),
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
