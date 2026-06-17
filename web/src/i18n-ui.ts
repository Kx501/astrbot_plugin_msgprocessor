/** 界面文案为中文；规则与配置 JSON 的字段名以仓库说明为准。 */

export const UI = {
  appTitle: "MsgProcessor",
  appSubtitle:
    "待发消息文本处理规则 · 与 AstrBot 插件数据目录中的 rules.json 同步",
  footer: "文本规则按优先级依次匹配；修改后请点击保存写入磁盘。",

  loading: "正在加载规则…",
  loadFailed: "无法加载规则",
  startBackend: "请先启动服务：在插件目录执行",
  noRules: "暂无规则，请点击左侧「新建规则」。",
  editRule: "编辑规则",

  testSection: "测试区",
  testExpand: "展开测试区",
  testCollapse: "收起测试区",
  testHint:
    "测试当前规则配置，无需先保存。",
  testScopeLabel: "测试范围",
  testScopeAll: "全部已启用规则",
  testScopeSelected: "仅当前规则",
  testInputPlaceholder: "在此粘贴或输入需要测试的机器人消息文本…",
  testOutputPlaceholder: "执行处理后，结果将按待发消息逐条展示",
  testOutputUnchanged: "文本未发生变化",
  testOutputDropped: "本条消息已被过滤，不会发送",
  testMessageIndex: (n: number) => `消息 ${n}`,
  testMessageEmpty: "（空）",
  input: "原始文本",
  output: "处理结果",
  run: "执行处理",
  running: "处理中…",

  rulesSidebar: "规则列表",
  newRule: "新建规则",
  saveFile: "保存到 rules.json",
  savedOk: (name: string) => `已保存至数据目录：${name}`,
  ruleUntitled: (n: number) => `未命名规则 ${n}`,

  deleteRule: "删除此规则",
  deleteConfirm: "确定删除这条规则？此操作仅影响当前编辑，保存后才会写入文件。",

  fieldId: "规则标识",
  fieldEnabled: "启用此规则",
  fieldPriority: "优先级（数值越小越先执行）",
  anchorStart: "开始锚点",
  anchorEnd: "结束锚点",
  fieldLiteral: "锚点字符串",
  fieldOccurrence: "第几次出现（0 为首次）",
  fieldInclusive: "截取范围包含锚点",
  anchorIgnoreSameLine: "忽略与锚点同行的文本",

  locateType: "定位方式",
  locateRegex: "正则区间",
  locateSimple: "简单条件",
  locateMarker: "按字面量标记分段",
  locateAnchorSlice: "锚点区间",
  locateAnchorSliceHint:
    "取开始、结束锚点之间的内容为工作区；解析失败则跳过直至下一个划定作用域步骤。",
  fieldOp: "比较方式",
  opEquals: "完全相等",
  opContains: "包含",
  opNotContains: "不包含",
  opStarts: "开头为",
  opEnds: "结尾为",
  fieldValue: "比较内容",
  fieldIgnoreCase: "忽略大小写",
  fieldPattern: "正则模式",
  fieldFlags: "标志（逗号分隔）",

  fieldRegionKind: "工作区范围",
  regionMatch: "定位到的整段",
  regionGroup: "正则捕获组",
  fieldGroupIndex: "捕获组序号",
  fieldGroupName: "命名组（可选，留空则用序号）",
  fieldMaxMatches: "同一规则最多生效次数（0 为无限）",

  moduleNoop: "无操作",
  moduleReplace: "替换",
  moduleDelete: "删除",
  moduleTranslateLlm: "AI翻译",
  moduleReviewLlm: "AI审查",
  moduleRenderImage: "渲染图片",
  modulePrepend: "前方拼接",
  moduleAppend: "后方拼接",
  moduleGuard: "条件守卫",
  moduleLocate: "划定作用域",
  moduleGroupGeneral: "通用",
  moduleGroupMarker: "标记",
  moduleMarker: "标记",
  markerAction: "处理方式",
  markerActionSplit: "分割为多条消息",
  markerActionBlock: "含标记时拦截发送",
  markerActionDelete: "含标记时删除整段",
  markerActionReplace: "含标记时替换整段",

  guardWhenTrue: "成立",
  guardWhenFalse: "不成立",
  guardOutcomePass: "继续",
  guardOutcomeBlock: "拦截",
  guardOutcomeHalt: "终止",
  guardOutcomeGoto: "跳转",
  guardGotoTarget: "跳转目标",
  guardGotoUnset: "请选择步骤标识",
  guardGotoHint:
    "跳转仅在相邻两个「划定作用域」之间的步骤段内生效；步骤标识按顺序自动生成为 s1、s2…",
  guardCondKindType: "类型",
  guardCondCmp: "比较方式",
  guardCondKindDate: "日期",
  guardCondKindNumber: "数值",
  guardCondKindLength: "字数",
  guardCondKindRegex: "正则",
  guardCondLengthCount: "计数方式",
  guardCondLengthCountChars: "全部字符（含空白）",
  guardCondLengthCountCharsNoWs: "忽略空白字符",
  guardCondLengthThreshold: "字数阈值",
  guardCondCmpRegexSearch: "任意匹配",
  guardCondCmpRegexMatch: "全文匹配",
  guardCondRegexPattern: "正则模式",
  guardCondIfNoMatch: "未匹配时视为成立",
  guardCondCmpDateBeforeAt: "早于指定时间",
  guardCondCmpDateAfterAt: "晚于指定时间",
  guardCondCmpDateWithinDays: "时间范围内",
  guardCondCmpDateOutsideDays: "时间范围外",
  guardCondAnchorAt: "比较时间点",
  guardCondCmpGt: "大于",
  guardCondCmpGte: "大于等于",
  guardCondCmpLt: "小于",
  guardCondCmpLte: "小于等于",
  guardCondCmpEq: "等于",
  guardCondCmpNe: "不等于",
  guardCondDays: "天数",
  guardCondFormat: "日期格式（消息内日期与比较时间点共用）",
  guardCondDateRegex: "日期正则（可选，留空则用内置格式）",
  guardCondNumberRegex: "数值正则（可选，第 1 捕获组为数值）",
  guardCondThreshold: "比较阈值",
  guardCondIfNoDate: "未找到日期时视为成立",
  guardCondIfMissing: "未找到数值时视为成立",
  guardHint:
    "组合逻辑可串联 guard 或 goto。",
  locateStepHint:
    "仅在需要局部处理时出现。划定工作区；未命中则跳过直至下一步「划定作用域」。无此步骤时，后续模块作用于整段消息。",

  stepLabelField: "步骤标识",
  stepLabelAuto: (label: string) => label,

  cfgFrom: "查找",
  cfgTo: "替换为",
  cfgDeleteFrom: "要删除的原文（全部匹配）",
  cfgReplaceRegex: "正则替换",
  cfgRegexFlags: "正则标志（逗号分隔）",
  cfgPrefix: "前方拼接内容",
  cfgText: "后方拼接内容",
  cfgLiteralEscapeHint: "支持转义：\\n 换行、\\t 制表符、\\\\ 反斜杠",
  cfgTranslateFallbackPrefix: "模型不可用或失败时的回退标记",
  cfgTranslateLlmHint:
    "模块 prompt 优先于插件全局 llm_translate_prompt；测试台不调用模型，仅回退标记。",
  cfgPrompt: "提示词（可选）",
  cfgPromptHint: "支持 {{text}} 原文占位；留空则使用插件全局默认提示词。",
  cfgReviewLlmHint:
    "模块 prompt 优先于插件全局 llm_review_prompt；失败时保持原文。",
  cfgRenderImageHint:
    "承接上一步 guard 等判断：需渲染时 goto 到本步骤，将当前工作区文本作为 {{text}} 请求渲染接口并发送图片。",
  cfgRenderMethod: "请求方式",
  cfgRenderUrl: "链接",
  cfgRenderBodyJson: "Body JSON（POST）",
  cfgRenderBodyJsonHint: "POST 时发送 JSON；字段值内可用 {{text}} 占位（支持多行）。留空则默认 {\"text\":\"...\"}。",
  cfgMarkerLiteral: "字面量标记",
  cfgMarkerLiteralHint: "固定字符串，如 ---、【待填】。支持转义 \\n、\\t、\\\\。",
  cfgMarkerDeleteLiteral: "拆分时删除标记",
  cfgMarkerTrimPartStart: "清理段首换行",
  cfgMarkerTrimPartEnd: "清理段尾换行",
  cfgMarkerReplacement: "整段替换为",
  cfgMarkerLocateHint: "每次字面量出现位置为一段工作区，便于后续步骤只处理该片段。",
  cfgNone: "此模块无额外参数",
  locateMultiHint:
    "多个「划定作用域」按顺序执行：每一步都在上一步处理后的整条消息上重新定位，不是嵌套递进。",

  moduleLabel: "模块类型",
  addModule: "添加处理步骤",
  dragHint: "拖动手柄排序",
  removeStep: "移除此步骤",

  dragSort: "拖动排序",

  sectionPipeline: "处理流水线（有序执行）",
  pipelineHint:
    "自上而下执行。仅当需局部处理时添加「划定作用域」；否则步骤直接作用于整段消息。",

  themeSystem: "跟随系统",
  themeLight: "浅色",
  themeDark: "深色",
  themeCycleAria: "切换界面主题",
  scrollToTop: "回到顶部",
  scrollToBottom: "跳转底部",
} as const;

