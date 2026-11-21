import { osState } from '../core/os-state';
import { appRuntime } from '../core/runtime';
import type { WindowInstance } from '../types';

export interface WindowManagerCallbacks {
  onAbortAndDelete: (appId: string) => void;
  onUninstallApp: (appId: string) => void;
  onExtendApp: (appId: string, iframe: HTMLIFrameElement, featureRequest: string) => void;
}

interface ManagedWindowDom {
  root: HTMLElement;
  topbar: HTMLElement;
  iconEl: HTMLElement;
  titleEl: HTMLElement;
  badgeEl: HTMLElement;
  extendBtn: HTMLButtonElement;
  deleteBtn: HTMLButtonElement;
  extendDrawer: HTMLElement;
  extendInput: HTMLInputElement;
  extendSubmitBtn: HTMLButtonElement;
  iframe: HTMLIFrameElement;
  confirmTimer: number;
  confirmingDelete: boolean;
  renderedApp: boolean;
}

export class WindowManager {
  readonly element: HTMLElement;
  private managed = new Map<string, ManagedWindowDom>();
  private callbacks: WindowManagerCallbacks;

  constructor(callbacks: WindowManagerCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'os-window-layer';
  }

  /**
   * Ensures a window DOM & iframe exist for appId without triggering saved-HTML rendering.
   * Used when launching a brand-new streaming generation directly into the iframe.
   */
  prepareStreamingIframe(appId: string): HTMLIFrameElement | null {
    const win = osState.windows.get(appId);
    if (!win) return null;
    this.reconcileWindow(win, true);
    return this.managed.get(appId)?.iframe ?? null;
  }

  render(): void {
    // Remove closed windows
    for (const [appId, dom] of this.managed) {
      if (!osState.windows.has(appId)) {
        if (dom.confirmTimer) window.clearTimeout(dom.confirmTimer);
        dom.root.remove();
        this.managed.delete(appId);
      }
    }

    // Create / update open windows
    for (const win of osState.windows.values()) {
      this.reconcileWindow(win, false);
    }
  }

  private reconcileWindow(win: WindowInstance, skipInitialRender: boolean): void {
    const app = osState.apps.get(win.appId);
    if (!app) return;

    let dom = this.managed.get(win.appId);
    if (!dom) {
      dom = this.createWindowDom(win);
      this.managed.set(win.appId, dom);
      this.element.appendChild(dom.root);
    }

    if (!dom.renderedApp && !skipInitialRender) {
      dom.renderedApp = true;
      appRuntime.renderSavedApp(dom.iframe, app);
    } else if (skipInitialRender) {
      dom.renderedApp = true;
    }

    const isActive = osState.activeWindowId === win.appId && !win.minimized;
    dom.root.classList.toggle('active', isActive);
    dom.root.classList.toggle('minimized', win.minimized);
    dom.root.classList.toggle('maximized', win.maximized);
    dom.root.classList.toggle('generating', app.status === 'generating' || win.extending);

    dom.root.style.left = `${win.x}px`;
    dom.root.style.top = `${win.y}px`;
    dom.root.style.width = `${win.width}px`;
    dom.root.style.height = `${win.height}px`;
    dom.root.style.zIndex = String(win.zIndex);

    dom.iconEl.textContent = app.icon || '📦';
    dom.titleEl.textContent = app.name;

    if (app.status === 'generating') {
      dom.badgeEl.style.display = 'inline-block';
      dom.badgeEl.className = 'os-window-badge';
      dom.badgeEl.textContent = '生成中...';
    } else if (win.extending) {
      dom.badgeEl.style.display = 'inline-block';
      dom.badgeEl.className = 'os-window-badge extending';
      dom.badgeEl.textContent = '扩展中...';
    } else if (app.status === 'error') {
      dom.badgeEl.style.display = 'inline-block';
      dom.badgeEl.className = 'os-window-badge error';
      dom.badgeEl.textContent = '生成失败';
    } else {
      dom.badgeEl.style.display = 'none';
    }

    dom.extendBtn.disabled = app.status !== 'ready' || win.extending;
    dom.extendBtn.classList.toggle('active', win.extendOpen);
    dom.extendDrawer.classList.toggle('open', win.extendOpen);
    dom.extendInput.disabled = win.extending;
    dom.extendSubmitBtn.disabled = win.extending;

    if (app.status === 'generating') {
      dom.confirmingDelete = false;
      dom.deleteBtn.className = 'os-win-pill-btn danger';
      dom.deleteBtn.textContent = '⏹ 终止并删除';
      dom.deleteBtn.title = '立即停止生成并删除此应用';
    } else if (dom.confirmingDelete) {
      dom.deleteBtn.className = 'os-win-pill-btn danger confirming';
      dom.deleteBtn.textContent = '确认卸载?';
    } else {
      dom.deleteBtn.className = 'os-win-pill-btn danger';
      dom.deleteBtn.textContent = '🗑 卸载';
      dom.deleteBtn.title = '从系统删除此应用';
    }
  }

