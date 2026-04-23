import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRules, fetchScopeSettings, fetchScopeTargets, processMessage, saveRules, saveScopeSettings } from "./api";
import { StepsEditor, defaultStepConfig } from "./components/StepsEditor";
import { ThemeToggle } from "./components/ThemeToggle";
import { UI } from "./i18n-ui";
import type { RuleUI, RulesDocumentUI, ScopeMode, ScopeSettings, ScopeTargetItem } from "./types";
import { newKey, wireToUI } from "./types";

function headerSubtitleContent(text: string) {
  const anchor = "中的 rules.json";
  const i = text.indexOf(anchor);
  if (i === -1) return text;
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
    limits: { max_matches: 0 },
    steps: [{ _key: newKey(), id: "match_block", config: defaultStepConfig("match_block") }],
  };
}

function defaultScopeSettings(): ScopeSettings {
  return {
    enable_private: true,
    enable_group: true,
    private_mode: "all",
    private_whitelist: [],
    private_blacklist: [],
    group_mode: "all",
    group_whitelist: [],
    group_blacklist: [],
  };
}

function modeHint(mode: ScopeMode): string {
  if (mode === "whitelist") return UI.scopeModeHintWhitelist;
  if (mode === "blacklist") return UI.scopeModeHintBlacklist;
  return UI.scopeModeHintAll;
}

function includesKeyword(item: ScopeTargetItem, keyword: string): boolean {
  if (!keyword) return true;
  const k = keyword.trim().toLowerCase();
  if (!k) return true;
  return item.label.toLowerCase().includes(k) || item.id.toLowerCase().includes(k);
}

