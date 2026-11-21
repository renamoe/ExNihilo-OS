import type { ChatMessage } from '../types';

const COMPONENT_CATALOG = `
内置 Web Components (ChromeOS Material You 清爽浅色主题已内置: #f8f9fa 背景, #202124 文字, #1a73e8 强调色；原生 <textarea>/<input>/<canvas> 更简单时直接用原生标签):
- 布局: <en-shell layout="stack|sidebar|split|grid"> (slot: header/sidebar/main/footer)、<en-header title="" subtitle="">、<en-card title="" subtitle="">、<en-tabs>/<en-tab id="" label="" active>、<en-list>/<en-item title="" meta="" badge="" avatar="">
- 控件: <en-button variant="primary|ghost|danger" size="sm">、<en-input placeholder="" value="">、<en-badge>、<en-stat label="" value="">、<en-progress value="" max="100">、<en-chat-bubble sender="" time="" self>
- 懒挂载 <en-mount>: prompt="..." trigger="click|visible|submit" mode="replace|append" target="#sel" label="" placeholder=""
- 虚构媒体 (禁外部URL与fetch): <en-media kind="illustration|photo|chart|map|code" prompt="" caption="">、<en-avatar name="">、<en-video title="" prompt="" duration="02:30" subtitles="句1|句2">、<en-audio title="" artist="" mood="ambient|lofi|synth" duration="02:30">
`.trim();

export function buildCandidateMessages(query: string, existingNames: string[]): ChatMessage[] {
  const existingList = existingNames.length > 0 ? existingNames.join('、') : '无';
  return [
    {
      role: 'system',
      content: `你是 ExNihilo OS 应用构想器。根据关键词构想 3 个不同的极简桌面应用候选（避开已安装）。
只输出纯 JSON 数组，不要 markdown 代码块或解释。
格式: [{"name":"应用名","icon":"单个Emoji","description":"14字内简介","prompt":"25字内极简核心界面意图"}]
注意：prompt 只描述最核心的单一界面，不要堆砌多余功能。使用与用户输入一致的语言。`,
    },
    {
      role: 'user',
      content: `关键词: "${query}"\n已安装: ${existingList}`,
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
4. 尽量少写或不写 <script>（若必须交互，限制在 10 行以内）。
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
}): ChatMessage[] {
  const inputBlock = params.userInput ? `\n用户输入: "${params.userInput}"` : '';
  return [
    {
      role: 'system',
      content: `你是 ExNihilo OS 的 <en-mount> 局部内容生成器。快速输出紧凑的局部 HTML 片段（8-25 行）。
规则:
1. 只输出纯 HTML 片段，禁止 markdown 围栏与 html/head/body 外壳。
2. 严禁外部 URL 与 fetch()，媒体全部用 en-* Fake Media 组件编造；需要继续展开处可嵌套 <en-mount>。

${COMPONENT_CATALOG}`,
    },
    {
      role: 'user',
      content: `应用: ${params.appName}
上下文参考: ${params.contextSnippet.slice(0, 500)}
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
