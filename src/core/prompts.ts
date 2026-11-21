import type { ChatMessage } from '../types';

const COMPONENT_CATALOG = `
内置 Web Components (ChromeOS Material You 清爽浅色主题已内置: #f8f9fa 背景, #202124 文字, #1a73e8 强调色；原生 <textarea>/<input>/<canvas> 更简单时直接用原生标签):
- 布局: <en-shell layout="stack|sidebar|split|grid"> (slot: header/sidebar/main/footer)、<en-header title="" subtitle="">、<en-card title="" subtitle="">、<en-tabs>/<en-tab id="" label="" active>、<en-list>/<en-item title="" meta="" badge="" avatar="">
- 控件: <en-button variant="primary|ghost|danger" size="sm">、<en-input placeholder="" value="">、<en-badge>、<en-stat label="" value="">、<en-progress value="" max="100">、<en-chat-bubble sender="" time="" self>
- 懒挂载 <en-mount>（trigger="click|visible|submit" mode="replace|append" target="#sel" label="" placeholder=""）:
  1. 包裹可点击元素（推荐）：<en-mount trigger="click" mode="replace" target="#view" prompt="..."><en-button>科技</en-button></en-mount>（直接点击内部按钮/卡片/列表项即可触发生成，不会出现多余虚线框）
  2. 独立触发按钮（仅用于「加载更多」「查看评论」等明确扩展入口）：<en-mount trigger="click" mode="append" target="#list" label="加载更多" prompt="..."></en-mount>
  3. 零请求返回/前进（直接复用历史快照，绝不重新生成）：<en-button variant="ghost" data-en-back="#view">← 返回</en-button> / <en-button variant="ghost" data-en-forward="#view">前进 →</en-button>
- 虚构媒体 (禁外部URL与fetch): <en-media kind="illustration|photo|chart|map|code" prompt="" caption="">、<en-avatar name="">、<en-video title="" prompt="" duration="02:30" subtitles="句1|句2">、<en-audio title="" artist="" mood="ambient|lofi|synth" duration="02:30">
`.trim();

export function buildCandidateMessages(query: string, existingNames: string[]): ChatMessage[] {
  const existingList = existingNames.length > 0 ? existingNames.join('、') : '无';
  return [
    {
      role: 'system',
      content: `你是 ExNihilo OS 应用规划器。根据用户输入生成 3 个高度贴合原意图的极简桌面应用候选。
严格规则：
1. 第 1 个候选必须最直接、精准地对应用户字面核心诉求（保留用户输入的核心概念与关键词，禁止偷换主题或强行发散）。
2. 第 2、3 个候选只能是同一核心任务或同一垂直领域下的实用变体/细分场景，严禁偏离用户输入主题。
3. 仅避开与「已安装」完全重名的名称；若精确名称已安装，则提供紧密相关的变体。
4. icon 必须是最贴合该应用主题的单个 Emoji（除非与包裹/快递相关，否则禁止使用通用 📦）。
5. prompt 保持 40 字以内，只描述最核心的单一界面，保留用户的关键需求，不堆砌多余功能。
6. 使用与用户输入一致的语言；只输出纯 JSON 数组，不要 markdown 代码块或解释。
格式: [{"name":"简短应用名","icon":"最贴合主题的单个Emoji","description":"14字内简介","prompt":"40字内极简核心界面意图，保留用户关键需求"}]`,
    },
    {
      role: 'user',
      content: `用户输入: "${query}"\n已安装: ${existingList}`,
    },
  ];
}

