import type { ChatMessage, LLMConfig } from '../types';

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

/**
 * Stateful streaming HTML cleaner that strips leading/trailing markdown code fences
 * (```html ... ```) and accidental outer document wrappers (<!DOCTYPE>, <html>, <head>...</head>, <body>)
 * across arbitrary chunk boundaries without buffering the whole response.
 */
export class StreamFenceStripper {
  private leadingBuffer = '';
  private leadingResolved = false;
  private insideHead = false;
  private tailBuffer = '';
  private readonly tailHoldback = 32;

  push(chunk: string): string {
    if (!chunk) return '';

    let data = chunk;
    if (!this.leadingResolved) {
      this.leadingBuffer += data;
      const resolved = this.tryResolveLeading();
      if (resolved === null) {
        return '';
      }
      data = resolved;
      this.leadingResolved = true;
    }

    if (!data) return '';

    this.tailBuffer += data;
    if (this.tailBuffer.length <= this.tailHoldback) {
      return '';
    }

    const emitLen = this.tailBuffer.length - this.tailHoldback;
    const toEmit = this.tailBuffer.slice(0, emitLen);
    this.tailBuffer = this.tailBuffer.slice(emitLen);
    return toEmit;
  }

  flush(): string {
    let out = '';
    if (!this.leadingResolved) {
      out = this.forceStripLeading(this.leadingBuffer);
      this.leadingBuffer = '';
      this.leadingResolved = true;
    } else {
      out = this.tailBuffer;
      this.tailBuffer = '';
    }

    return this.stripTrailingWrappers(out);
  }

  private tryResolveLeading(): string | null {
    // Wait past initial whitespace
    let buf = this.leadingBuffer.replace(/^\s+/, '');
    if (!buf) {
      this.leadingBuffer = buf;
      return null;
    }

    // Check markdown fence prefix: ```html\n or ```\n
    if (buf.startsWith('```')) {
      const nlIdx = buf.indexOf('\n');
      if (nlIdx === -1) {
        // Still reading fence header line
        if (buf.length < 32) {
          this.leadingBuffer = buf;
          return null;
        }
      } else {
        buf = buf.slice(nlIdx + 1).replace(/^\s+/, '');
      }
    } else if (buf.length < 3 && '`'.repeat(buf.length) === buf) {
      // Partial backticks e.g. "`" or "``"
      this.leadingBuffer = buf;
      return null;
    }

    // Repeatedly strip outer HTML wrappers if present
    while (true) {
      buf = buf.replace(/^\s+/, '');
      if (!buf) {
        this.leadingBuffer = buf;
        return null;
      }

      if (this.insideHead) {
        const closeHeadIdx = buf.search(/<\/head\s*>/i);
        if (closeHeadIdx === -1) {
          // Keep last few chars in case </head> splits across chunks
          this.leadingBuffer = buf.slice(Math.max(0, buf.length - 10));
          return null;
        }
        const match = buf.slice(closeHeadIdx).match(/^<\/head\s*>/i)!;
        buf = buf.slice(closeHeadIdx + match[0].length);
        this.insideHead = false;
        continue;
      }

      // Check if buf could be an incomplete prefix of <!DOCTYPE, <html, <head, <body
      const lower = buf.toLowerCase();
      const wrapperPrefixes = ['<!doctype', '<html', '<head', '<body'];
      const maybeWrapper = wrapperPrefixes.some(
        (prefix) => prefix.startsWith(lower) || lower.startsWith(prefix),
      );

      if (!maybeWrapper) {
        this.leadingBuffer = '';
        return buf;
      }

      if (lower.startsWith('<head')) {
        const gt = buf.indexOf('>');
        if (gt === -1) {
          this.leadingBuffer = buf;
          return null;
        }
        buf = buf.slice(gt + 1);
        this.insideHead = true;
        continue;
      }

      if (
        lower.startsWith('<!doctype') ||
        lower.startsWith('<html') ||
        lower.startsWith('<body')
      ) {
        const gt = buf.indexOf('>');
        if (gt === -1) {
          this.leadingBuffer = buf;
          return null;
        }
        buf = buf.slice(gt + 1);
        continue;
      }

      // Partial match like "<!d" or "<ht"
      this.leadingBuffer = buf;
      return null;
    }
  }

