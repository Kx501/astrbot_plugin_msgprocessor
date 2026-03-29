/** 界面文案（配置 JSON 字段仍为英文，与后端一致） */

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

  fieldId: "规则标识（id）",
  fieldEnabled: "启用此规则",
  fieldPriority: "优先级（数值越小越先执行）",
  anchorStart: "开始锚点",
  anchorEnd: "结束锚点",
  fieldLiteral: "锚点字符串",
  fieldOccurrence: "第几次出现（0 为首次）",
  fieldInclusive: "匹配范围包含锚点本身",

  sectionMatcher: "主匹配条件",
  matcherType: "匹配方式",
  matcherRegex: "正则表达式（regex）",
  matcherSimple: "简单文本（simple）",
  matcherPassthrough: "整段直通（passthrough）",
  matcherAnchorSlice: "锚点匹配（anchor_slice）",
  matcherAnchorSliceHint:
    "取开始、结束锚点之间的整段为一次命中；解析失败则跳过本块。",
  fieldOp: "比较方式",
  opEquals: "完全相等",
  opContains: "包含",
  opStarts: "开头为",
  opEnds: "结尾为",
  fieldValue: "比较内容",
  fieldIgnoreCase: "忽略大小写",
  fieldPattern: "正则模式（pattern）",
  fieldFlags: "标志（逗号分隔，如 IGNORECASE、MULTILINE）",

  sectionRegion: "作用区域与次数",
  fieldRegionKind: "对哪一段文本执行内层模块",
  regionMatch: "整段匹配结果",
  regionGroup: "正则捕获组",
  fieldGroupIndex: "捕获组序号",
  fieldGroupName: "命名组（可选，留空则用序号）",
  fieldMaxMatches: "同一规则最多生效次数",

  sectionPipeline: "处理流水线",
  pipelineHint: "自上而下依次执行；拖动手柄调整顺序。",

  moduleNoop: "无操作（noop）",
  moduleReplace: "替换（replace）",
  moduleTranslateStub: "翻译占位（translate_stub）",
  moduleAppend: "追加后缀（append）",
  moduleFilter: "过滤（filter）",

  cfgFrom: "查找（from）",
  cfgTo: "替换为（to）",
  cfgPrefix: "前缀（prefix）",
  cfgText: "追加内容（text）",
  cfgMustContain: "须包含子串（must_contain）",
  cfgNone: "此模块无额外参数",

  moduleLabel: "模块类型",
  addModule: "添加处理步骤",
  dragHint: "拖动手柄排序",
  removeStep: "移除此步骤",

  dragSort: "拖动排序",

  sectionSteps: "规则步骤（有序执行）",
  stepsHint:
    "各块自上而下执行：passthrough 整段进内层；anchor_slice / regex / simple 先产生命中再跑内层。零命中或锚点失败则跳过该块。end_rule 提前结束本条规则。",
  stepTypeLabel: "步骤类型",
  stepMatchBlock: "匹配块（主匹配 + 内层处理）",
  stepEndRule: "结束本条规则（end_rule）",
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
  { value: "translate_stub", label: UI.moduleTranslateStub },
  { value: "append", label: UI.moduleAppend },
  { value: "filter", label: UI.moduleFilter },
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
