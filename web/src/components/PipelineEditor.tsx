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
import { GUARD_CMP_BY_KIND, GUARD_KIND_OPTIONS, MODULE_OPTIONS, UI, moduleLabel } from "../i18n-ui";
import type { PipelineStepUI } from "../types";
import { newKey } from "../types";

const MODULE_VALUES = new Set(MODULE_OPTIONS.map((o) => o.value));

const GUARD_OUTCOMES = [
  { value: "pass", label: UI.guardOutcomePass },
  { value: "block", label: UI.guardOutcomeBlock },
  { value: "stop_rule", label: UI.guardOutcomeStopRule },
] as const;

type GuardKind = "date" | "number" | "length";
type GuardCmp = "older_than" | "gt" | "gte" | "lt" | "lte" | "eq" | "ne";

function parseGuardOp(op: string): { kind: GuardKind; cmp: GuardCmp } {
  if (op === "date_older_than") {
    return { kind: "date", cmp: "older_than" };
  }
  if (op.startsWith("number_")) {
    return { kind: "number", cmp: op.slice("number_".length) as GuardCmp };
  }
  if (op.startsWith("length_")) {
    return { kind: "length", cmp: op.slice("length_".length) as GuardCmp };
  }
  return { kind: "date", cmp: "older_than" };
}

function buildGuardOp(kind: GuardKind, cmp: GuardCmp): string {
  if (kind === "date") {
    return "date_older_than";
  }
  return `${kind}_${cmp}`;
}

function guardDefaults(op: string): Record<string, unknown> {
  const base = {
    op,
    in: "region",
    when_true: "pass",
    when_false: "pass",
  };
  if (op === "date_older_than") {
    return { ...base, days: 7, format: "%Y-%m-%d", if_no_date: "false" };
  }
  if (op.startsWith("number_")) {
    return { ...base, value: 0, regex: "", if_missing: "false" };
  }
  if (op.startsWith("length_")) {
    return { ...base, value: 0 };
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
        ...guardDefaults("date_older_than"),
        when_true: "block",
        when_false: "pass",
      };
    default:
      return {};
  }
}

function SortableRow({
  step,
  onChange,
  onRemove,
}: {
  step: PipelineStepUI;
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
            {MODULE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-ghost pipeline-row-remove" onClick={onRemove}>
          {UI.removeStep}
        </button>
      </div>
      <div className="pipeline-row-bottom">
        <ModuleConfigFields step={step} onChange={onChange} />
      </div>
    </div>
  );
}

function ModuleConfigFields({
  step,
  onChange,
}: {
  step: PipelineStepUI;
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
      return <GuardConfigFields c={c} set={set} />;
    default:
      return <p className="muted">{UI.cfgNone}</p>;
  }
}

function GuardConfigFields({
  c,
  set,
}: {
  c: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
}) {
  const op = String(c.op ?? "date_older_than");
  const { kind, cmp } = parseGuardOp(op);
  const cmpOptions = GUARD_CMP_BY_KIND[kind] ?? GUARD_CMP_BY_KIND.date;
  const isDate = kind === "date";
  const isNumber = kind === "number";
  const isLength = kind === "length";

  const inSelect = (
    <label className="field-stack">
      <span className="label-text">{UI.fieldRegionKind}</span>
      <select value={String(c.in ?? "region")} onChange={(e) => set({ in: e.target.value })}>
        <option value="region">{UI.guardCondInRegion}</option>
        <option value="message">{UI.guardCondInMessage}</option>
      </select>
    </label>
  );

  return (
    <div className="field-stack field-stack--block">
      <div className="form-grid-regex">
        <label className="field-stack">
          <span className="label-text">{UI.guardCondKindType}</span>
          <select
            value={kind}
            onChange={(e) => {
              const nextKind = e.target.value as GuardKind;
              const nextCmp = (GUARD_CMP_BY_KIND[nextKind] ?? GUARD_CMP_BY_KIND.date)[0].value as GuardCmp;
              const nextOp = buildGuardOp(nextKind, nextCmp);
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
          <select
            value={cmp}
            onChange={(e) => {
              const nextCmp = e.target.value as GuardCmp;
              set({ op: buildGuardOp(kind, nextCmp) });
            }}
          >
            {cmpOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isDate && (
        <>
          <label className="field-stack">
            <span className="label-text">{UI.guardCondDays}</span>
            <input
              type="number"
              min={0}
              value={String(c.days ?? 7)}
              onChange={(e) => set({ days: Number(e.target.value) })}
            />
          </label>
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
          {inSelect}
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
          {inSelect}
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
      {isLength && (
        <>
          <label className="field-stack">
            <span className="label-text">{UI.guardCondThreshold}</span>
            <input
              type="number"
              min={0}
              value={String(c.value ?? 0)}
              onChange={(e) => set({ value: Number(e.target.value) })}
            />
          </label>
          {inSelect}
        </>
      )}
      <div className="form-grid-regex">
        <label className="field-stack">
          <span className="label-text">{UI.guardWhenTrue}</span>
          <select
            value={String(c.when_true ?? "pass")}
            onChange={(e) => set({ when_true: e.target.value })}
          >
            {GUARD_OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-stack">
          <span className="label-text">{UI.guardWhenFalse}</span>
          <select
            value={String(c.when_false ?? "pass")}
            onChange={(e) => set({ when_false: e.target.value })}
          >
            {GUARD_OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted pipeline-config-hint">{UI.guardHint}</p>
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

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = pipeline.findIndex((x) => x._key === active.id);
    const newIndex = pipeline.findIndex((x) => x._key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(pipeline, oldIndex, newIndex));
  };

  const add = () => {
    const mid = "noop";
    onChange([...pipeline, { _key: newKey(), id: mid, config: defaultConfig(mid) }]);
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
                onChange={(s) => {
                  const next = [...pipeline];
                  next[i] = s;
                  onChange(next);
                }}
                onRemove={() => onChange(pipeline.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