export const GUARD_LENGTH_COUNT_OPTIONS: { value: string; label: string }[] = [
  { value: "chars", label: UI.guardCondLengthCountChars },
  { value: "chars_no_ws", label: UI.guardCondLengthCountCharsNoWs },
];

export const GUARD_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "date", label: UI.guardCondKindDate },
  { value: "number", label: UI.guardCondKindNumber },
  { value: "length", label: UI.guardCondKindLength },
  { value: "regex", label: UI.guardCondKindRegex },
];

export const GUARD_REGEX_OP_OPTIONS: { value: string; label: string }[] = [
  { value: "regex_search", label: UI.guardCondCmpRegexSearch },
  { value: "regex_match", label: UI.guardCondCmpRegexMatch },
];

const GUARD_CMP_COMMON: { value: string; label: string }[] = [
  { value: "gt", label: UI.guardCondCmpGt },
  { value: "gte", label: UI.guardCondCmpGte },
  { value: "lt", label: UI.guardCondCmpLt },
  { value: "lte", label: UI.guardCondCmpLte },
  { value: "eq", label: UI.guardCondCmpEq },
  { value: "ne", label: UI.guardCondCmpNe },
];

export const GUARD_DATE_OP_OPTIONS: { value: string; label: string }[] = [
  { value: "date_before_at", label: UI.guardCondCmpDateBeforeAt },
  { value: "date_after_at", label: UI.guardCondCmpDateAfterAt },
  { value: "date_within_days", label: UI.guardCondCmpDateWithinDays },
  { value: "date_outside_days", label: UI.guardCondCmpDateOutsideDays },
];