  private createWindowDom(win: WindowInstance): ManagedWindowDom {
    const root = document.createElement('section');
    root.className = 'os-window';
    root.innerHTML = `
      <div class="os-window-topbar">
        <div class="os-window-title-group">
          <span class="os-window-icon"></span>
          <span class="os-window-title"></span>
          <span class="os-window-badge"></span>
        </div>
        <div class="os-window-actions">
          <button type="button" class="os-win-pill-btn" data-act="extend" title="为应用新增扩展功能">+ 扩展功能</button>
          <button type="button" class="os-win-pill-btn danger" data-act="delete"></button>
          <div class="os-win-ctrl-group">
            <button type="button" class="os-win-ctrl-btn" data-act="min" title="最小化">−</button>
            <button type="button" class="os-win-ctrl-btn" data-act="max" title="最大化 / 还原">□</button>
            <button type="button" class="os-win-ctrl-btn close" data-act="close" title="关闭窗口">×</button>
          </div>
        </div>
      </div>
      <div class="os-extend-drawer">
        <input type="text" class="os-extend-input" placeholder="描述想要新增的功能，回车立即添加（如：加一个夜间模式切换、加一个统计面板）..." />
        <button type="button" class="os-win-pill-btn" data-act="extend-submit">添加功能</button>
      </div>
      <div class="os-window-body">
        <iframe class="os-window-iframe" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
      </div>
      <div class="os-window-resize"></div>
    `;

    const dom: ManagedWindowDom = {
      root,
      topbar: root.querySelector('.os-window-topbar')!,
      iconEl: root.querySelector('.os-window-icon')!,
      titleEl: root.querySelector('.os-window-title')!,
      badgeEl: root.querySelector('.os-window-badge')!,
      extendBtn: root.querySelector('[data-act="extend"]')!,
      deleteBtn: root.querySelector('[data-act="delete"]')!,
      extendDrawer: root.querySelector('.os-extend-drawer')!,
      extendInput: root.querySelector('.os-extend-input')!,
      extendSubmitBtn: root.querySelector('[data-act="extend-submit"]')!,
      iframe: root.querySelector('.os-window-iframe')!,
      confirmTimer: 0,
      confirmingDelete: false,
      renderedApp: false,
    };

    const appId = win.appId;

    root.addEventListener('pointerdown', () => {
      osState.focusWindow(appId);
    });

    root.querySelector('[data-act="min"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      osState.toggleMinimize(appId);
    });
    root.querySelector('[data-act="max"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      osState.toggleMaximize(appId);
    });
    root.querySelector('[data-act="close"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      osState.closeWindow(appId);
    });

    dom.extendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentWin = osState.windows.get(appId);
      if (!currentWin) return;
      const nextOpen = !currentWin.extendOpen;
      osState.setExtendOpen(appId, nextOpen);
      if (nextOpen) {
        window.requestAnimationFrame(() => dom.extendInput.focus());
      }
    });

    const submitExtend = () => {
      const text = dom.extendInput.value.trim();
      const app = osState.apps.get(appId);
      const currentWin = osState.windows.get(appId);
      if (!text || !app || !currentWin || currentWin.extending) return;
      dom.extendInput.value = '';
      osState.setExtendOpen(appId, false);
      this.callbacks.onExtendApp(appId, dom.iframe, text);
    };

    dom.extendSubmitBtn.addEventListener('click', submitExtend);
    dom.extendInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitExtend();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        osState.setExtendOpen(appId, false);
      }
    });

    dom.deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const app = osState.apps.get(appId);
      if (!app) return;
      if (app.status === 'generating') {
        this.callbacks.onAbortAndDelete(appId);
        return;
      }

      if (!dom.confirmingDelete) {
        dom.confirmingDelete = true;
        this.reconcileWindow(osState.windows.get(appId)!, true);
        dom.confirmTimer = window.setTimeout(() => {
          dom.confirmingDelete = false;
          const w = osState.windows.get(appId);
          if (w) this.reconcileWindow(w, true);
        }, 3000);
      } else {
        if (dom.confirmTimer) window.clearTimeout(dom.confirmTimer);
        this.callbacks.onUninstallApp(appId);
      }
    });

    this.attachDragAndResize(dom, appId);
    return dom;
  }

  private attachDragAndResize(dom: ManagedWindowDom, appId: string): void {
    const osRoot = document.getElementById('os-root');

    // Drag topbar
    dom.topbar.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const currentWin = osState.windows.get(appId);
      if (!currentWin || currentWin.maximized) return;

      e.preventDefault();
      osState.focusWindow(appId);
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = currentWin.x;
      const origY = currentWin.y;

      dom.topbar.setPointerCapture(e.pointerId);
      osRoot?.classList.add('os-dragging');

      const onMove = (ev: PointerEvent) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight - 48;
        const nx = Math.max(-currentWin.width + 120, Math.min(vw - 120, origX + (ev.clientX - startX)));
        const ny = Math.max(0, Math.min(vh - 40, origY + (ev.clientY - startY)));
        osState.updateWindowRect(appId, { x: nx, y: ny });
        dom.root.style.left = `${nx}px`;
        dom.root.style.top = `${ny}px`;
      };

      const onUp = () => {
        osRoot?.classList.remove('os-dragging');
        dom.topbar.removeEventListener('pointermove', onMove);
        dom.topbar.removeEventListener('pointerup', onUp);
        dom.topbar.removeEventListener('pointercancel', onUp);
      };

      dom.topbar.addEventListener('pointermove', onMove);
      dom.topbar.addEventListener('pointerup', onUp);
      dom.topbar.addEventListener('pointercancel', onUp);
    });

    // Resize handle
    const handle = dom.root.querySelector('.os-window-resize') as HTMLElement;
    handle.addEventListener('pointerdown', (e) => {
      const currentWin = osState.windows.get(appId);
      if (!currentWin || currentWin.maximized) return;

      e.preventDefault();
      e.stopPropagation();
      osState.focusWindow(appId);
      const startX = e.clientX;
      const startY = e.clientY;
      const origW = currentWin.width;
      const origH = currentWin.height;

      handle.setPointerCapture(e.pointerId);
      osRoot?.classList.add('os-dragging');

      const onMove = (ev: PointerEvent) => {
        const nw = Math.max(360, origW + (ev.clientX - startX));
        const nh = Math.max(280, origH + (ev.clientY - startY));
        osState.updateWindowRect(appId, { width: nw, height: nh });
        dom.root.style.width = `${nw}px`;
        dom.root.style.height = `${nh}px`;
      };

      const onUp = () => {
        osRoot?.classList.remove('os-dragging');
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
  }
}
