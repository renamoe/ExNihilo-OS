import { describe, expect, it } from 'vitest';
import {
  EXTENDING_PHRASES,
  hasVisibleHtmlContent,
  LOADING_PHRASES,
  pickNextPhrase,
} from './loading-phrases';

describe('hasVisibleHtmlContent', () => {
  it('returns false for empty, whitespace, style-only, script-only, and comment-only HTML', () => {
    expect(hasVisibleHtmlContent('')).toBe(false);
    expect(hasVisibleHtmlContent('   \n\t  ')).toBe(false);
    expect(hasVisibleHtmlContent('<style>body { color: #202124; }</style>')).toBe(false);
    expect(hasVisibleHtmlContent('<style>.card { padding: 12px;')).toBe(false);
    expect(hasVisibleHtmlContent('<script>const x = 1;</script>')).toBe(false);
    expect(hasVisibleHtmlContent('<script>function init() {')).toBe(false);
    expect(hasVisibleHtmlContent('<!-- thinking about layout -->')).toBe(false);
    expect(hasVisibleHtmlContent('<!-- unclosed comment')).toBe(false);
    expect(hasVisibleHtmlContent('<style>a{}</style>\n<!-- note -->\n<script>1</script>')).toBe(
      false,
    );
  });

  it('returns true once visible tags or text appear', () => {
    expect(hasVisibleHtmlContent('<en-shell><en-header title="Hi"></en-header></en-shell>')).toBe(
      true,
    );
    expect(hasVisibleHtmlContent('<style>body{}</style><div>Hello</div>')).toBe(true);
    expect(hasVisibleHtmlContent('<style>body{}</style>\nHello world')).toBe(true);
  });
});

describe('pickNextPhrase', () => {
  it('returns an item from the list and never repeats prev when length > 1', () => {
    const pair = ['A', 'B'];
    for (let i = 0; i < 30; i++) {
      expect(pickNextPhrase(pair, 'A')).toBe('B');
      expect(pickNextPhrase(pair, 'B')).toBe('A');
    }

    const picked = pickNextPhrase(LOADING_PHRASES);
    expect(LOADING_PHRASES).toContain(picked);

    const pickedExtend = pickNextPhrase(EXTENDING_PHRASES, EXTENDING_PHRASES[0]);
    expect(EXTENDING_PHRASES).toContain(pickedExtend);
    expect(pickedExtend).not.toBe(EXTENDING_PHRASES[0]);
  });

  it('handles single-item and empty lists safely', () => {
    expect(pickNextPhrase(['Only'], 'Only')).toBe('Only');
    expect(pickNextPhrase([], 'Prev')).toBe('');
  });
});