  private forceStripLeading(input: string): string {
    let s = input.trimStart();
    s = s.replace(/^```[a-zA-Z0-9_-]*\r?\n?/, '');
    s = s.replace(/^\s*<!DOCTYPE[^>]*>/i, '');
    s = s.replace(/^\s*<html[^>]*>/i, '');
    s = s.replace(/^\s*<head[^>]*>[\s\S]*?<\/head\s*>/i, '');
    s = s.replace(/^\s*<body[^>]*>/i, '');
    return s.trimStart();
  }

  private stripTrailingWrappers(input: string): string {
    let s = input;
    // Strip trailing </body>, </html>, ``` in any order
    let prev = '';
    while (s !== prev) {
      prev = s;
      s = s
        .replace(/\s*```\s*$/, '')
        .replace(/\s*<\/html\s*>\s*$/i, '')
        .replace(/\s*<\/body\s*>\s*$/i, '');
    }
    return s;
  }
}

export interface StreamOptions {
  signal?: AbortSignal;
  modelOverride?: string;
  temperature?: number;
  maxTokens?: number;
  onToken: (token: string) => void;
  onReasoningToken?: (token: string) => void;
}

async function extractErrorMessage(res: Response): Promise<string> {
  const statusInfo = `HTTP ${res.status} ${res.statusText}`.trim();
  try {
    const text = await res.text();
    if (!text) return statusInfo;
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      if (typeof json.error === 'string') return `${statusInfo}: ${json.error}`;
      if (json.error?.message) return `${statusInfo}: ${json.error.message}`;
      if (json.message) return `${statusInfo}: ${json.message}`;
    } catch {
      // plain text body
    }
    return `${statusInfo}: ${text.slice(0, 260)}`;
  } catch {
    return statusInfo;
  }
}

export async function streamChatCompletion(
  config: LLMConfig,
  messages: ChatMessage[],
  options: StreamOptions,
): Promise<string> {
  const url = normalizeBaseUrl(config.baseUrl);
  if (!url) {
    throw new Error('大模型 Base URL 未配置');
  }
  const model = (options.modelOverride || config.model).trim();
  if (!model) {
    throw new Error('大模型 Model 未配置');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: options.temperature ?? config.temperature ?? 0.7,
  };
  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res));
  }

  if (!res.body) {
    throw new Error('响应流为空');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lineEnd = buffer.indexOf('\n');
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);
        lineEnd = buffer.indexOf('\n');

        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          return fullText;
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string | null;
                reasoning_content?: string | null;
                reasoning?: string | null;
              };
              message?: { content?: string | null };
            }>;
            error?: { message?: string };
          };

          if (parsed.error?.message) {
            throw new Error(parsed.error.message);
          }

          const reasoningDelta =
            parsed.choices?.[0]?.delta?.reasoning_content ?? parsed.choices?.[0]?.delta?.reasoning;
          if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
            options.onReasoningToken?.(reasoningDelta);
          }

          const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            fullText += delta;
            options.onToken(delta);
          }
        } catch (err) {
          if (err instanceof SyntaxError) {
            // Ignore malformed SSE line
            continue;
          }
          throw err;
        }
      }
    }

    const tail = buffer.trim();
    if (tail.startsWith('data:')) {
      const payload = tail.slice(5).trim();
      if (payload && payload !== '[DONE]') {
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string | null;
                reasoning_content?: string | null;
                reasoning?: string | null;
              };
            }>;
          };
          const reasoningDelta =
            parsed.choices?.[0]?.delta?.reasoning_content ?? parsed.choices?.[0]?.delta?.reasoning;
          if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
            options.onReasoningToken?.(reasoningDelta);
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            fullText += delta;
            options.onToken(delta);
          }
        } catch {
          // ignore
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

export interface ChoiceLike {
  text?: string | null;
  finish_reason?: string | null;
  message?: {
    content?: string | Array<{ type?: string; text?: string }> | null;
    reasoning_content?: string | null;
    reasoning?: string | null;
  } | null;
}

export function extractChoiceText(choice?: ChoiceLike | null): string {
  if (!choice) return '';
  const content = choice.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }
  if (typeof choice.text === 'string') {
    return choice.text.trim();
  }
  return '';
}

export function parseJsonResponse<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      return JSON.parse(arrMatch[0]) as T;
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      return JSON.parse(objMatch[0]) as T;
    }
    throw new Error(`无法解析模型返回的 JSON: ${cleaned.slice(0, 120)}`);
  }
}

export async function chatCompletionJson<T>(
  config: LLMConfig,
  messages: ChatMessage[],
  options?: { signal?: AbortSignal; modelOverride?: string; maxTokens?: number; temperature?: number },
): Promise<T> {
  const url = normalizeBaseUrl(config.baseUrl);
  if (!url) throw new Error('大模型 Base URL 未配置');
  const model = (options?.modelOverride || config.fastModel || config.model).trim();
  if (!model) throw new Error('大模型 Model 未配置');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal: options?.signal,
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: options?.temperature ?? 0.65,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res));
  }

  const data = (await res.json()) as {
    choices?: ChoiceLike[];
  };

  const choice = data.choices?.[0];
  const content = extractChoiceText(choice);
  if (content) {
    return parseJsonResponse<T>(content);
  }

  const reasoning = (choice?.message?.reasoning_content || choice?.message?.reasoning || '').trim();
  if (reasoning && (reasoning.includes('[') || reasoning.includes('{'))) {
    try {
      return parseJsonResponse<T>(reasoning);
    } catch {
      // fall through to clear error below
    }
  }

  if (choice?.finish_reason === 'length') {
    throw new Error('模型输出被截断（思考内容耗尽 max_tokens，正文为空）');
  }
  throw new Error('模型返回内容为空');
}

export async function testConnection(
  config: LLMConfig,
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const url = normalizeBaseUrl(config.baseUrl);
  if (!url) {
    return { ok: false, latencyMs: 0, message: '请填写 Base URL' };
  }
  if (!config.model.trim()) {
    return { ok: false, latencyMs: 0, message: '请填写 Model 名称' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 16,
        stream: false,
      }),
    });
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      return { ok: false, latencyMs, message: await extractErrorMessage(res) };
    }
    return { ok: true, latencyMs, message: `连接成功 (${latencyMs}ms)` };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      latencyMs,
      message: `请求失败 (${msg})。请检查网络、Base URL 或接口 CORS 设置。`,
    };
  }
}