export const GUARD_CMP_BY_KIND: Record<string, { value: string; label: string }[]> = {
  number: GUARD_CMP_COMMON,
  length: GUARD_CMP_COMMON,
};

export const MARKER_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "split", label: UI.markerActionSplit },
  { value: "block", label: UI.markerActionBlock },
  { value: "delete", label: UI.markerActionDelete },
  { value: "replace", label: UI.markerActionReplace },
];

export type ModuleOption = { value: string; label: string; group?: string };

export const MODULE_OPTIONS: ModuleOption[] = [
  { value: "noop", label: UI.moduleNoop, group: "general" },
  { value: "locate", label: UI.moduleLocate, group: "general" },
  { value: "replace", label: UI.moduleReplace, group: "general" },
  { value: "delete", label: UI.moduleDelete, group: "general" },
  { value: "translate_llm", label: UI.moduleTranslateLlm, group: "general" },
  { value: "review_llm", label: UI.moduleReviewLlm, group: "general" },
  { value: "render_image", label: UI.moduleRenderImage, group: "general" },
  { value: "prepend", label: UI.modulePrepend, group: "general" },
  { value: "append", label: UI.moduleAppend, group: "general" },
  { value: "guard", label: UI.moduleGuard, group: "general" },
  { value: "marker", label: UI.moduleMarker, group: "marker" },
];

export const MODULE_GROUPS: { id: string; label: string }[] = [
  { id: "general", label: UI.moduleGroupGeneral },
  { id: "marker", label: UI.moduleGroupMarker },
];

export function moduleLabel(id: string): string {
  return MODULE_OPTIONS.find((o) => o.value === id)?.label ?? id;
}
