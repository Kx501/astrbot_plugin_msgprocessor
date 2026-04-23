export interface WindowAnchor {
  literal: string;
  occurrence: number;
  inclusive: boolean;
}

export interface PipelineStepUI {
  _key: string;
  id: string;
  config: Record<string, unknown>;
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
  limits?: { max_matches?: number };
  steps: RuleStepUI[];
}

export interface RulesDocumentUI {
  schema_version: number;
  rules: RuleUI[];
}

export interface RuleStepWire {
  id: string;
  config?: Record<string, unknown>;
}

export interface RuleWire {
  id?: string;
  enabled?: boolean;
  priority?: number;
  limits?: { max_matches?: number };
  steps?: RuleStepWire[];
}

export interface RulesDocumentWire {
  schema_version?: number;
  rules?: RuleWire[];
}

export type ScopeMode = "all" | "whitelist" | "blacklist";

export interface ScopeSettings {
  enable_private: boolean;
  enable_group: boolean;
  private_mode: ScopeMode;
  private_whitelist: string[];
  private_blacklist: string[];
  group_mode: ScopeMode;
  group_whitelist: string[];
  group_blacklist: string[];
}

export interface ScopeTargetItem {
  id: string;
  label: string;
}

export interface ScopeTargetsResponse {
  friends: ScopeTargetItem[];
  groups: ScopeTargetItem[];
}

export function newKey(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function wireToUI(doc: RulesDocumentWire): RulesDocumentUI {
  return {
    schema_version: doc.schema_version ?? 4,
    rules: (doc.rules ?? []).map((rule, idx) => ({
      id: String(rule.id ?? `rule_${idx + 1}`),
      enabled: rule.enabled !== false,
      priority: Number(rule.priority ?? 0),
      limits: rule.limits ?? { max_matches: 0 },
      steps: (rule.steps ?? []).map((step) => ({
        _key: newKey(),
        id: String(step.id ?? "match_block"),
        config: step.config ?? {},
      })),
    })),
  };
}

export function uiToWire(doc: RulesDocumentUI): RulesDocumentWire {
  return {
    schema_version: doc.schema_version ?? 4,
    rules: doc.rules.map((rule) => ({
      id: rule.id,
      enabled: rule.enabled,
      priority: rule.priority,
      limits: rule.limits ?? { max_matches: 0 },
      steps: rule.steps.map((step) => ({
        id: step.id,
        config: step.config,
      })),
    })),
  };
}
