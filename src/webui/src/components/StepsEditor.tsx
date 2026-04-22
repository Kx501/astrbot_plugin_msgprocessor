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
import { PipelineEditor } from "./PipelineEditor";
import { STEP_OPTIONS, UI, stepLabel } from "../i18n-ui";
import type { PipelineStepUI, RuleStepUI, WindowAnchor } from "../types";
import { newKey } from "../types";

const STEP_VALUES = new Set(STEP_OPTIONS.map((o) => o.value));

function emptyAnchor(): WindowAnchor {
  return { literal: "", occurrence: 0, inclusive: false };
}

export function defaultStepConfig(stepId: string): Record<string, unknown> {
  if (stepId === "match_block") {
    return {
      matcher: { type: "passthrough" },
      region: { kind: "match" },
      steps: [{ _key: newKey(), id: "noop", config: {} }],
    };
  }
  return {};
}

function AnchorFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WindowAnchor;
  onChange: (a: WindowAnchor) => void;
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
        <label className="field-inline-check field-inline-check--anchor">
          <input
            type="checkbox"
            checked={value.inclusive}
            onChange={(e) => onChange({ ...value, inclusive: e.target.checked })}
          />
          <span>{UI.fieldInclusive}</span>
        </label>
      </div>
    </div>
  );
}

function MatchBlockBody({
  config,
  setConfig,
}: {
  config: Record<string, unknown>;
  setConfig: (c: Record<string, unknown>) => void;
}) {
  const matcher = (config.matcher as Record<string, unknown> | undefined) ?? { type: "passthrough" };
  const region = (config.region as { kind: string; index?: number; name?: string } | undefined) ?? { kind: "match" };
  const setMatcher = (m: Record<string, unknown>) => setConfig({ ...config, matcher: m });
  const mtype = String(matcher.type ?? "regex");

  return (
    <div className="step-body step-body--match-block">
      <p className="match-field-hint">{UI.matchBlockHint}</p>
      <label className="field-stack field-stack--block">
        <span className="label-text">{UI.matcherType}</span>
        <select value={mtype} onChange={(e) => setMatcher({ ...matcher, type: e.target.value })}>
          <option value="regex">{UI.matcherRegex}</option>
          <option value="simple">{UI.matcherSimple}</option>
          <option value="passthrough">{UI.matcherPassthrough}</option>
          <option value="anchor_slice">{UI.matcherAnchorSlice}</option>
        </select>
      </label>

      {mtype === "regex" ? (
        <div className="pipeline-config-grid">
          <label className="field-stack">
            <span className="label-text">{UI.fieldPattern}</span>
            <input value={String(matcher.pattern ?? "")} onChange={(e) => setMatcher({ ...matcher, pattern: e.target.value })} />
          </label>
          <label className="field-stack">
            <span className="label-text">{UI.fieldFlags}</span>
            <input value={String((matcher.flags as string[] | undefined)?.join(", ") ?? "")} onChange={(e) => setMatcher({ ...matcher, flags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </label>
        </div>
      ) : null}

      {mtype === "simple" ? (
        <div className="pipeline-config-grid">
          <label className="field-stack">
            <span className="label-text">{UI.fieldOp}</span>
            <select value={String(matcher.op ?? "contains")} onChange={(e) => setMatcher({ ...matcher, op: e.target.value })}>
              <option value="equals">{UI.opEquals}</option>
              <option value="contains">{UI.opContains}</option>
              <option value="not_contains">{UI.opNotContains}</option>
              <option value="startswith">{UI.opStarts}</option>
              <option value="endswith">{UI.opEnds}</option>
            </select>
          </label>
          <label className="field-stack">
            <span className="label-text">{UI.fieldValue}</span>
            <input value={String(matcher.value ?? "")} onChange={(e) => setMatcher({ ...matcher, value: e.target.value })} />
          </label>
        </div>
      ) : null}

      {mtype === "anchor_slice" ? (
        <div className="window-grid">
          <AnchorFields label={UI.anchorStart} value={(matcher.start as WindowAnchor) ?? emptyAnchor()} onChange={(start) => setMatcher({ ...matcher, start })} />
          <AnchorFields label={UI.anchorEnd} value={(matcher.end as WindowAnchor) ?? emptyAnchor()} onChange={(end) => setMatcher({ ...matcher, end })} />
        </div>
      ) : null}

      <div className="pipeline-config-grid step-match-region">
        <label className="field-stack">
          <span className="label-text">{UI.fieldRegionKind}</span>
          <select
            value={String(region.kind ?? "match")}
            onChange={(e) => setConfig({ ...config, region: e.target.value === "group" ? { kind: "group", index: 1 } : { kind: "match" } })}
          >
            <option value="match">{UI.regionMatch}</option>
            <option value="group">{UI.regionGroup}</option>
          </select>
        </label>
      </div>

      <h4 className="step-nested-title">{UI.matchBlockInnerPipeline}</h4>
      <div className="step-body step-body--nested">
        <PipelineEditor
          pipeline={(config.steps as PipelineStepUI[] | undefined) ?? []}
          onChange={(p) => setConfig({ ...config, steps: p })}
        />
      </div>
    </div>
  );
}

function SortableStepRow({
  step,
  onChange,
  onRemove,
}: {
  step: RuleStepUI;
  onChange: (s: RuleStepUI) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step._key });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.88 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="pipeline-row step-row">
      <div className="pipeline-row-top">
        <button type="button" className="pipeline-drag" {...attributes} {...listeners} aria-label={UI.dragSort}>⋮⋮</button>
        <label className="field-stack field-stack--grow">
          <span className="label-text">{UI.stepTypeLabel}</span>
          <select value={step.id} onChange={(e) => onChange({ ...step, id: e.target.value, config: defaultStepConfig(e.target.value) })}>
            {typeof step.id === "string" && !STEP_VALUES.has(step.id) ? <option value={step.id}>{stepLabel(step.id)}</option> : null}
            {STEP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-ghost pipeline-row-remove" onClick={onRemove}>{UI.removeStep}</button>
      </div>
      <div className="pipeline-row-bottom">
        {step.id === "match_block" ? <MatchBlockBody config={step.config} setConfig={(c) => onChange({ ...step, config: c })} /> : null}
        {step.id === "end_rule" ? <p className="muted section-desc">{UI.endRuleDesc}</p> : null}
      </div>
    </div>
  );
}

export function StepsEditor({ steps, onChange }: { steps: RuleStepUI[]; onChange: (s: RuleStepUI[]) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex((x) => x._key === active.id);
    const newIndex = steps.findIndex((x) => x._key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(steps, oldIndex, newIndex));
  };

  return (
    <div className="steps-editor pipeline-editor">
      <p className="muted section-desc pipeline-intro">{UI.stepsHint}</p>
      <div className="pipeline-toolbar">
        <button type="button" className="btn" onClick={() => onChange([...steps, { _key: newKey(), id: "match_block", config: defaultStepConfig("match_block") }])}>{UI.addStep}</button>
        <span className="muted">{UI.dragHint}</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map((s) => s._key)} strategy={verticalListSortingStrategy}>
          <div className="pipeline-list">
            {steps.map((step, i) => (
              <SortableStepRow
                key={step._key}
                step={step}
                onChange={(s) => {
                  const next = [...steps];
                  next[i] = s;
                  onChange(next);
                }}
                onRemove={() => onChange(steps.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
