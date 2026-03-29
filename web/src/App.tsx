import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRules, processMessage, saveRules } from "./api";
import { StepsEditor, defaultStepConfig } from "./components/StepsEditor";
import { ThemeToggle } from "./components/ThemeToggle";
import { UI } from "./i18n-ui";
import type { RuleUI, RulesDocumentUI } from "./types";
import { newKey, wireToUI } from "./types";

/** 顶栏副标题：整段一句维护；仅渲染时把「中的 rules.json…」包进 nowrap，避免换行碎裂 */
function headerSubtitleContent(text: string) {
  const anchor = "中的 rules.json";
  const i = text.indexOf(anchor);
  if (i === -1) {
    return text;
  }
  return (
    <>
      {text.slice(0, i)}
      <span className="header__subtitle-nowrap">{text.slice(i)}</span>
    </>
  );
}

function emptyRule(): RuleUI {
  return {
    id: `rule_${Date.now()}`,
    enabled: true,
    priority: 0,
    limits: { max_matches: 64 },
    steps: [{ _key: newKey(), id: "match_block", config: defaultStepConfig("match_block") }],
  };
}

export default function App() {
  const [doc, setDoc] = useState<RulesDocumentUI | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [testInput, setTestInput] = useState("【示例】你好 world 其它内容 /echo test");
  const [testOutput, setTestOutput] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await fetchRules("rules.json");
        if (!cancelled) {
          setDoc(wireToUI(w));
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rule = useMemo(() => {
    if (!doc || !doc.rules.length) return null;
    const i = Math.min(selected, doc.rules.length - 1);
    return doc.rules[i] ?? null;
  }, [doc, selected]);

  const updateRule = useCallback(
    (patch: Partial<RuleUI>) => {
      if (!doc || !rule) return;
      const i = Math.min(selected, doc.rules.length - 1);
      const next = { ...doc };
      next.rules = [...doc.rules];
      next.rules[i] = { ...next.rules[i], ...patch };
      setDoc(next);
    },
    [doc, rule, selected],
  );

  const runTest = async () => {
    if (!doc) return;
    setTestBusy(true);
    setTestError(null);
    try {
      const out = await processMessage(testInput, doc);
      setTestOutput(out);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
      setTestOutput("");
    } finally {
      setTestBusy(false);
    }
  };

  const saveEditor = async () => {
    if (!doc) return;
    setSaveMsg(null);
    try {
      const r = await saveRules("rules.json", doc);
      setSaveMsg(UI.savedOk(r.saved));
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const saveOk = saveMsg?.startsWith("已保存") ?? false;

  if (loadError && !doc) {
    return (
      <div className="app app--center">
        <div className="error-state card">
          <h1 className="error-state__title">{UI.loadFailed}</h1>
          <p className="error">{loadError}</p>
          <p className="muted error-state__hint">
            {UI.startBackend} <code className="code-inline">python -m core.server</code>
            <br />
            或在 AstrBot 中加载本插件后，由插件按配置启动 Web 服务。
          </p>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="app app--center">
        <p className="loading-dot muted">{UI.loading}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header card header--hero">
        <div className="header__top">
          <div className="header__brand">
            <span className="header__logo" aria-hidden>
              MP
            </span>
            <div className="header__text">
              <h1>{UI.appTitle}</h1>
              <p className="muted header__subtitle">{headerSubtitleContent(UI.appSubtitle)}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <section className="card test-bench section-card" aria-labelledby="test-title">
        <div className="section-head">
          <h2 id="test-title">{UI.testSection}</h2>
        </div>
        <p className="muted section-desc">{UI.testHint}</p>
        <div className="test-bench-grid">
          <label className="field field--test">
            <span className="field-label">{UI.input}</span>
            <textarea
              rows={4}
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              spellCheck={false}
              placeholder="在此粘贴或输入需要测试的机器人消息文本…"
            />
          </label>
          <label className="field field--test">
            <span className="field-label">{UI.output}</span>
            <textarea rows={4} value={testOutput} readOnly className="output-area" spellCheck={false} />
          </label>
          <div className="test-actions">
            <button type="button" className="btn btn-primary" disabled={testBusy} onClick={() => void runTest()}>
              {testBusy ? UI.running : UI.run}
            </button>
            {testError ? <span className="error">{testError}</span> : null}
          </div>
        </div>
      </section>

      <div className="layout">
        <aside className="sidebar card section-card">
          <div className="row spread">
            <h2 className="sidebar-title">{UI.rulesSidebar}</h2>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const r = emptyRule();
                setDoc({ ...doc, rules: [...doc.rules, r] });
                setSelected(doc.rules.length);
              }}
            >
              {UI.newRule}
            </button>
          </div>
          <ul className="rule-list">
            {doc.rules.map((r, i) => (
              <li key={r.id + i}>
                <button
                  type="button"
                  className={i === selected ? "rule-tab active" : "rule-tab"}
                  onClick={() => setSelected(i)}
                >
                  {r.id?.trim() ? r.id : UI.ruleUntitled(i + 1)}
                </button>
              </li>
            ))}
          </ul>
          <div className="stack sidebar-actions">
            <button type="button" className="btn btn-primary btn-block" onClick={() => void saveEditor()}>
              {UI.saveFile}
            </button>
            {saveMsg ? (
              <span className={`save-feedback ${saveOk ? "ok" : "error"}`}>{saveMsg}</span>
            ) : null}
          </div>
        </aside>

        <main className="main card section-card">
          {!rule ? (
            <p className="empty-hint">{UI.noRules}</p>
          ) : (
            <>
              <div className="row spread main-head">
                <h2>
                  {UI.editRule}：<span className="rule-id">{rule.id || UI.ruleUntitled(selected + 1)}</span>
                </h2>
                <div className="main-head__actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger-ghost main-head__delete"
                    onClick={() => {
                      if (!confirm(UI.deleteConfirm)) return;
                      const next = doc.rules.filter((_, i) => i !== selected);
                      setDoc({ ...doc, rules: next });
                      setSelected(Math.max(0, selected - 1));
                    }}
                  >
                    {UI.deleteRule}
                  </button>
                  <label className="field-inline-check main-head__enable">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => updateRule({ enabled: e.target.checked })}
                    />
                    <span>{UI.fieldEnabled}</span>
                  </label>
                </div>
              </div>

              <div className="form-meta">
                <label className="field-stack">
                  <span className="label-text">{UI.fieldId}</span>
                  <input value={rule.id} onChange={(e) => updateRule({ id: e.target.value })} />
                </label>
                <label className="field-stack">
                  <span className="label-text">{UI.fieldPriority}</span>
                  <input
                    type="number"
                    value={rule.priority}
                    onChange={(e) => updateRule({ priority: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="field-stack">
                  <span className="label-text">{UI.fieldMaxMatches}</span>
                  <input
                    type="number"
                    value={rule.limits?.max_matches ?? 64}
                    onChange={(e) =>
                      updateRule({
                        limits: {
                          ...rule.limits,
                          max_matches: Number(e.target.value) || 64,
                        },
                      })
                    }
                  />
                </label>
              </div>

              <fieldset className="fieldset">
                <legend>{UI.sectionSteps}</legend>
                <div className="fieldset-body">
                  <StepsEditor steps={rule.steps} onChange={(steps) => updateRule({ steps })} />
                </div>
              </fieldset>
            </>
          )}
        </main>
      </div>

      <footer className="app-footer muted">{UI.footer}</footer>
    </div>
  );
}