export default function App() {
  const [doc, setDoc] = useState<RulesDocumentUI | null>(null);
  const [scope, setScope] = useState<ScopeSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"rules" | "scope">("rules");
  const [selected, setSelected] = useState(0);
  const [testInput, setTestInput] = useState("【示例】你好 world 其它内容 /echo test");
  const [testOutput, setTestOutput] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [scopeSaveMsg, setScopeSaveMsg] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [friendTargets, setFriendTargets] = useState<ScopeTargetItem[]>([]);
  const [groupTargets, setGroupTargets] = useState<ScopeTargetItem[]>([]);
  const [friendKeyword, setFriendKeyword] = useState("");
  const [groupKeyword, setGroupKeyword] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, s, targets] = await Promise.all([fetchRules("rules.json"), fetchScopeSettings(), fetchScopeTargets()]);
        if (!cancelled) {
          setDoc(wireToUI(w));
          setScope(s ?? defaultScopeSettings());
          setFriendTargets(targets?.friends ?? []);
          setGroupTargets(targets?.groups ?? []);
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

  const updateScope = useCallback(
    (patch: Partial<ScopeSettings>) => {
      if (!scope) return;
      setScope({ ...scope, ...patch });
    },
    [scope],
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

  const saveScope = async () => {
    if (!scope) return;
    setScopeSaveMsg(null);
    try {
      const saved = await saveScopeSettings(scope);
      setScope(saved);
      setScopeSaveMsg(UI.savedScopeOk);
    } catch (e) {
      setScopeSaveMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const saveOk = saveMsg?.startsWith("已保存") ?? false;
  const scopeSaveOk = scopeSaveMsg?.includes("已保存") ?? false;
  const visibleFriends = useMemo(() => friendTargets.filter((item) => includesKeyword(item, friendKeyword)), [friendTargets, friendKeyword]);
  const visibleGroups = useMemo(() => groupTargets.filter((item) => includesKeyword(item, groupKeyword)), [groupTargets, groupKeyword]);

  const activePrivateList =
    scope?.private_mode === "whitelist" ? scope.private_whitelist : scope?.private_mode === "blacklist" ? scope.private_blacklist : [];
  const activeGroupList =
    scope?.group_mode === "whitelist" ? scope.group_whitelist : scope?.group_mode === "blacklist" ? scope.group_blacklist : [];

  const togglePrivateTarget = (id: string) => {
    if (!scope) return;
    if (scope.private_mode === "all") return;
    if (scope.private_mode === "whitelist") {
      const exists = scope.private_whitelist.includes(id);
      updateScope({ private_whitelist: exists ? scope.private_whitelist.filter((x) => x !== id) : [...scope.private_whitelist, id] });
      return;
    }
    const exists = scope.private_blacklist.includes(id);
    updateScope({ private_blacklist: exists ? scope.private_blacklist.filter((x) => x !== id) : [...scope.private_blacklist, id] });
  };

  const toggleGroupTarget = (id: string) => {
    if (!scope) return;
    if (scope.group_mode === "all") return;
    if (scope.group_mode === "whitelist") {
      const exists = scope.group_whitelist.includes(id);
      updateScope({ group_whitelist: exists ? scope.group_whitelist.filter((x) => x !== id) : [...scope.group_whitelist, id] });
      return;
    }
    const exists = scope.group_blacklist.includes(id);
    updateScope({ group_blacklist: exists ? scope.group_blacklist.filter((x) => x !== id) : [...scope.group_blacklist, id] });
  };

  if (loadError && (!doc || !scope)) {
    return (
      <div className="app app--center">
        <div className="error-state card">
          <h1 className="error-state__title">{UI.loadFailed}</h1>
          <p className="error">{loadError}</p>
          <p className="muted error-state__hint">{UI.startBackend}</p>
        </div>
      </div>
    );
  }

  if (!doc || !scope) {
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
            <span className="header__logo" aria-hidden>MP</span>
            <div className="header__text">
              <h1>{UI.appTitle}</h1>
              <p className="muted header__subtitle">{headerSubtitleContent(UI.appSubtitle)}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <nav className="card section-card top-tabs" aria-label="页面标签">
        <button type="button" className={activeTab === "rules" ? "top-tab active" : "top-tab"} onClick={() => setActiveTab("rules")}>
          {UI.tabRules}
        </button>
        <button type="button" className={activeTab === "scope" ? "top-tab active" : "top-tab"} onClick={() => setActiveTab("scope")}>
          {UI.tabScope}
        </button>
      </nav>

      {activeTab === "rules" ? (
        <>
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
                    <button type="button" className={i === selected ? "rule-tab active" : "rule-tab"} onClick={() => setSelected(i)}>
                      {r.id?.trim() ? r.id : UI.ruleUntitled(i + 1)}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="stack sidebar-actions">
                <button type="button" className="btn btn-primary btn-block" onClick={() => void saveEditor()}>{UI.saveFile}</button>
                {saveMsg ? <span className={`save-feedback ${saveOk ? "ok" : "error"}`}>{saveMsg}</span> : null}
              </div>
            </aside>

            <main className="main card section-card">
              {!rule ? (
                <p className="empty-hint">{UI.noRules}</p>
              ) : (
                <>
                  <div className="row spread main-head">
                    <h2>{UI.editRule}：<span className="rule-id">{rule.id || UI.ruleUntitled(selected + 1)}</span></h2>
                    <div className="main-head__actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-danger-ghost main-head__delete"
                        onClick={() => setDeleteConfirmOpen(true)}
                      >
                        {UI.deleteRule}
                      </button>
                      {deleteConfirmOpen ? (
                        <div className="delete-confirm-inline">
                          <span>{UI.deleteConfirm}</span>
                          <div className="delete-confirm-inline__actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-danger-ghost"
                              onClick={() => {
                                const next = doc.rules.filter((_, i) => i !== selected);
                                setDoc({ ...doc, rules: next });
                                setSelected(Math.max(0, selected - 1));
                                setDeleteConfirmOpen(false);
                              }}
                            >
                              确认
                            </button>
                            <button type="button" className="btn btn-sm" onClick={() => setDeleteConfirmOpen(false)}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <label className="field-inline-check main-head__enable">
                        <input type="checkbox" checked={rule.enabled} onChange={(e) => updateRule({ enabled: e.target.checked })} />
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
                      <input type="number" value={rule.priority} onChange={(e) => updateRule({ priority: Number(e.target.value) || 0 })} />
                    </label>
                    <label className="field-stack">
                      <span className="label-text">{UI.fieldMaxMatches}</span>
                      <input
                        type="number"
                        value={rule.limits?.max_matches ?? 0}
                        onChange={(e) =>
                          updateRule({
                            limits: {
                              ...rule.limits,
                              max_matches: Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0,
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
        </>
      ) : (
        <section className="card section-card scope-panel">
          <div className="section-head">
            <h2>{UI.scopeSection}</h2>
          </div>
          <p className="muted section-desc">{UI.scopeHint}</p>

          <div className="scope-grid">
            <label className="field-inline-check scope-toggle">
              <input type="checkbox" checked={scope.enable_private} onChange={(e) => updateScope({ enable_private: e.target.checked })} />
              <span>{UI.scopeEnablePrivate}</span>
            </label>
            <label className="field-inline-check scope-toggle">
              <input type="checkbox" checked={scope.enable_group} onChange={(e) => updateScope({ enable_group: e.target.checked })} />
              <span>{UI.scopeEnableGroup}</span>
            </label>
          </div>

          <div className="scope-two-col">
            <fieldset className="fieldset">
              <legend>{UI.scopePrivateMode}</legend>
              <div className="fieldset-body">
                <label className="field-stack">
                  <span className="label-text">{UI.scopePrivateMode}</span>
                  <select value={scope.private_mode} onChange={(e) => updateScope({ private_mode: e.target.value as ScopeMode })}>
                    <option value="all">{UI.scopeModeAll}</option>
                    <option value="whitelist">{UI.scopeModeWhitelist}</option>
                    <option value="blacklist">{UI.scopeModeBlacklist}</option>
                  </select>
                </label>
                <p className="muted scope-mode-hint">{modeHint(scope.private_mode)}</p>
                <p className="muted">{UI.scopePickHint}</p>
                <label className="field scope-search-field">
                  <span className="field-label">{UI.scopeSearchFriend}</span>
                  <input value={friendKeyword} onChange={(e) => setFriendKeyword(e.target.value)} />
                </label>
                <p className="muted scope-selected-count">{UI.scopeSelectedCount(activePrivateList.length)}</p>
                <div className="scope-target-list" aria-disabled={scope.private_mode === "all"}>
                  {visibleFriends.length ? (
                    visibleFriends.map((item) => {
                      const checked = activePrivateList.includes(item.id);
                      return (
                        <label key={item.id} className={checked ? "scope-target-card checked" : "scope-target-card"}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={scope.private_mode === "all"}
                            onChange={() => togglePrivateTarget(item.id)}
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="muted">{UI.scopeNoTarget}</p>
                  )}
                </div>
              </div>
            </fieldset>

            <fieldset className="fieldset">
              <legend>{UI.scopeGroupMode}</legend>
              <div className="fieldset-body">
                <label className="field-stack">
                  <span className="label-text">{UI.scopeGroupMode}</span>
                  <select value={scope.group_mode} onChange={(e) => updateScope({ group_mode: e.target.value as ScopeMode })}>
                    <option value="all">{UI.scopeModeAll}</option>
                    <option value="whitelist">{UI.scopeModeWhitelist}</option>
                    <option value="blacklist">{UI.scopeModeBlacklist}</option>
                  </select>
                </label>
                <p className="muted scope-mode-hint">{modeHint(scope.group_mode)}</p>
                <p className="muted">{UI.scopePickHint}</p>
                <label className="field scope-search-field">
                  <span className="field-label">{UI.scopeSearchGroup}</span>
                  <input value={groupKeyword} onChange={(e) => setGroupKeyword(e.target.value)} />
                </label>
                <p className="muted scope-selected-count">{UI.scopeSelectedCount(activeGroupList.length)}</p>
                <div className="scope-target-list" aria-disabled={scope.group_mode === "all"}>
                  {visibleGroups.length ? (
                    visibleGroups.map((item) => {
                      const checked = activeGroupList.includes(item.id);
                      return (
                        <label key={item.id} className={checked ? "scope-target-card checked" : "scope-target-card"}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={scope.group_mode === "all"}
                            onChange={() => toggleGroupTarget(item.id)}
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="muted">{UI.scopeNoTarget}</p>
                  )}
                </div>
              </div>
            </fieldset>
          </div>

          <div className="scope-actions">
            <button type="button" className="btn btn-primary" onClick={() => void saveScope()}>{UI.saveScope}</button>
            {scopeSaveMsg ? <span className={`save-feedback ${scopeSaveOk ? "ok" : "error"}`}>{scopeSaveMsg}</span> : null}
          </div>
        </section>
      )}

      <footer className="app-footer muted">{UI.footer}</footer>
    </div>
  );
}
