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

/** 磁盘 rules.json（schema_version 5） */
export interface RuleWire {
  id: string;
  enabled: boolean;
  priority: number;
  limits?: { max_matches?: number; max_message_length?: number };
  pipeline?: PipelineStepWire[];
}

export interface RulesDocumentWire {
  schema_version: number;
  rules: RuleWire[];
}

export interface PipelineStepUI extends PipelineStepWire {
  _key: string;
}

export interface RuleUI {
  id: string;
  enabled: boolean;
  priority: number;
  limits?: { max_matches?: number; max_message_length?: number };
  pipeline: PipelineStepUI[];
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

function pipelineWireToUI(arr: PipelineStepWire[]): PipelineStepUI[] {
  return normalizePipelineLabels(
    arr.map((p) => ({
      ...p,
      _key: newKey(),
      label: typeof p.label === "string" ? p.label : "",
      config: p.config && typeof p.config === "object" ? p.config : {},
    })),
  );
}

function ruleWireToUI(r: RuleWire): RuleUI {
  const pipeline = Array.isArray(r.pipeline) ? r.pipeline : [];
  return {
    id: r.id,
    enabled: r.enabled ?? true,
    priority: Number(r.priority) || 0,
    limits: r.limits,
    pipeline: pipelineWireToUI(pipeline),
  };
}

export function wireToUI(doc: RulesDocumentWire): RulesDocumentUI {
  return {
    schema_version: doc.schema_version >= 5 ? doc.schema_version : 5,
    rules: (doc.rules ?? []).map((r) => ruleWireToUI(r)),
  };
}

export function uiToWire(doc: RulesDocumentUI): RulesDocumentWire {
  const pipeline = (p: PipelineStepUI[]) =>
    normalizePipelineLabels(p).map(({ id, label, config }) => {
      const wire: PipelineStepWire = {
        id,
        config: { ...(config && typeof config === "object" ? config : {}) },
      };
      const trimmed = typeof label === "string" ? label.trim() : "";
      if (trimmed) {
        wire.label = trimmed;
      }
      return wire;
    });

  return {
    schema_version: 5,
    rules: doc.rules.map((r) => ({
      id: r.id,
      enabled: r.enabled,
      priority: r.priority,
      limits: r.limits,
      pipeline: pipeline(r.pipeline),
    })),
  };
}
