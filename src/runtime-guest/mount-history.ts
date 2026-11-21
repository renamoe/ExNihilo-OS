const BACK_LABEL_RE =
  /^(?:[←‹«⬅◀]\uFE0F?\s*)?(?:返回(?:上一页|首页|主页|列表|目录)?|上一页|后退|back|go\s+back|return(?:\s+home|\s+to\s+list)?)\s*$/i;

const BACK_PROMPT_RE =
  /^(?:返回(?:上一页|上一步|父页面|原页面|首页|主页|列表|目录)|回到(?:上一页|首页|主页|列表|目录)|go\s+back|return\s+to\s+(?:previous|home|list))/i;

export class TargetHistoryManager<T extends object> {
  private backStacks = new WeakMap<T, string[]>();
  private forwardStacks = new WeakMap<T, string[]>();

  constructor(private readonly maxDepth = 10) {}

  pushSnapshot(target: T, html: string): void {
    if (!html.trim()) return;
    this.forwardStacks.delete(target);

    let stack = this.backStacks.get(target);
    if (!stack) {
      stack = [];
      this.backStacks.set(target, stack);
    }
    if (stack[stack.length - 1] === html) return;
    stack.push(html);
    if (stack.length > this.maxDepth) {
      stack.shift();
    }
  }

  canGoBack(target: T): boolean {
    return (this.backStacks.get(target)?.length ?? 0) > 0;
  }

  canGoForward(target: T): boolean {
    return (this.forwardStacks.get(target)?.length ?? 0) > 0;
  }

  goBack(target: T, currentHtml: string): string | null {
    const back = this.backStacks.get(target);
    if (!back || back.length === 0) return null;
    const prev = back.pop()!;
    if (currentHtml.trim()) {
      let fwd = this.forwardStacks.get(target);
      if (!fwd) {
        fwd = [];
        this.forwardStacks.set(target, fwd);
      }
      fwd.push(currentHtml);
      if (fwd.length > this.maxDepth) {
        fwd.shift();
      }
    }
    return prev;
  }

  goForward(target: T, currentHtml: string): string | null {
    const fwd = this.forwardStacks.get(target);
    if (!fwd || fwd.length === 0) return null;
    const next = fwd.pop()!;
    if (currentHtml.trim()) {
      let back = this.backStacks.get(target);
      if (!back) {
        back = [];
        this.backStacks.set(target, back);
      }
      back.push(currentHtml);
      if (back.length > this.maxDepth) {
        back.shift();
      }
    }
    return next;
  }
}

export function isBackNavigationIntent(
  prompt: string,
  label: string,
  textContent: string,
): boolean {
  const cleanLabel = label.trim();
  const cleanText = textContent.trim();
  if (
    (cleanLabel && BACK_LABEL_RE.test(cleanLabel)) ||
    (cleanText && BACK_LABEL_RE.test(cleanText))
  ) {
    return true;
  }
  const cleanPrompt = prompt.trim();
  return Boolean(cleanPrompt && BACK_PROMPT_RE.test(cleanPrompt));
}

export class MountResultCache {
  private cache = new Map<string, string>();

  constructor(private readonly maxEntries = 20) {}

  static buildKey(targetKey: string, prompt: string, userInput?: string): string {
    return `${targetKey.trim()}::${prompt.trim()}::${(userInput || '').trim()}`;
  }

  get(key: string): string | null {
    const existing = this.cache.get(key);
    if (existing === undefined) return null;
    this.cache.delete(key);
    this.cache.set(key, existing);
    return existing;
  }

  set(key: string, html: string): void {
    if (!html.trim()) return;
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, html);
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
  }
}
