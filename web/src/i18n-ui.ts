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
  locateMarker: "按模式标记分段",
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
  modulePrepend: "前方拼接",
  moduleAppend: "后方拼接",
  moduleGuard: "条件守卫",
  moduleLocate: "划定作用域",
  moduleGroupGeneral: "通用",
  moduleGroupMarker: "标记",
  moduleMarkerSplit: "标记分割",
  moduleMarkerBlock: "标记拦截",
  moduleMarkerDelete: "标记删除",
  moduleMarkerReplace: "标记替换",

  guardWhenTrue: "条件成立时",
  guardWhenFalse: "条件不成立时",
  guardOutcomePass: "不做处理（继续后续步骤）",
  guardOutcomeBlock: "拦截发送",
  guardOutcomeHalt: "终止本条规则后续步骤",
  guardOutcomeGoto: "跳转到指定步骤",
  guardGotoTarget: "跳转目标",
  guardGotoUnset: "请选择步骤标识",
  guardGotoHint:
    "跳转仅在相邻两个「划定作用域」之间的步骤段内生效；步骤标识按顺序自动生成为 s1、s2…",
  guardCondKindType: "类型",
  guardCondCmp: "比较方式",
  guardCondKindDate: "日期",
  guardCondKindNumber: "数值",
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
    "每条 guard 一种运算（日期 / 数值比大小）。需先圈定文本范围时用「划定作用域」；组合逻辑可串联 guard 或 goto。",
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
    "译向与提示词在插件配置中设置；测试时仅展示回退标记。",
  cfgMarkerLiteral: "字面量标记",
  cfgMarkerLiteralHint: "可选。如 ---；分割必填，其它模块可与预设并用。支持转义 \\n、\\t、\\\\。",
  cfgMarkerDeleteLiteral: "拆分时删除标记",
  cfgMarkerTrimPartStart: "清理段首换行",
  cfgMarkerTrimPartEnd: "清理段尾换行",
  cfgMarkerSplitHint: "在字面量标记点拆为多条待发消息。",
  cfgNone: "此模块无额外参数",
  cfgMarkerPresets: "模式标记预设",
  cfgMarkerPresetBracket: "方括号 […]",
  cfgMarkerPresetMustache: "双花括号 {{…}}",
  cfgMarkerPresetPercent: "百分号 %…%",
  cfgMarkerPresetDollar: "美元符 ${…}",
  cfgMarkerPresetCurly: "花括号标识符 {name}",
  cfgMarkerCustomPatterns: "自定义模式正则（每行一条）",
  cfgMarkerIncludeEmpty: "包含空标记（如 []、{{}}）",
  cfgMarkerReplacement: "替换为",
  cfgMarkerActionHint:
    "标记配置各模块共用：字面量标记 + 模式预设/正则。在标记点拦截、删除或替换。",
  cfgMarkerLocateHint: "每个标记区间为一段工作区，便于后续步骤只处理标记片段。",
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
} as const;

export const GUARD_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "date", label: UI.guardCondKindDate },
  { value: "number", label: UI.guardCondKindNumber },
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
};

export const MARKER_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: "bracket", label: UI.cfgMarkerPresetBracket },
  { value: "mustache", label: UI.cfgMarkerPresetMustache },
  { value: "percent", label: UI.cfgMarkerPresetPercent },
  { value: "dollar", label: UI.cfgMarkerPresetDollar },
  { value: "curly", label: UI.cfgMarkerPresetCurly },
];

export type ModuleOption = { value: string; label: string; group?: string };

export const MODULE_OPTIONS: ModuleOption[] = [
  { value: "noop", label: UI.moduleNoop, group: "general" },
  { value: "locate", label: UI.moduleLocate, group: "general" },
  { value: "replace", label: UI.moduleReplace, group: "general" },
  { value: "delete", label: UI.moduleDelete, group: "general" },
  { value: "translate_llm", label: UI.moduleTranslateLlm, group: "general" },
  { value: "prepend", label: UI.modulePrepend, group: "general" },
  { value: "append", label: UI.moduleAppend, group: "general" },
  { value: "guard", label: UI.moduleGuard, group: "general" },
  { value: "marker_split", label: UI.moduleMarkerSplit, group: "marker" },
  { value: "marker_block", label: UI.moduleMarkerBlock, group: "marker" },
  { value: "marker_delete", label: UI.moduleMarkerDelete, group: "marker" },
  { value: "marker_replace", label: UI.moduleMarkerReplace, group: "marker" },
];

export const MODULE_GROUPS: { id: string; label: string }[] = [
  { id: "general", label: UI.moduleGroupGeneral },
  { id: "marker", label: UI.moduleGroupMarker },
];

export function moduleLabel(id: string): string {
  return MODULE_OPTIONS.find((o) => o.value === id)?.label ?? id;
}
