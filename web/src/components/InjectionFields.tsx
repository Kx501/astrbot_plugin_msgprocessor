export function InjectionFields({ config, onChange }: {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const when = (config.when ?? {}) as Record<string, unknown>;
  const position = String(config.position ?? "message_end");
  return (
    <div className="field-stack field-stack--block">
      <div className="pipeline-config-grid">
        <label className="field-stack">
          <span className="label-text">注入位置</span>
          <select value={position} onChange={(e) => onChange({ position: e.target.value, ephemeral: false })}>
            <option value="message_start">用户消息开头</option>
            <option value="message_end">用户消息末尾（附加内容）</option>
            <option value="message_replace">替换用户消息</option>
            <option value="system_start">System 开头</option>
            <option value="system_end">System 末尾</option>
          </select>
        </label>
        <label className="field-stack">
          <span className="label-text">执行频率</span>
          <select value={String(config.schedule ?? "always")} onChange={(e) => onChange({ schedule: e.target.value })}>
            <option value="always">每次请求</option>
            <option value="daily">每个会话每日一次</option>
          </select>
        </label>
      </div>
      <label className="field-stack">
        <span className="label-text">模板</span>
        <textarea rows={5} value={String(config.template ?? "")} onChange={(e) => onChange({ template: e.target.value })} />
      </label>
      <p className="muted pipeline-config-hint">
        {"变量：{{date}}、{{time}}、{{datetime}}、{{weekday}}、{{user}}、{{id}}、{{content}}。user / id / content 已做 XML 转义；user_nickname / user_id / user_message 为原始值。"}
      </p>
      {position === "message_end" && <label className="field-inline-check">
        <input type="checkbox" checked={Boolean(config.ephemeral)} onChange={(e) => onChange({ ephemeral: e.target.checked })} />
        <span>仅本轮有效（不保存到对话历史）</span>
      </label>}
      {config.schedule === "daily" && <p className="muted pipeline-config-hint">
        每个注入步骤分别计次；未满足条件不会计次。每日一次不会让 System 内容在后续请求中自动保留。
      </p>}
      <label className="field-stack">
        <span className="label-text">会话类型</span>
        <select value={String(when.chat ?? "any")} onChange={(e) => onChange({ when: { ...when, chat: e.target.value } })}>
          <option value="any">全部</option><option value="private">私聊</option><option value="group">群聊</option>
        </select>
      </label>
      {([['user_ids', '用户 ID 白名单'], ['group_ids', '群 ID 白名单']] as const).map(([key, title]) => (
        <label className="field-stack" key={key}>
          <span className="label-text">{title}（每行一个，留空不限）</span>
          <textarea rows={2} value={Array.isArray(when[key]) ? (when[key] as string[]).join('\n') : ''}
            onChange={(e) => onChange({ when: { ...when, [key]: e.target.value.split('\n') } })} />
        </label>
      ))}
      {([['message_contains', '原始用户消息包含'], ['message_regex', '原始用户消息正则']] as const).map(([key, title]) => (
        <label className="field-stack" key={key}>
          <span className="label-text">{title}（留空不限）</span>
          <input value={String(when[key] ?? '')} onChange={(e) => onChange({ when: { ...when, [key]: e.target.value } })} />
        </label>
      ))}
    </div>
  );
}
