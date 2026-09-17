import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRules, saveRules } from "./api";
import { PipelineEditor, defaultConfig } from "./components/PipelineEditor";
import { ScrollToTop } from "./components/ScrollToTop";
import { TestBench } from "./components/TestBench";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { UI } from "./i18n-ui";
import type { RuleUI, RulesDocumentUI, RuleTarget } from "./types";
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
    target: "outbound",
    id: `rule_${Date.now()}`,
    enabled: true,
    priority: 0,
    limits: { max_matches: 0 },
    pipeline: [
      { _key: newKey(), id: "noop", label: "s1", config: defaultConfig("noop") },
    ],
  };
}

export default function App() {
  const [doc, setDoc] = useState<RulesDocumentUI | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ message: string; action: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await fetchRules();
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

  const saveEditor = async () => {
    if (!doc) return;
    setSaveMsg(null);
    try {
      const r = await saveRules(doc);
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
            请确认插件已启用，并从 AstrBot 插件详情页重新打开配置页。
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
        </div>
      </header>

      <TestBench key={rule?.target ?? "outbound"} doc={doc} selectedRuleId={rule?.id ?? ""} target={rule?.target ?? "outbound"} />

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
                  <small className="rule-category">{r.target === "llm_request" ? "LLM 请求" : "消息发送"}</small>
                </button>
              </li>
            ))}
          </ul>
          <div className="stack sidebar-actions">
            <button type="button" className="btn btn-primary btn-block" onClick={() => void saveEditor()}>
              {UI.saveFile}
            </button>
            <div className="save-feedback-slot" aria-live="polite">
              {saveMsg ? (
                <span className={`save-feedback ${saveOk ? "ok" : "error"}`}>{saveMsg}</span>
              ) : null}
            </div>
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
                      setConfirmation({ message: UI.deleteConfirm, action: () => {
                        const next = doc.rules.filter((_, i) => i !== selected);
                        setDoc({ ...doc, rules: next });
                        setSelected(Math.max(0, selected - 1));
                      } });
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
                  <span className="label-text">分类</span>
                  <select value={rule.target} onChange={(e) => {
                    const target = e.target.value as RuleTarget;
                    const id = target === "llm_request" ? "inject" : "noop";
                    const action = () => updateRule({ target, pipeline: [{ _key: newKey(), id, label: "s1", config: defaultConfig(id) }] });
                    if (rule.pipeline.some((step) => step.id !== "noop")) {
                      setConfirmation({ message: "切换分类会清空当前规则的模块配置。是否继续？", action });
                    } else {
                      action();
                    }
                  }}>
                    <option value="outbound">消息发送</option>
                    <option value="llm_request">LLM 请求</option>
                  </select>
                </label>
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
                {rule.target === "outbound" && <label className="field-stack">
                  <span className="label-text">{UI.fieldMaxMatches}</span>
                  <input
                    type="number"
                    value={rule.limits?.max_matches ?? 0}
                    onChange={(e) =>
                      updateRule({
                        limits: {
                          ...rule.limits,
                          max_matches: Number.isFinite(Number(e.target.value))
                            ? Number(e.target.value)
                            : 0,
                        },
                      })
                    }
                  />
                </label>}
              </div>

              <fieldset className="fieldset">
                <legend>{UI.sectionPipeline}</legend>
                <div className="fieldset-body">
                  <p className="muted section-desc pipeline-intro">{rule.target === "llm_request" ? "发送给 LLM 前执行注入；每次请求规则先执行，每日一次规则随后执行。同频率按优先级执行，规则内按模块顺序执行。" : UI.pipelineHint}</p>
                  <PipelineEditor
                    target={rule.target}
                    pipeline={rule.pipeline}
                    onChange={(pipeline) => updateRule({ pipeline })}
                  />
                </div>
              </fieldset>
            </>
          )}
        </main>
      </div>

      <footer className="app-footer muted">{UI.footer}</footer>
      <ScrollToTop />
      {confirmation && <ConfirmDialog message={confirmation.message}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => { confirmation.action(); setConfirmation(null); }} />}
    </div>
  );
}
