import { useState } from "react";
import { processMessage } from "../api";
import { UI } from "../i18n-ui";
import type { ProcessResponseWire, RulesDocumentUI, TestScope } from "../types";

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
  doc,
  selectedRuleId,
}: {
  doc: RulesDocumentUI;
  selectedRuleId: string;
}) {
  const [testInput, setTestInput] = useState("【示例】你好 world 其它内容 /echo test");
  const [testResult, setTestResult] = useState<ProcessResponseWire | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testScope, setTestScope] = useState<TestScope>("all");

  const runTest = async () => {
    setTestBusy(true);
    setTestError(null);
    try {
      const result = await processMessage(testInput, doc, {
        scope: testScope,
        selectedRuleId: testScope === "selected" ? selectedRuleId : undefined,
      });
      setTestResult(result);
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
          <p className="muted section-desc">{UI.testHint}</p>
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
                <span>{UI.testScopeAll}</span>
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
