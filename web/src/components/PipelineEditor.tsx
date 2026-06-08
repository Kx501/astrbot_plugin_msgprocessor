import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import {
  GUARD_CMP_BY_KIND,
  GUARD_DATE_OP_OPTIONS,
  GUARD_KIND_OPTIONS,
  MODULE_GROUPS,
  MODULE_OPTIONS,
  PLACEHOLDER_PRESET_OPTIONS,
  UI,
  moduleLabel,
} from "../i18n-ui";
import type { PipelineStepUI, WindowAnchor } from "../types";
import { newKey, normalizePipelineLabels } from "../types";

const MODULE_VALUES = new Set(MODULE_OPTIONS.map((o) => o.value));

const GUARD_OUTCOMES = [
  { value: "pass", label: UI.guardOutcomePass },
  { value: "block", label: UI.guardOutcomeBlock },
  { value: "halt", label: UI.guardOutcomeHalt },
  { value: "goto", label: UI.guardOutcomeGoto },
] as const;

function emptyAnchor(): WindowAnchor {
  return { literal: "", occurrence: 0, inclusive: false };
}

const DEFAULT_PLACEHOLDER_PRESETS = ["bracket", "mustache"];

function defaultPlaceholderConfig(): Record<string, unknown> {
  return {
    presets: [...DEFAULT_PLACEHOLDER_PRESETS],
    custom_patterns: [],
    include_empty: true,
  };
}

function placeholderMatcherConfig(): Record<string, unknown> {
  return {
    type: "placeholder",
    ...defaultPlaceholderConfig(),
  };
}