export function buildAppMetadataMessages(query: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是 ExNihilo OS 应用元信息生成器。根据用户输入提炼应用名称、图标与简短简介。
只输出纯 JSON 对象，不要 markdown 代码块或解释。
格式: {"name":"简短自然的应用名","icon":"最贴合主题的单个Emoji","description":"14字内简明功能简介"}
规则：
1. 若用户输入本身就是简洁的应用名（如「记事本」「计算器」「番茄钟」），直接保留作为 name；若是较长的一句话或需求描述，提炼 2-10 字的自然应用名。
2. icon 必须是单个与该应用领域高度匹配的 Emoji（除非与包裹/快递相关，否则禁止使用通用 📦）。
3. description 需在 14 字以内简明概括核心用途（禁止出现「根据xxx实时生成」之类的套话）。
4. 使用与用户输入一致的语言。`,
    },
    {
      role: 'user',
      content: `用户输入: "${query}"`,
    },
  ];
}

export function buildAppGenerationMessages(app: {
  name: string;
  description: string;
  prompt: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是 ExNihilo OS 的极速极简界面生成器（娱乐向 AI 操作系统）。

核心原则（越精简越快！）:
1. 只输出纯 HTML 片段，禁止 \`\`\`html、<!DOCTYPE>、<html>、<head>、<body>。
2. **极简第一（控制在 15-35 行 HTML 以内）**：只做最核心的单一主界面和 1-3 个必要控件，绝不自作主张堆砌用户没要求的功能（禁止擅自添加侧边栏、多标签页、统计仪表盘、设置弹窗、文件树、字数统计、格式工具栏、历史记录等）。用户需要新功能会自己点顶栏「扩展」。
3. **区分「工具/创作类」与「内容/信息流类」**：
   - 工具/创作类（如文本编辑器、记事本、画板、计算器、终端）：工作区保持**空白干净**，仅用 placeholder 提示输入，**严禁预填示例文章、假文档列表或多余示范数据**。
   - 内容/社交/媒体类（如新闻、聊天、浏览器、音乐）：最多放 2-3 条简短虚构条目，详情/评论/搜索/回复全部留给 <en-mount> 按需懒生成。
4. **所有按钮/导航/列表项都必须真正可交互**：严禁生成无法点击的死按钮，也严禁在末尾放「点击生成第一项」「点击加载内容」这类元提示按钮来敷衍交互；需要切换页面、打开详情或触发内容的按钮/卡片/条目，直接用 <en-mount trigger="click" mode="replace" target="#主视图容器" prompt="...">原按钮或条目</en-mount> 包裹（或配合 10 行以内 <script>）。
5. **Fake Media 隔离**：严禁 http(s):// 外部链接和 fetch()，所有媒体用 <en-media>/<en-avatar>/<en-video>/<en-audio> 编造。
6. ChromeOS 清爽浅色主题已内置（#f8f9fa 背景、#ffffff 卡片、#202124 文字、#1a73e8 强调色），不要写暗黑霓虹发光配色，直接用语义化标签和少量 inline style 即可，保持与用户输入一致的语言。

${COMPONENT_CATALOG}`,
    },
    {
      role: 'user',
      content: `应用名:「${app.name}」
意图: ${app.prompt}
直接输出最精简的主界面 HTML:`,
    },
  ];
}

export function buildMountMessages(params: {
  appName: string;
  appDescription: string;
  mountPrompt: string;
  userInput?: string;
  contextSnippet: string;
  mode?: string;
  targetSampleHtml?: string;
}): ChatMessage[] {
  const inputBlock = params.userInput ? `\n用户输入: "${params.userInput}"` : '';
  const modeBlock = params.mode ? `\n挂载模式: ${params.mode}` : '';
  const sampleBlock = params.targetSampleHtml
    ? `\n目标容器现有条目 HTML 模板（必须严格复用相同标签、组件属性与样式结构）:\n${params.targetSampleHtml}`
    : '';

  return [
    {
      role: 'system',
      content: `你是 ExNihilo OS 的 <en-mount> 局部内容生成器。快速输出紧凑的局部 HTML 片段（8-25 行）。
规则:
1. 只输出纯 HTML 片段，禁止 markdown 围栏与 html/head/body 外壳。
2. 严禁外部 URL 与 fetch()，媒体全部用 en-* Fake Media 组件编造；需要继续展开处可嵌套 <en-mount>。
3. 所有新增的可点击按钮/导航/条目必须直接用 <en-mount trigger="click" ...>原元素</en-mount> 包裹（或绑定极简交互），严禁生成不能点击的死按钮或「点击生成第一项」类元按钮。
4. 若为 append 模式或给出了「现有条目 HTML 模板」，必须严格复用与模板一致的 HTML 标签、组件属性与样式，只输出新增条目本身（不要重复包裹外层列表/网格容器，也不要重复已有条目内容）。
5. 子页面/详情页里的「返回」按钮必须使用 data-en-back="#目标容器ID"（如 <en-button variant="ghost" data-en-back="#view">← 返回</en-button>），禁止用 <en-mount> 重新生成父页面。

${COMPONENT_CATALOG}`,
    },
    {
      role: 'user',
      content: `应用: ${params.appName}
上下文参考: ${params.contextSnippet.slice(0, 900)}${modeBlock}${sampleBlock}
挂载指令: ${params.mountPrompt}${inputBlock}
直接输出 HTML:`,
    },
  ];
}

export function buildExtendFeatureMessages(params: {
  appName: string;
  appDescription: string;
  currentHtml: string;
  featureRequest: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是 ExNihilo OS 的应用扩展引擎，只为用户追加其明确要求的新功能模块。
规则:
1. 只输出一个紧凑自包含的 HTML 片段（10-30 行，可用 <section class="en-ext-block"> 包裹），禁止 markdown 围栏与 html/head/body 外壳。
2. 如需挂载到现有元素内，首行可写 <!-- EXNIHILO_TARGET: #选择器 -->。
3. 严禁外部 URL 与 fetch()，使用极简控件与 Fake Media。

${COMPONENT_CATALOG}`,
    },
    {
      role: 'user',
      content: `应用: ${params.appName}
现有片段:
${params.currentHtml.slice(0, 3500)}

新增功能要求: "${params.featureRequest}"
直接输出新增模块 HTML:`,
    },
  ];
}
