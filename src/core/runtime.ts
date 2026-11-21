import guestCss from '../runtime-guest/guest.css?raw';
import { installGuestKit, type GuestBridge, type GuestMountRequest } from '../runtime-guest/guest-kit';
import type { AppRecord } from '../types';
import { StreamFenceStripper, streamChatCompletion } from './llm';
import { osState } from './os-state';
import {
  buildAppGenerationMessages,
  buildExtendFeatureMessages,
  buildMountMessages,
} from './prompts';

const IFRAME_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none';";

function buildPreambleHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}" />
<style>${guestCss}</style>
</head>
<body>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripScriptsForPreview(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*$/gi, '');
}

function executeEmbeddedScripts(doc: Document, container: Element): void {
  const scripts = Array.from(container.querySelectorAll('script'));
  for (const oldScript of scripts) {
    const newScript = doc.createElement('script');
    for (const attr of Array.from(oldScript.attributes)) {
      newScript.setAttribute(attr.name, attr.value);
    }
    newScript.textContent = oldScript.textContent ?? '';
    oldScript.replaceWith(newScript);
  }
}

class AppRuntimeManager {
  private appControllers = new Map<string, Set<AbortController>>();

  private registerController(appId: string): AbortController {
    const ctrl = new AbortController();
    let set = this.appControllers.get(appId);
    if (!set) {
      set = new Set();
      this.appControllers.set(appId, set);
    }
    set.add(ctrl);
    return ctrl;
  }

  private releaseController(appId: string, ctrl: AbortController): void {
    const set = this.appControllers.get(appId);
    if (!set) return;
    set.delete(ctrl);
    if (set.size === 0) {
      this.appControllers.delete(appId);
    }
  }

  abortGeneration(appId: string): void {
    const set = this.appControllers.get(appId);
    if (!set) return;
    for (const ctrl of set) {
      ctrl.abort();
    }
    this.appControllers.delete(appId);
  }

  private createBridge(appId: string, iframe: HTMLIFrameElement): GuestBridge {
    return {
      appId,
      requestMount: (req: GuestMountRequest) => this.handleMountRequest(appId, req),
      persistDom: () => {
        this.persistIframeDom(appId, iframe);
      },
    };
  }

  private persistIframeDom(appId: string, iframe: HTMLIFrameElement): void {
    const current = osState.apps.get(appId);
    if (!current || current.status !== 'ready') return;
    const bodyHtml = iframe.contentDocument?.body?.innerHTML;
    if (typeof bodyHtml !== 'string') return;
    void osState.upsertApp({
      ...current,
      html: bodyHtml,
      updatedAt: Date.now(),
    });
  }

