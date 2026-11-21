import { describe, expect, it } from 'vitest';
import { isBackNavigationIntent, MountResultCache, TargetHistoryManager } from './mount-history';

describe('TargetHistoryManager', () => {
  it('pushes snapshots, goes back and forward, and clears forward stack on new navigation', () => {
    const mgr = new TargetHistoryManager<{ id: string }>(10);
    const view = { id: 'view' };

    expect(mgr.canGoBack(view)).toBe(false);
    expect(mgr.canGoForward(view)).toBe(false);
    expect(mgr.goBack(view, '<p>now</p>')).toBeNull();

    mgr.pushSnapshot(view, '<p>page1</p>');
    mgr.pushSnapshot(view, '<p>page2</p>');
    expect(mgr.canGoBack(view)).toBe(true);

    expect(mgr.goBack(view, '<p>page3</p>')).toBe('<p>page2</p>');
    expect(mgr.canGoForward(view)).toBe(true);

    expect(mgr.goBack(view, '<p>page2</p>')).toBe('<p>page1</p>');
    expect(mgr.canGoBack(view)).toBe(false);

    expect(mgr.goForward(view, '<p>page1</p>')).toBe('<p>page2</p>');
    expect(mgr.canGoBack(view)).toBe(true);
    expect(mgr.canGoForward(view)).toBe(true);

    // Pushing a new snapshot clears forward history
    mgr.pushSnapshot(view, '<p>page2</p>');
    expect(mgr.canGoForward(view)).toBe(false);
    expect(mgr.goForward(view, '<p>page4</p>')).toBeNull();
  });

  it('evicts oldest snapshots beyond maxDepth and ignores empty or consecutive duplicates', () => {
    const mgr = new TargetHistoryManager<{ id: string }>(3);
    const view = { id: 'view' };

    mgr.pushSnapshot(view, '   \n\t  ');
    expect(mgr.canGoBack(view)).toBe(false);

    mgr.pushSnapshot(view, '<p>1</p>');
    mgr.pushSnapshot(view, '<p>1</p>');
    mgr.pushSnapshot(view, '<p>2</p>');
    mgr.pushSnapshot(view, '<p>3</p>');
    mgr.pushSnapshot(view, '<p>4</p>');

    expect(mgr.goBack(view, '<p>5</p>')).toBe('<p>4</p>');
    expect(mgr.goBack(view, '<p>4</p>')).toBe('<p>3</p>');
    expect(mgr.goBack(view, '<p>3</p>')).toBe('<p>2</p>');
    expect(mgr.goBack(view, '<p>2</p>')).toBeNull();
  });
});

describe('isBackNavigationIntent', () => {
  it('recognizes explicit back labels and prompts', () => {
    expect(isBackNavigationIntent('', '← 返回', '')).toBe(true);
    expect(isBackNavigationIntent('', '', '返回首页')).toBe(true);
    expect(isBackNavigationIntent('', '上一页', '')).toBe(true);
    expect(isBackNavigationIntent('', 'Back', '')).toBe(true);
    expect(isBackNavigationIntent('返回上一页', '', '')).toBe(true);
    expect(isBackNavigationIntent('回到首页列表', '', '')).toBe(true);
    expect(isBackNavigationIntent('go back to list', '', '')).toBe(true);
  });

  it('does not false-positive on unrelated text or forward navigation', () => {
    expect(isBackNavigationIntent('查看用户反馈', 'Feedback', 'Feedback')).toBe(false);
    expect(isBackNavigationIntent('打开后台管理', '后台管理', '后台管理')).toBe(false);
    expect(isBackNavigationIntent('查看返回舱新闻详情', '返回舱新闻', '返回舱新闻')).toBe(false);
    expect(isBackNavigationIntent('阅读下一章内容', '下一页', '下一页')).toBe(false);
  });
});

describe('MountResultCache', () => {
  it('builds normalized keys, caches HTML hits, and ignores whitespace-only HTML', () => {
    const cache = new MountResultCache(5);
    const key = MountResultCache.buildKey(' #view ', ' 打开科技频道 ', '  ');
    expect(key).toBe('#view::打开科技频道::');

    expect(cache.get(key)).toBeNull();
    cache.set(key, '   \n ');
    expect(cache.get(key)).toBeNull();

    cache.set(key, '<div>科技新闻</div>');
    expect(cache.get(key)).toBe('<div>科技新闻</div>');
  });

  it('evicts the least recently used entry when capacity is exceeded', () => {
    const cache = new MountResultCache(2);
    cache.set('k1', '<div>1</div>');
    cache.set('k2', '<div>2</div>');

    // Touch k1 so k2 becomes least recently used
    expect(cache.get('k1')).toBe('<div>1</div>');

    cache.set('k3', '<div>3</div>');
    expect(cache.get('k2')).toBeNull();
    expect(cache.get('k1')).toBe('<div>1</div>');
    expect(cache.get('k3')).toBe('<div>3</div>');
  });
});
