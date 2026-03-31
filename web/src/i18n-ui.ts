/** 界面文案为中文；规则与配置 JSON 的字段名以仓库说明为准。 */

export const UI = {
  appTitle: "MsgProcessor",
  appSubtitle:
    "入站消息文本处理规则 · 与 AstrBot 插件数据目录中的 rules.json 同步",
  footer: "文本规则按优先级依次匹配；修改后请点击保存写入磁盘。",

  loading: "正在加载规则…",
  loadFailed: "无法加载规则",
  startBackend: "请先启动服务：在插件目录执行",
  noRules: "暂无规则，请点击左侧「新建规则」。",
  editRule: "编辑规则",

  testSection: "测试区",
  testHint:
    "使用所有已启用的规则进行测试，无需先保存。若只想验证某一条，可暂时取消勾选其他规则的「启用此规则」。",
  input: "原始文本",
  output: "处理后",
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
  fieldInclusive: "匹配范围包含锚点本身",

  matcherType: "匹配方式",
  matcherRegex: "正则表达式",
  matcherSimple: "简单匹配",
  matcherPassthrough: "整段直通",
  matcherAnchorSlice: "锚点区间",
  matcherAnchorSliceHint:
    "取开始、结束锚点之间的整段为一次命中；解析失败则跳过本块。",
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

  fieldRegionKind: "对哪一段文本执行内层模块",
  regionMatch: "整段匹配结果",
  regionGroup: "正则捕获组",
  fieldGroupIndex: "捕获组序号",
  fieldGroupName: "命名组（可选，留空则用序号）",
  fieldMaxMatches: "同一规则最多生效次数（0 为无限）",

  moduleNoop: "无操作",
  moduleReplace: "替换",
  moduleDelete: "删除",
  moduleTranslateLlm: "AI翻译",
  modulePrepend: "插入前缀",
  moduleAppend: "插入后缀",

  cfgFrom: "查找",
  cfgTo: "替换为",
  cfgDeleteFrom: "要删除的原文（全部匹配）",
  cfgWholeFromEmpty: "为空时处理整段",
  cfgReplaceRegex: "正则替换",
  cfgRegexFlags: "正则标志（逗号分隔）",
  cfgPrefix: "前缀",
  cfgText: "后缀",
  cfgTranslateFallbackPrefix: "模型不可用或失败时的前缀",
  cfgTranslateLlmHint:
    "具体配置请在Bot框架中编写；本页测试仅使用前缀占位。",
  cfgNone: "此模块无额外参数",

  moduleLabel: "模块类型",
  addModule: "添加处理步骤",
  dragHint: "拖动手柄排序",
  removeStep: "移除此步骤",

  dragSort: "拖动排序",

  sectionSteps: "规则步骤（有序执行）",
  stepsHint:
    "各模块自上而下执行：零命中或执行失败则跳过该块。结束步骤可提前结束本条规则。",
  stepTypeLabel: "步骤类型",
  stepMatchBlock: "匹配块（主匹配 + 内层处理）",
  stepEndRule: "结束本条规则",
  matchBlockHint:
    "本块输入为当前整段文本；命中后写回。多块串联时，前一块输出为下一块输入。",
  matchBlockInnerPipeline: "命中后的处理模块",
  addStep: "添加步骤",
  endRuleDesc: "执行到此步时停止处理本条规则中后续步骤（不改变已写入的消息）。",

  themeSystem: "跟随系统",
  themeLight: "浅色",
  themeDark: "深色",
  themeCycleAria: "切换界面主题",
} as const;

export const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: "noop", label: UI.moduleNoop },
  { value: "replace", label: UI.moduleReplace },
  { value: "delete", label: UI.moduleDelete },
  { value: "translate_llm", label: UI.moduleTranslateLlm },
  { value: "prepend", label: UI.modulePrepend },
  { value: "append", label: UI.moduleAppend },
];

export const STEP_OPTIONS: { value: string; label: string }[] = [
  { value: "match_block", label: UI.stepMatchBlock },
  { value: "end_rule", label: UI.stepEndRule },
];

export function moduleLabel(id: string): string {
  return MODULE_OPTIONS.find((o) => o.value === id)?.label ?? id;
}

export function stepLabel(id: string): string {
  return STEP_OPTIONS.find((o) => o.value === id)?.label ?? id;
}
