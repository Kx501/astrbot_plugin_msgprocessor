import { useState } from "react";
import { processMessage } from "../api";
import { UI } from "../i18n-ui";
import type { ProcessResponseWire, RulesDocumentUI, TestScope, RuleTarget } from "../types";

function MessageCard({ index, text }: { index: number; text: string }) {
  return (
    <article className="message-card">
      <header className="message-card__head">
        <span className="message-card__index">{UI.testMessageIndex(index)}</span>
      </header>
      <pre className="message-card__body">{text || UI.testMessageEmpty}</pre>
    </article>
  );
}

function ProcessOutputPanel({ result }: { result: ProcessResponseWire | null }) {
  if (!result) {
    return <p className="muted test-output-empty">{UI.testOutputPlaceholder}</p>;
  }

  if (result.request) {
    return <div className="message-card-list">
      <strong>System</strong><pre className="message-card__body">{result.request.system_prompt || "（空）"}</pre>
      <strong>用户消息</strong><pre className="message-card__body">{result.request.prompt || "（空）"}</pre>
      {result.request.parts.map((part, index) => <div key={index}>
        <strong>附加内容{part.ephemeral ? "（仅本轮）" : "（保存到历史）"}</strong>
        <pre className="message-card__body">{part.text}</pre>
      </div>)}
      <p className="muted">{result.request.blocks.length ? `生效步骤：${result.request.blocks.map((block) => `${block.rule_id}/${block.step}`).join("、")}` : "本轮没有注入步骤生效"}</p>
    </div>;
  }

  if (result.dropped || result.segments.length === 0) {
    return <p className="test-output-drop">{UI.testOutputDropped}</p>;
  }

  if (result.unchanged) {
    return <p className="muted test-output-unchanged">{UI.testOutputUnchanged}</p>;
  }

  return (
    <div className="message-card-list">
      {result.segments.map((seg, i) => (
        <MessageCard key={i} index={i + 1} text={seg.text} />
      ))}
    </div>
  );
}

export function TestBench({
  target,
  doc,
  selectedRuleId,
}: {
  target: RuleTarget;
  doc: RulesDocumentUI;
  selectedRuleId: string;
}) {
  const [testInput, setTestInput] = useState("【示例】你好 world 其它内容 /echo test");
  const [testResult, setTestResult] = useState<ProcessResponseWire | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testScope, setTestScope] = useState<TestScope>("all");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [context, setContext] = useState<Record<string, string>>({ user_id: "12345", user_nickname: "测试用户", group_id: "", session_id: "preview", timezone: "Asia/Shanghai" });
  const [dailyDates, setDailyDates] = useState<Record<string, string>>({});

  const runTest = async () => {
    setTestBusy(true);
    setTestError(null);
    try {
      const result = await processMessage(testInput, doc, {
        target, systemPrompt, context, dailyDates,
        scope: testScope,
        selectedRuleId: testScope === "selected" ? selectedRuleId : undefined,
      });
      setTestResult(result);
      if (result.request) setDailyDates(result.request.daily_dates);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
      setTestResult(null);
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <section className="card test-bench section-card">
      <details className="test-bench-details">
        <summary className="test-bench-summary" aria-label={UI.testExpand}>
          <h2 id="test-title">{UI.testSection}</h2>
          <span className="test-bench-chevron" aria-hidden>
            ▸
          </span>
        </summary>
        <div className="test-bench-body">
          <p className="muted section-desc">{target === "llm_request" ? "预览当前 LLM 请求规则，无需保存；每日计次只保留在测试区，不影响真实会话。连续执行可模拟同日下一轮请求。" : UI.testHint}</p>
          {target === "llm_request" && <div className="stack">
            <label className="field-stack"><span className="label-text">原始 System</span>
              <textarea rows={2} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
            </label>
            <div className="pipeline-config-grid">
              {([['user_id', '用户 ID'], ['user_nickname', '用户名'], ['group_id', '群 ID（留空为私聊）'], ['session_id', '测试会话'], ['timezone', '时区']] as const).map(([key, title]) => (
                <label className="field-stack" key={key}><span className="label-text">{title}</span>
                  <input value={context[key] ?? ''} onChange={(e) => setContext({ ...context, [key]: e.target.value })} />
                </label>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => { setDailyDates({}); setTestResult(null); }}>重置测试计次</button>
          </div>}
          <div className="test-bench-toolbar">
            <fieldset className="test-scope-fieldset">
              <legend className="test-scope-legend">{UI.testScopeLabel}</legend>
              <label className="field-inline-check">
                <input
                  type="radio"
                  name="test-scope"
                  checked={testScope === "all"}
                  onChange={() => setTestScope("all")}
                />
                <span>当前分类的全部已启用规则</span>
              </label>
              <label className="field-inline-check">
                <input
                  type="radio"
                  name="test-scope"
                  checked={testScope === "selected"}
                  onChange={() => setTestScope("selected")}
                />
                <span>{UI.testScopeSelected}</span>
              </label>
            </fieldset>
          </div>
          <div className="test-bench-grid">
            <label className="field field--test">
              <span className="field-label">{UI.input}</span>
              <textarea
                rows={4}
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                spellCheck={false}
                placeholder={UI.testInputPlaceholder}
              />
            </label>
            <div className="field field--test test-output-field">
              <span className="field-label">{UI.output}</span>
              <div className="test-output-panel">
                <ProcessOutputPanel result={testResult} />
              </div>
            </div>
            <div className="test-actions">
              <button type="button" className="btn btn-primary" disabled={testBusy} onClick={() => void runTest()}>
                {testBusy ? UI.running : UI.run}
              </button>
              {testError ? <span className="error">{testError}</span> : null}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
