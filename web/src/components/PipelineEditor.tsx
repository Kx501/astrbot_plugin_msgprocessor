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
import { MODULE_OPTIONS, UI, moduleLabel } from "../i18n-ui";
import type { PipelineStepUI } from "../types";
import { newKey } from "../types";

const MODULE_VALUES = new Set(MODULE_OPTIONS.map((o) => o.value));

export function defaultConfig(mid: string): Record<string, unknown> {
  switch (mid) {
    case "replace":
      return { from: "", to: "" };
    case "translate_llm":
      return { target_lang: "", prefix: "[译]" };
    case "append":
      return { text: "" };
    case "prepend":
      return { prefix: "" };
    case "delete":
      return { from: "" };
    case "filter":
      return { contain: "" };
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
        </div>
      );
    case "translate_llm":
      return (
        <div className="field-stack field-stack--block">
          <div className="pipeline-config-grid">
            <label className="field-stack">
              <span className="label-text">{UI.cfgTranslateTarget}</span>
              <input
                placeholder="留空则用插件默认，如：英文"
                value={String(c.target_lang ?? "")}
                onChange={(e) => set({ target_lang: e.target.value })}
              />
            </label>
            <label className="field-stack">
              <span className="label-text">{UI.cfgTranslateFallbackPrefix}</span>
              <input
                value={String(c.prefix ?? "")}
                onChange={(e) => set({ prefix: e.target.value })}
              />
            </label>
          </div>
          <p className="muted pipeline-config-hint">{UI.cfgTranslateLlmHint}</p>
        </div>
      );
    case "append":
      return (
        <label className="field-stack field-stack--block">
          <span className="label-text">{UI.cfgText}</span>
          <input value={String(c.text ?? "")} onChange={(e) => set({ text: e.target.value })} />
        </label>
      );
    case "prepend":
      return (
        <label className="field-stack field-stack--block">
          <span className="label-text">{UI.cfgPrefix}</span>
          <input value={String(c.prefix ?? "")} onChange={(e) => set({ prefix: e.target.value })} />
        </label>
      );
    case "delete":
      return (
        <label className="field-stack field-stack--block">
          <span className="label-text">{UI.cfgDeleteFrom}</span>
          <input value={String(c.from ?? "")} onChange={(e) => set({ from: e.target.value })} />
        </label>
      );
    case "filter":
      return (
        <div className="field-stack field-stack--block">
          <label className="field-stack field-stack--block">
            <span className="label-text">{UI.cfgContain}</span>
            <input
              value={String(c.contain ?? "")}
              onChange={(e) => set({ contain: e.target.value })}
            />
          </label>
          <p className="muted pipeline-config-hint">{UI.cfgContainHint}</p>
        </div>
      );
    default:
      return <p className="muted">{UI.cfgNone}</p>;
  }
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
