import { describe, expect, it } from 'vitest';
import {
  extractChoiceText,
  normalizeBaseUrl,
  parseJsonResponse,
  StreamFenceStripper,
} from './llm';

function feedInChunks(input: string, chunkSize: number): string {
  const stripper = new StreamFenceStripper();
  let out = '';
  for (let i = 0; i < input.length; i += chunkSize) {
    out += stripper.push(input.slice(i, i + chunkSize));
  }
  out += stripper.flush();
  return out;
}

describe('normalizeBaseUrl', () => {
  it('appends /chat/completions when given base path', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('strips trailing slashes before appending', () => {
    expect(normalizeBaseUrl('https://api.deepseek.com/v1///  ')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    );
  });

  it('preserves full /chat/completions endpoint', () => {
    expect(normalizeBaseUrl('https://example.com/v1/chat/completions/')).toBe(
      'https://example.com/v1/chat/completions',
    );
  });

  it('returns empty string for blank input', () => {
    expect(normalizeBaseUrl('   ')).toBe('');
  });
});

describe('extractChoiceText & parseJsonResponse', () => {
  it('extracts string message content and array content parts', () => {
    expect(extractChoiceText({ message: { content: '  [{"name":"A"}]  ' } })).toBe('[{"name":"A"}]');
    expect(
      extractChoiceText({
        message: {
          content: [
            { type: 'text', text: '[' },
            { type: 'text', text: '{"name":"B"}]' },
          ],
        },
      }),
    ).toBe('[{"name":"B"}]');
    expect(extractChoiceText({ message: { content: null, reasoning_content: 'thinking' } })).toBe('');
  });

  it('parses plain, fenced, and prose-wrapped JSON arrays', () => {
    expect(parseJsonResponse<Array<{ name: string }>>('[{"name":"A"}]')).toEqual([{ name: 'A' }]);
    expect(parseJsonResponse<Array<{ name: string }>>('```json\n[{"name":"B"}]\n```')).toEqual([
      { name: 'B' },
    ]);
    expect(
      parseJsonResponse<Array<{ name: string }>>('以下是候选：\n```json\n[{"name":"C"}]\n```\n请查收。'),
    ).toEqual([{ name: 'C' }]);
  });
});

describe('StreamFenceStripper', () => {
  it('strips markdown html fences across 1-char chunks', () => {
    const raw = '```html\n<en-shell layout="stack"><en-header title="Demo"></en-header></en-shell>\n```';
    expect(feedInChunks(raw, 1)).toBe(
      '<en-shell layout="stack"><en-header title="Demo"></en-header></en-shell>',
    );
  });

  it('strips markdown fences across 3-char and 5-char chunks', () => {
    const raw = '  ```xml\n<en-card title="Test">Hello</en-card>\n```  ';
    const expected = '<en-card title="Test">Hello</en-card>';
    expect(feedInChunks(raw, 3)).toBe(expected);
    expect(feedInChunks(raw, 5)).toBe(expected);
  });

  it('passes plain HTML through without altering content', () => {
    const raw = '<en-shell><en-button>Click</en-button></en-shell>';
    expect(feedInChunks(raw, 2)).toBe(raw);
    expect(feedInChunks(raw, 7)).toBe(raw);
  });

  it('strips <!DOCTYPE>, <html>, <head>...</head>, and <body> wrappers across small chunks', () => {
    const raw =
      '```html\n<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Ignored</title></head>\n<body>\n<en-header title="Clean"></en-header>\n</body>\n</html>\n```';
    expect(feedInChunks(raw, 2)).toBe('<en-header title="Clean"></en-header>');
    expect(feedInChunks(raw, 4)).toBe('<en-header title="Clean"></en-header>');
  });

  it('handles very short outputs flushed immediately', () => {
    expect(feedInChunks('```html\n<div>Hi</div>```', 50)).toBe('<div>Hi</div>');
    expect(feedInChunks('<b>X</b>', 1)).toBe('<b>X</b>');
  });
});
