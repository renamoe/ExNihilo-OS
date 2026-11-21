export const SPINNER_FRAMES: readonly string[] = [
  '·',
  '✢',
  '✳',
  '✶',
  '✻',
  '✽',
  '✻',
  '✶',
  '✳',
  '✢',
];

export const LOADING_PHRASES: readonly string[] = [
  '正在无中生有…',
  '熬制像素浓汤…',
  '编织 DOM 神经元…',
  '揉捏按钮手感…',
  '打磨圆角弧度…',
  '向虚空借点灵感…',
  '校准宇宙对齐线…',
  '唤醒沉睡的控件…',
  '调配 Material 配色…',
  '给输入框注入灵魂…',
  '折腾 Flexbox 布局…',
  '捕获野生奇思妙想…',
  '拧紧组件螺丝钉…',
  '烹调交互小料…',
  '拼接界面积木…',
  '给像素做个 SPA…',
  '酝酿奇奇怪怪的功能…',
  '从零搓一个应用…',
  '梳理样式毛线团…',
  '召唤前端小精灵…',
  '正在认真画大饼…',
  '给界面刷一层亮漆…',
  '微调微妙的间距…',
  '即将破壳而出…',
];

export const EXTENDING_PHRASES: readonly string[] = [
  '正在焊接新功能…',
  '给应用加装外挂…',
  '拼接扩展模块…',
  '注入新奇交互…',
  '打磨新增控件…',
  '热插拔组件中…',
  '扩容应用脑洞…',
  '微调新模块布局…',
  '给界面续杯灵感…',
  '无缝融合新特性…',
];

export function pickNextPhrase(phrases: readonly string[], prev?: string): string {
  if (phrases.length === 0) return '';
  if (phrases.length === 1) return phrases[0];
  const pool = prev ? phrases.filter((item) => item !== prev) : phrases;
  const source = pool.length > 0 ? pool : phrases;
  return source[Math.floor(Math.random() * source.length)];
}

export function hasVisibleHtmlContent(html: string): boolean {
  const stripped = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style\b[^>]*>[\s\S]*$/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*$/gi, '')
    .replace(/<!--[\s\S]*$/g, '')
    .trim();

  if (!stripped) return false;
  return /<[a-zA-Z][^>]*>/.test(stripped) || !stripped.startsWith('<');
}
