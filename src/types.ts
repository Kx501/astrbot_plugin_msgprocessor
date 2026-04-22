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
  process_messages: boolean;
  rules_file: string;
  astrbot_api_base: string;
  astrbot_api_key: string;
  astrbot_username: string;
  astrbot_session_id: string;
  llm_translate_prompt: string;
}
