export type JsonObject = Record<string, unknown>;

export interface RuleDoc {
  schema_version?: number;
  rules?: RuleConfig[];
}

export interface RuleConfig {
  id?: string;
  enabled?: boolean;
  priority?: number;
  limits?: {
    max_matches?: number;
    max_message_length?: number;
  };
  steps?: RuleStep[];
}

export interface RuleStep {
  id?: string;
  config?: JsonObject;
}

export interface PluginConfig {
  enable_private: boolean;
  enable_group: boolean;
  rules_file: string;
  astrbot_api_base: string;
  astrbot_api_key: string;
  astrbot_username: string;
  astrbot_session_id: string;
  llm_translate_prompt: string;
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