  private handleMountRequest(appId: string, req: GuestMountRequest): () => void {
    const app = osState.apps.get(appId);
    if (!app) {
      req.onError('应用实例已卸载');
      return () => {};
    }

    const ctrl = this.registerController(appId);
    const stripper = new StreamFenceStripper();
    let accumulated = '';
    let rafPending = false;

    const schedulePreview = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (!ctrl.signal.aborted) {
          req.onChunk(accumulated);
        }
      });
    };

    const messages = buildMountMessages({
      appName: app.name,
      appDescription: app.description,
      mountPrompt: req.prompt,
      userInput: req.userInput,
      contextSnippet: req.contextSnippet,
    });

    streamChatCompletion(osState.llmConfig, messages, {
      signal: ctrl.signal,
      onToken: (token) => {
        const clean = stripper.push(token);
        if (clean) {
          accumulated += clean;
          schedulePreview();
        }
      },
    })
      .then(() => {
        const tail = stripper.flush();
        if (tail) accumulated += tail;
        if (!ctrl.signal.aborted) {
          req.onDone(accumulated);
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        req.onError(msg);
      })
      .finally(() => {
        this.releaseController(appId, ctrl);
      });

    return () => {
      ctrl.abort();
      this.releaseController(appId, ctrl);
    };
  }

  renderSavedApp(iframe: HTMLIFrameElement, app: AppRecord): void {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) return;

    doc.open();
    doc.write(buildPreambleHtml());
    installGuestKit(win, this.createBridge(app.id, iframe));

    if (app.status === 'error') {
      doc.write(`
        <div class="en-error-card">
          <h3>应用「${escapeHtml(app.name)}」生成失败</h3>
          <pre>${escapeHtml(app.errorMessage || '未知错误')}</pre>
        </div>
      `);
    } else {
      doc.write(app.html || '');
    }

    doc.write('</body></html>');
    doc.close();
  }

  async generateAppStream(iframe: HTMLIFrameElement, app: AppRecord): Promise<void> {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) return;

    const ctrl = this.registerController(app.id);
    const stripper = new StreamFenceStripper();
    let rawHtml = '';

    doc.open();
    doc.write(buildPreambleHtml());
    installGuestKit(win, this.createBridge(app.id, iframe));

    const messages = buildAppGenerationMessages({
      name: app.name,
      description: app.description,
      prompt: app.prompt,
    });

    try {
      await streamChatCompletion(osState.llmConfig, messages, {
        signal: ctrl.signal,
        onToken: (token) => {
          const clean = stripper.push(token);
          if (clean) {
            rawHtml += clean;
            doc.write(clean);
          }
        },
      });

      const tail = stripper.flush();
      if (tail) {
        rawHtml += tail;
        doc.write(tail);
      }

      doc.write('</body></html>');
      doc.close();

      if (ctrl.signal.aborted) return;
      const latest = osState.apps.get(app.id);
      if (!latest) return; // Uninstalled while streaming

      const persistedHtml = doc.body?.innerHTML || rawHtml;
      await osState.upsertApp({
        ...latest,
        html: persistedHtml,
        status: 'ready',
        errorMessage: undefined,
        updatedAt: Date.now(),
      });
    } catch (err) {
      if (ctrl.signal.aborted) {
        try {
          doc.close();
        } catch {
          // ignore
        }
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      try {
        doc.write(`
          <div class="en-error-card">
            <h3>生成中断 / 失败</h3>
            <pre>${escapeHtml(msg)}</pre>
          </div>
          </body></html>
        `);
        doc.close();
      } catch {
        // ignore
      }

      const latest = osState.apps.get(app.id);
      if (latest) {
        await osState.upsertApp({
          ...latest,
          status: 'error',
          errorMessage: msg,
          updatedAt: Date.now(),
        });
      }
    } finally {
      this.releaseController(app.id, ctrl);
    }
  }

  async extendAppFeature(
    iframe: HTMLIFrameElement,
    app: AppRecord,
    featureRequest: string,
  ): Promise<void> {
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;

    const ctrl = this.registerController(app.id);
    osState.setExtending(app.id, true);

    const host = doc.createElement('div');
    host.className = 'en-extension-host';
    host.innerHTML = `<div class="en-muted" style="color:var(--en-accent)">正在为应用添加功能: ${escapeHtml(featureRequest)}...</div>`;

    const shell = doc.body.querySelector('en-shell');
    const mountParent =
      shell?.querySelector('[slot="main"]') || shell || doc.body;
    mountParent.appendChild(host);
    host.scrollIntoView({ behavior: 'smooth', block: 'end' });

    const stripper = new StreamFenceStripper();
    let accumulated = '';
    let targetChecked = false;
    let rafPending = false;

    const renderPreview = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (!ctrl.signal.aborted) {
          host.innerHTML = stripScriptsForPreview(accumulated);
        }
      });
    };

    const messages = buildExtendFeatureMessages({
      appName: app.name,
      appDescription: app.description,
      currentHtml: doc.body.innerHTML,
      featureRequest,
    });

    try {
      await streamChatCompletion(osState.llmConfig, messages, {
        signal: ctrl.signal,
        onToken: (token) => {
          const clean = stripper.push(token);
          if (clean) {
            accumulated += clean;
            if (!targetChecked && accumulated.length > 48) {
              targetChecked = true;
              const match = accumulated.match(/^<!--\s*EXNIHILO_TARGET:\s*([^-\n>]+?)\s*-->/i);
              if (match) {
                const target = doc.querySelector(match[1].trim());
                if (target && target !== host && !host.contains(target)) {
                  target.appendChild(host);
                }
              }
            }
            renderPreview();
          }
        },
      });

      const tail = stripper.flush();
      if (tail) accumulated += tail;
      if (ctrl.signal.aborted) return;

      const cleanFragment = accumulated
        .replace(/^<!--\s*EXNIHILO_TARGET:[\s\S]*?-->\s*/i, '')
        .trim();

      if (!targetChecked) {
        const match = accumulated.match(/^<!--\s*EXNIHILO_TARGET:\s*([^-\n>]+?)\s*-->/i);
        if (match) {
          const target = doc.querySelector(match[1].trim());
          if (target && target !== host && !host.contains(target)) {
            target.appendChild(host);
          }
        }
      }

      host.innerHTML = cleanFragment;
      executeEmbeddedScripts(doc, host);
      doc.dispatchEvent(new Event('en-visibility-refresh'));

      const latest = osState.apps.get(app.id);
      if (latest && latest.status === 'ready') {
        await osState.upsertApp({
          ...latest,
          html: doc.body.innerHTML,
          updatedAt: Date.now(),
        });
      }
    } catch (err) {
      if (ctrl.signal.aborted) {
        host.remove();
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      host.innerHTML = `<div class="en-error-card" style="margin:0"><h3>扩展失败</h3><pre>${escapeHtml(msg)}</pre></div>`;
    } finally {
      this.releaseController(app.id, ctrl);
      osState.setExtending(app.id, false);
    }
  }
}

export const appRuntime = new AppRuntimeManager();