function pipelineGotoLabels(pipeline: PipelineStepUI[], excludeKey: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const step of pipeline) {
    if (step._key === excludeKey) {
      continue;
    }
    const raw = typeof step.label === "string" ? step.label.trim() : "";
    if (!raw || seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

type GuardKind = "date" | "number";
type GuardNumberCmp = "gt" | "gte" | "lt" | "lte" | "eq" | "ne";
type GuardDateOp = "date_before_at" | "date_after_at" | "date_within_days" | "date_outside_days";

const GUARD_DATE_OPS = new Set<string>(GUARD_DATE_OP_OPTIONS.map((o) => o.value));

function isGuardDateOp(op: string): op is GuardDateOp {
  return GUARD_DATE_OPS.has(op);
}

function parseGuardOp(op: string): { kind: GuardKind; numberCmp: GuardNumberCmp; dateOp: GuardDateOp } {
  if (op.startsWith("number_")) {
    return {
      kind: "number",
      numberCmp: op.slice("number_".length) as GuardNumberCmp,
      dateOp: "date_outside_days",
    };
  }
  return {
    kind: "date",
    numberCmp: "gt",
    dateOp: isGuardDateOp(op) ? op : "date_outside_days",
  };
}

function guardDefaults(op: string): Record<string, unknown> {
  const base = {
    op,
    when_true: "pass",
    when_false: "pass",
  };
  if (op === "date_before_at" || op === "date_after_at") {
    return { ...base, op, at: "2020-01-01", format: "%Y-%m-%d", regex: "", if_no_date: "false" };
  }
  if (op === "date_within_days" || op === "date_outside_days") {
    return { ...base, op, days: 7, format: "%Y-%m-%d", regex: "", if_no_date: "false" };
  }
  if (op.startsWith("number_")) {
    return { ...base, value: 0, regex: "", if_missing: "false" };
  }
  return base;
}

export function defaultConfig(mid: string): Record<string, unknown> {
  switch (mid) {
    case "replace":
      return { from: "", to: "", whole_from_empty: false, regex: false, regex_flags: "" };
    case "translate_llm":
      return { prefix: "[译]" };
    case "append":
      return { text: "" };
    case "prepend":
      return { prefix: "" };
    case "delete":
      return { from: "", whole_from_empty: false };
    case "split":
      return { marker: "[SPLIT]", delete_marker: true, trim_part_start: true, trim_part_end: true };
    case "guard":
      return {
        ...guardDefaults("date_outside_days"),
        when_true: "block",
        when_false: "pass",
      };
    case "locate":
      return {
        matcher: { type: "simple", op: "contains", value: "", ignore_case: false },
        region: { kind: "match" },
      };
    case "placeholder_block":
    case "placeholder_delete":
      return defaultPlaceholderConfig();
    case "placeholder_replace":
      return { ...defaultPlaceholderConfig(), replacement: "" };
    default:
      return {};
  }
}

function parseCustomPatterns(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function PlaceholderConfigFields({
  c,
  set,
  showReplacement = false,
}: {
  c: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  showReplacement?: boolean;
}) {
  const presets = Array.isArray(c.presets)
    ? (c.presets as string[]).map((s) => String(s))
    : [...DEFAULT_PLACEHOLDER_PRESETS];
  const customText = parseCustomPatterns(c.custom_patterns).join("\n");

  const togglePreset = (value: string, checked: boolean) => {
    const next = new Set(presets);
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    const ordered = PLACEHOLDER_PRESET_OPTIONS.map((o) => o.value).filter((v) => next.has(v));
    set({ presets: ordered.length > 0 ? ordered : [...DEFAULT_PLACEHOLDER_PRESETS] });
  };

  return (
    <div className="field-stack field-stack--block">
      <div className="field-stack">
        <span className="label-text">{UI.cfgPlaceholderPresets}</span>
        <div className="pipeline-check-row">
          {PLACEHOLDER_PRESET_OPTIONS.map((o) => (
            <label key={o.value} className="field-inline-check">
              <input
                type="checkbox"
                checked={presets.includes(o.value)}
                onChange={(e) => togglePreset(o.value, e.target.checked)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="field-stack field-stack--block">
        <span className="label-text">{UI.cfgPlaceholderCustomPatterns}</span>
        <textarea
          rows={3}
          value={customText}
          onChange={(e) => set({ custom_patterns: parseCustomPatterns(e.target.value) })}
        />
      </label>
      <label className="field-inline-check">
        <input
          type="checkbox"
          checked={Boolean(c.include_empty ?? true)}
          onChange={(e) => set({ include_empty: e.target.checked })}
        />
        <span>{UI.cfgPlaceholderIncludeEmpty}</span>
      </label>
      {showReplacement ? (
        <label className="field-stack field-stack--block">
          <span className="label-text">{UI.cfgPlaceholderReplacement}</span>
          <input
            value={String(c.replacement ?? "")}
            onChange={(e) => set({ replacement: e.target.value })}
          />
        </label>
      ) : null}
      <p className="muted pipeline-config-hint">{UI.cfgPlaceholderHint}</p>
    </div>
  );
}

function AnchorFields({
  label,
  value,
  onChange,
  ignoreSameLine,
  onIgnoreSameLineChange,
  ignoreSameLineLabel,
}: {
  label: string;
  value: WindowAnchor;
  onChange: (a: WindowAnchor) => void;
  ignoreSameLine: boolean;
  onIgnoreSameLineChange: (v: boolean) => void;
  ignoreSameLineLabel: string;
}) {
  return (
    <div className="anchor-block">
      <h3>{label}</h3>
      <label className="field-stack field-stack--block">
        <span className="label-text">{UI.fieldLiteral}</span>
        <input value={value.literal} onChange={(e) => onChange({ ...value, literal: e.target.value })} />
      </label>
      <div className="anchor-row-secondary">
        <label className="field-stack field-stack--occurrence">
          <span className="label-text">{UI.fieldOccurrence}</span>
          <input
            type="number"
            value={value.occurrence}
            onChange={(e) => onChange({ ...value, occurrence: Number(e.target.value) || 0 })}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="field-inline-check field-inline-check--solo">
            <input
              type="checkbox"
              checked={value.inclusive}
              onChange={(e) => onChange({ ...value, inclusive: e.target.checked })}
            />
            <span>{UI.fieldInclusive}</span>
          </label>
          <label className="field-inline-check field-inline-check--solo">
            <input
              type="checkbox"
              checked={ignoreSameLine}
              onChange={(e) => onIgnoreSameLineChange(e.target.checked)}
            />
            <span>{ignoreSameLineLabel}</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function LocateConfigFields({
  config,
  set,
}: {
  config: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
}) {
  const matcher = (config.matcher as Record<string, unknown> | undefined) ?? {
    type: "simple",
    op: "contains",
    value: "",
    ignore_case: false,
  };
  const region = (config.region as { kind: string; index?: number; name?: string } | undefined) ?? {
    kind: "match",
  };

  const setMatcher = (m: Record<string, unknown>) => set({ matcher: m });
  const setRegion = (r: { kind: string; index?: number; name?: string }) => set({ region: r });

  const mtype = String(matcher.type ?? "regex");

  const locateTypeSelect = (
    <label className="field-stack field-stack--block">
      <span className="label-text">{UI.locateType}</span>
      <select
        value={mtype}
        onChange={(e) => {
          const t = e.target.value;
          if (t === "regex") {
            setMatcher({ type: "regex", pattern: "", flags: [] });
          } else if (t === "simple") {
            setMatcher({ type: "simple", op: "contains", value: "", ignore_case: false });
          } else if (t === "anchor_slice") {
            setMatcher({
              type: "anchor_slice",
              start: emptyAnchor(),
              end: emptyAnchor(),
              ignore_anchor_line: false,
              ignore_start_anchor_line: false,
              ignore_end_anchor_line: false,
            });
          } else if (t === "placeholder") {
            setMatcher(placeholderMatcherConfig());
          }
        }}
      >
        <option value="regex">{UI.locateRegex}</option>
        <option value="simple">{UI.locateSimple}</option>
        <option value="placeholder">{UI.locatePlaceholder}</option>
        <option value="anchor_slice">{UI.locateAnchorSlice}</option>
      </select>
    </label>
  );

  return (
    <div className="step-body step-body--match">
      {mtype === "anchor_slice" ? (
        <div className="match-anchor-matcher">
          <div className="match-matcher-head">{locateTypeSelect}</div>
          <p className="match-field-hint">{UI.locateAnchorSliceHint}</p>
          <div className="window-grid">
            <AnchorFields
              label={UI.anchorStart}
              value={(matcher.start as WindowAnchor | undefined) ?? emptyAnchor()}
              onChange={(start) => setMatcher({ ...matcher, start })}
              ignoreSameLine={Boolean(matcher.ignore_start_anchor_line)}
              onIgnoreSameLineChange={(v) => setMatcher({ ...matcher, ignore_start_anchor_line: v })}
              ignoreSameLineLabel={UI.anchorIgnoreSameLine}
            />
            <AnchorFields
              label={UI.anchorEnd}
              value={(matcher.end as WindowAnchor | undefined) ?? emptyAnchor()}
              onChange={(end) => setMatcher({ ...matcher, end })}
              ignoreSameLine={Boolean(matcher.ignore_end_anchor_line)}
              onIgnoreSameLineChange={(v) => setMatcher({ ...matcher, ignore_end_anchor_line: v })}
              ignoreSameLineLabel={UI.anchorIgnoreSameLine}
            />
          </div>
        </div>
      ) : (
        <div className="match-matcher-head">{locateTypeSelect}</div>
      )}
      {mtype === "regex" ? (
        <div className="form-grid-regex">
          <label className="field-stack span-cols-2">
            <span className="label-text">{UI.fieldPattern}</span>
            <input
              value={String(matcher.pattern ?? "")}
              onChange={(e) => setMatcher({ ...matcher, pattern: e.target.value })}
            />
          </label>
          <label className="field-stack span-cols-2">
            <span className="label-text">{UI.fieldFlags}</span>
            <input
              placeholder="例如：IGNORECASE, MULTILINE, DOTALL"
              value={((matcher.flags as string[] | undefined) ?? []).join(", ")}
              onChange={(e) => {
                const flags = e.target.value
                  .split(/[,，]/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                setMatcher({ ...matcher, flags });
              }}
            />
          </label>
        </div>
      ) : null}
      {mtype === "simple" ? (
        <div className="form-grid-matcher-simple">
          <label className="field-stack">
            <span className="label-text">{UI.fieldOp}</span>
            <select
              value={String(matcher.op ?? "contains")}
              onChange={(e) => setMatcher({ ...matcher, op: e.target.value })}
            >
              <option value="equals">{UI.opEquals}</option>
              <option value="contains">{UI.opContains}</option>
              <option value="not_contains">{UI.opNotContains}</option>
              <option value="startswith">{UI.opStarts}</option>
              <option value="endswith">{UI.opEnds}</option>
            </select>
          </label>
          <label className="field-stack">
            <span className="label-text">{UI.fieldValue}</span>
            <input
              value={String(matcher.value ?? "")}
              onChange={(e) => setMatcher({ ...matcher, value: e.target.value })}
            />
          </label>
          <label className="field-inline-check field-inline-check--align-input">
            <input
              type="checkbox"
              checked={Boolean(matcher.ignore_case)}
              onChange={(e) => setMatcher({ ...matcher, ignore_case: e.target.checked })}
            />
            <span>{UI.fieldIgnoreCase}</span>
          </label>
        </div>
      ) : null}
      {mtype === "placeholder" ? (
        <>
          <PlaceholderConfigFields
            c={matcher}
            set={(patch) => setMatcher({ ...matcher, ...patch })}
          />
          <p className="muted pipeline-config-hint">{UI.cfgPlaceholderLocateHint}</p>
        </>
      ) : null}

      <div className="form-grid-region step-match-region">
        <label className="field-stack">
          <span className="label-text">{UI.fieldRegionKind}</span>
          <select
            value={String(region.kind ?? "match")}
            onChange={(e) => {
              const k = e.target.value;
              if (k === "group") {
                setRegion({
                  kind: "group",
                  index: region.kind === "group" ? region.index ?? 1 : 1,
                  name: region.kind === "group" ? region.name : "",
                });
              } else {
                setRegion({ kind: "match" });
              }
            }}
          >
            <option value="match">{UI.regionMatch}</option>
            <option value="group">{UI.regionGroup}</option>
          </select>
        </label>
        {region.kind === "group" ? (
          <>
            <label className="field-stack">
              <span className="label-text">{UI.fieldGroupIndex}</span>
              <input
                type="number"
                value={region.index ?? 0}
                onChange={(e) =>
                  setRegion({
                    ...region,
                    kind: "group",
                    index: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label className="field-stack">
              <span className="label-text">{UI.fieldGroupName}</span>
              <input
                value={String(region.name ?? "")}
                onChange={(e) => setRegion({ ...region, kind: "group", name: e.target.value })}
              />
            </label>
          </>
        ) : null}
      </div>
      <p className="muted pipeline-config-hint">{UI.locateStepHint}</p>
    </div>
  );
}

function SortableRow({
  step,
  pipeline,
  onChange,
  onRemove,
}: {
  step: PipelineStepUI;
  pipeline: PipelineStepUI[];
  onChange: (s: PipelineStepUI) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step._key,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="pipeline-row">
      <div className="pipeline-row-top">
        <button type="button" className="pipeline-drag" {...attributes} {...listeners} aria-label={UI.dragSort}>
          ⋮⋮
        </button>
        <label className="field-stack field-stack--grow">
          <span className="label-text">{UI.moduleLabel}</span>
          <select
            value={step.id}
            onChange={(e) => {
              const id = e.target.value;
              onChange({ ...step, id, config: defaultConfig(id) });
            }}
          >
            {typeof step.id === "string" && !MODULE_VALUES.has(step.id) && (
              <option value={step.id}>{moduleLabel(step.id)}</option>
            )}
            {MODULE_GROUPS.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {MODULE_OPTIONS.filter((o) => o.group === g.id).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
            {MODULE_OPTIONS.filter((o) => !o.group).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field-stack pipeline-step-label pipeline-step-label--auto">
          <span className="label-text">{UI.stepLabelField}</span>
          <span className="pipeline-step-label-value" title={UI.guardGotoHint}>
            {UI.stepLabelAuto(String(step.label ?? ""))}
          </span>
        </div>
        <button type="button" className="btn btn-ghost pipeline-row-remove" onClick={onRemove}>
          {UI.removeStep}
        </button>
      </div>
      <div className="pipeline-row-bottom">
        <ModuleConfigFields step={step} pipeline={pipeline} onChange={onChange} />
      </div>
    </div>
  );
}

function ModuleConfigFields({
  step,
  pipeline,
  onChange,
}: {
  step: PipelineStepUI;
  pipeline: PipelineStepUI[];
  onChange: (s: PipelineStepUI) => void;
}) {
  const c = step.config;
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...step, config: { ...step.config, ...patch } });

  switch (step.id) {
    case "replace":
      return (
        <div className="pipeline-config-grid">
          <label className="field-stack">
            <span className="label-text">{UI.cfgFrom}</span>
            <input
              value={String(c.from ?? "")}
              onChange={(e) => set({ from: e.target.value })}
            />
          </label>
          <label className="field-stack">
            <span className="label-text">{UI.cfgTo}</span>
            <input value={String(c.to ?? "")} onChange={(e) => set({ to: e.target.value })} />
          </label>
          <label className="field-inline-check field-inline-check--align-input">
            <input
              type="checkbox"
              checked={Boolean(c.whole_from_empty)}
              onChange={(e) => set({ whole_from_empty: e.target.checked })}
            />
            <span>{UI.cfgWholeFromEmpty}</span>
          </label>
          <label className="field-inline-check field-inline-check--align-input">
            <input
              type="checkbox"
              checked={Boolean(c.regex)}
              onChange={(e) => set({ regex: e.target.checked })}
            />
            <span>{UI.cfgReplaceRegex}</span>
          </label>
          <label className="field-stack">
            <span className="label-text">{UI.cfgRegexFlags}</span>
            <input
              placeholder="例如：IGNORECASE, MULTILINE, DOTALL"
              value={String(c.regex_flags ?? "")}
              onChange={(e) => set({ regex_flags: e.target.value })}
            />
          </label>
        </div>
      );
    case "translate_llm":
      return (
        <div className="field-stack field-stack--block">
          <label className="field-stack field-stack--block">
            <span className="label-text">{UI.cfgTranslateFallbackPrefix}</span>
            <input
              value={String(c.prefix ?? "")}
              onChange={(e) => set({ prefix: e.target.value })}
            />
          </label>
          <p className="muted pipeline-config-hint">{UI.cfgTranslateLlmHint}</p>
        </div>
      );
    case "append":
      return (
        <div className="field-stack field-stack--block">
          <label className="field-stack field-stack--block">
            <span className="label-text">{UI.cfgText}</span>
            <input value={String(c.text ?? "")} onChange={(e) => set({ text: e.target.value })} />
          </label>
          <p className="muted pipeline-config-hint">{UI.cfgLiteralEscapeHint}</p>
        </div>
      );
    case "prepend":
      return (
        <div className="field-stack field-stack--block">
          <label className="field-stack field-stack--block">
            <span className="label-text">{UI.cfgPrefix}</span>
            <input value={String(c.prefix ?? "")} onChange={(e) => set({ prefix: e.target.value })} />
          </label>
          <p className="muted pipeline-config-hint">{UI.cfgLiteralEscapeHint}</p>
        </div>
      );
    case "delete":
      return (
        <div className="pipeline-config-grid">
          <label className="field-stack">
            <span className="label-text">{UI.cfgDeleteFrom}</span>
            <input value={String(c.from ?? "")} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className="field-inline-check field-inline-check--align-input">
            <input
              type="checkbox"
              checked={Boolean(c.whole_from_empty)}
              onChange={(e) => set({ whole_from_empty: e.target.checked })}
            />
            <span>{UI.cfgWholeFromEmpty}</span>
          </label>
        </div>
      );
    case "split":
      return (
        <div className="field-stack field-stack--block">
          <label className="field-stack field-stack--block">
            <span className="label-text">{UI.cfgSplitMarker}</span>
            <input value={String(c.marker ?? "")} onChange={(e) => set({ marker: e.target.value })} />
          </label>
          <div className="pipeline-check-row">
            <label className="field-inline-check">
              <input
                type="checkbox"
                checked={Boolean(c.delete_marker ?? true)}
                onChange={(e) => set({ delete_marker: e.target.checked })}
              />
              <span>{UI.cfgDeleteMarker}</span>
            </label>
            <label className="field-inline-check">
              <input
                type="checkbox"
                checked={Boolean(c.trim_part_start ?? true)}
                onChange={(e) => set({ trim_part_start: e.target.checked })}
              />
              <span>{UI.cfgTrimPartStart}</span>
            </label>
            <label className="field-inline-check">
              <input
                type="checkbox"
                checked={Boolean(c.trim_part_end ?? true)}
                onChange={(e) => set({ trim_part_end: e.target.checked })}
              />
              <span>{UI.cfgTrimPartEnd}</span>
            </label>
          </div>
          <p className="muted pipeline-config-hint">{UI.cfgSplitHint}</p>
        </div>
      );
    case "guard":
      return (
        <GuardConfigFields
          c={c}
          set={set}
          pipeline={pipeline}
          stepKey={step._key}
        />
      );
    case "locate":
      return <LocateConfigFields config={c} set={set} />;
    case "placeholder_block":
    case "placeholder_delete":
      return <PlaceholderConfigFields c={c} set={set} />;
    case "placeholder_replace":
      return <PlaceholderConfigFields c={c} set={set} showReplacement />;
    default:
      return <p className="muted">{UI.cfgNone}</p>;
  }
}

function GuardOutcomeField({
  label,
  outcomeKey,
  gotoKey,
  c,
  set,
  gotoLabels,
}: {
  label: string;
  outcomeKey: "when_true" | "when_false";
  gotoKey: "when_true_goto" | "when_false_goto";
  c: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  gotoLabels: string[];
}) {
  const outcome = String(c[outcomeKey] ?? "pass");
  return (
    <div className="field-stack">
      <span className="label-text">{label}</span>
      <select
        value={outcome}
        onChange={(e) => {
          const next = e.target.value;
          const patch: Record<string, unknown> = { [outcomeKey]: next };
          if (next !== "goto") {
            patch[gotoKey] = "";
          }
          set(patch);
        }}
      >
        {GUARD_OUTCOMES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {outcome === "goto" && (
        <select
          value={String(c[gotoKey] ?? "")}
          onChange={(e) => set({ [gotoKey]: e.target.value })}
        >
          <option value="">{UI.guardGotoUnset}</option>
          {gotoLabels.map((lab) => (
            <option key={lab} value={lab}>
              {lab}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function GuardConfigFields({
  c,
  set,
  pipeline,
  stepKey,
}: {
  c: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  pipeline: PipelineStepUI[];
  stepKey: string;
}) {
  const op = String(c.op ?? "date_outside_days");
  const { kind, numberCmp, dateOp } = parseGuardOp(op);
  const isDate = kind === "date";
  const isNumber = kind === "number";
  const isDaysDate = isDate && (dateOp === "date_within_days" || dateOp === "date_outside_days");
  const isAnchorDate = isDate && (dateOp === "date_before_at" || dateOp === "date_after_at");

  const gotoLabels = pipelineGotoLabels(pipeline, stepKey);

  return (
    <div className="field-stack field-stack--block">
      <div className="form-grid-regex">
        <label className="field-stack">
          <span className="label-text">{UI.guardCondKindType}</span>
          <select
            value={kind}
            onChange={(e) => {
              const nextKind = e.target.value as GuardKind;
              const nextOp = nextKind === "date" ? "date_outside_days" : "number_gt";
              set({
                ...guardDefaults(nextOp),
                when_true: c.when_true ?? "pass",
                when_false: c.when_false ?? "pass",
              });
            }}
          >
            {GUARD_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-stack">
          <span className="label-text">{UI.guardCondCmp}</span>
          {isDate ? (
            <select
              value={dateOp}
              onChange={(e) => {
                const nextOp = e.target.value as GuardDateOp;
                set({
                  ...guardDefaults(nextOp),
                  when_true: c.when_true ?? "pass",
                  when_false: c.when_false ?? "pass",
                });
              }}
            >
              {GUARD_DATE_OP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={numberCmp}
              onChange={(e) => {
                set({ op: `number_${e.target.value as GuardNumberCmp}` });
              }}
            >
              {(GUARD_CMP_BY_KIND.number ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>
      {isDaysDate && (
        <label className="field-stack">
          <span className="label-text">{UI.guardCondDays}</span>
          <input
            type="number"
            min={0}
            value={String(c.days ?? 7)}
            onChange={(e) => set({ days: Number(e.target.value) })}
          />
        </label>
      )}
      {isAnchorDate && (
        <label className="field-stack">
          <span className="label-text">{UI.guardCondAnchorAt}</span>
          <input
            value={String(c.at ?? "")}
            placeholder="2020-01-01"
            onChange={(e) => set({ at: e.target.value })}
          />
        </label>
      )}
      {isDate && (
        <>
          <label className="field-stack">
            <span className="label-text">{UI.guardCondFormat}</span>
            <input
              value={String(c.format ?? "%Y-%m-%d")}
              onChange={(e) => set({ format: e.target.value })}
            />
          </label>
          <label className="field-stack">
            <span className="label-text">{UI.guardCondDateRegex}</span>
            <input
              value={String(c.regex ?? "")}
              onChange={(e) => set({ regex: e.target.value })}
            />
          </label>
          <label className="field-inline-check">
            <input
              type="checkbox"
              checked={String(c.if_no_date ?? "false") === "true"}
              onChange={(e) => set({ if_no_date: e.target.checked ? "true" : "false" })}
            />
            <span>{UI.guardCondIfNoDate}</span>
          </label>
        </>
      )}
      {isNumber && (
        <>
          <label className="field-stack">
            <span className="label-text">{UI.guardCondThreshold}</span>
            <input
              type="number"
              step="any"
              value={String(c.value ?? 0)}
              onChange={(e) => set({ value: Number(e.target.value) })}
            />
          </label>
          <label className="field-stack">
            <span className="label-text">{UI.guardCondNumberRegex}</span>
            <input
              placeholder="例如：CVSS[:：]\\s*([0-9.]+)"
              value={String(c.regex ?? "")}
              onChange={(e) => set({ regex: e.target.value })}
            />
          </label>
          <label className="field-inline-check">
            <input
              type="checkbox"
              checked={String(c.if_missing ?? "false") === "true"}
              onChange={(e) => set({ if_missing: e.target.checked ? "true" : "false" })}
            />
            <span>{UI.guardCondIfMissing}</span>
          </label>
        </>
      )}
      <div className="form-grid-regex">
        <GuardOutcomeField
          label={UI.guardWhenTrue}
          outcomeKey="when_true"
          gotoKey="when_true_goto"
          c={c}
          set={set}
          gotoLabels={gotoLabels}
        />
        <GuardOutcomeField
          label={UI.guardWhenFalse}
          outcomeKey="when_false"
          gotoKey="when_false_goto"
          c={c}
          set={set}
          gotoLabels={gotoLabels}
        />
      </div>
      <p className="muted pipeline-config-hint">{UI.guardHint}</p>
      {(String(c.when_true) === "goto" || String(c.when_false) === "goto") && (
        <p className="muted pipeline-config-hint">{UI.guardGotoHint}</p>
      )}
    </div>
  );
}

export function PipelineEditor({
  pipeline,
  onChange,
}: {
  pipeline: PipelineStepUI[];
  onChange: (p: PipelineStepUI[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const emit = (next: PipelineStepUI[]) => onChange(normalizePipelineLabels(next));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = pipeline.findIndex((x) => x._key === active.id);
    const newIndex = pipeline.findIndex((x) => x._key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    emit(arrayMove(pipeline, oldIndex, newIndex));
  };

  const add = () => {
    const mid = "noop";
    emit([...pipeline, { _key: newKey(), id: mid, label: "", config: defaultConfig(mid) }]);
  };

  return (
    <div className="pipeline-editor">
      <div className="pipeline-toolbar">
        <button type="button" className="btn" onClick={add}>
          {UI.addModule}
        </button>
        <span className="muted">{UI.dragHint}</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={pipeline.map((s) => s._key)} strategy={verticalListSortingStrategy}>
          <div className="pipeline-list">
            {pipeline.map((step, i) => (
              <SortableRow
                key={step._key}
                step={step}
                pipeline={pipeline}
                onChange={(s) => {
                  const next = [...pipeline];
                  next[i] = s;
                  emit(next);
                }}
                onRemove={() => emit(pipeline.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
