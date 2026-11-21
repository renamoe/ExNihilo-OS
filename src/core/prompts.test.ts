import { describe, expect, it } from 'vitest';
import { buildAppGenerationMessages, buildMountMessages } from './prompts';

describe('buildAppGenerationMessages', () => {
  it('includes wrapped <en-mount> guidance and forbids dead buttons or meta placeholders', () => {
    const msgs = buildAppGenerationMessages({
      name: '极简浏览器',
      description: '浏览网页',
      prompt: '模拟浏览器页面',
    });
    const systemPrompt = msgs[0]?.content ?? '';
    expect(systemPrompt).toContain('<en-mount trigger="click" mode="replace" target="#view"');
    expect(systemPrompt).toContain('<en-button>科技</en-button></en-mount>');
    expect(systemPrompt).toContain('严禁生成无法点击的死按钮');
    expect(systemPrompt).toContain('点击生成第一项');
  });
});

describe('buildMountMessages', () => {
  it('includes mode, targetSampleHtml, and up to 900 chars of contextSnippet', () => {
    const longContext = 'A'.repeat(1100);
    const sampleHtml = '<en-item title="条目1" meta="刚刚"></en-item>';
    const msgs = buildMountMessages({
      appName: '新闻浏览',
      appDescription: '阅读新闻',
      mountPrompt: '追加更多新闻条目',
      contextSnippet: longContext,
      mode: 'append',
      targetSampleHtml: sampleHtml,
    });

    const systemPrompt = msgs[0]?.content ?? '';
    const userPrompt = msgs[1]?.content ?? '';

    expect(systemPrompt).toContain('现有条目 HTML 模板');
    expect(systemPrompt).toContain('严禁生成不能点击的死按钮');
    expect(userPrompt).toContain('挂载模式: append');
    expect(userPrompt).toContain(sampleHtml);
    expect(userPrompt).toContain('A'.repeat(900));
    expect(userPrompt).not.toContain('A'.repeat(901));
  });

  it('omits mode and template block when not provided', () => {
    const msgs = buildMountMessages({
      appName: '新闻浏览',
      appDescription: '阅读新闻',
      mountPrompt: '查看详情',
      contextSnippet: '简短上下文',
    });

    const userPrompt = msgs[1]?.content ?? '';
    expect(userPrompt).not.toContain('挂载模式:');
    expect(userPrompt).not.toContain('目标容器现有条目 HTML 模板');
  });
});
