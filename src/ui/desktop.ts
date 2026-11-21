import { osState } from '../core/os-state';
import type { AppRecord } from '../types';

export interface DesktopCallbacks {
  onOpenApp: (appId: string) => void;
  onUninstallApp: (appId: string) => void;
  onOpenSpotlight: () => void;
  onOpenSettings: () => void;
}

export class DesktopView {
  readonly element: HTMLElement;
  private gridEl: HTMLElement;
  private watermarkEl: HTMLElement;
  private contextMenuEl: HTMLElement | null = null;
  private callbacks: DesktopCallbacks;
  private lastAppsSignature = '';

  constructor(callbacks: DesktopCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'os-desktop';

    this.element.innerHTML = `
      <div class="os-backdrop">
        <div class="os-backdrop-wallpaper">
          <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
            <path d="M-80 610C220 480 490 660 820 530C1110 415 1290 480 1540 370V920H-80V610Z" fill="rgba(138, 180, 248, 0.14)"/>
            <path d="M-60 720C280 590 620 770 960 640C1200 548 1360 600 1520 540V920H-60V720Z" fill="rgba(174, 203, 250, 0.12)"/>
            <circle cx="1140" cy="210" r="240" fill="rgba(253, 214, 99, 0.08)"/>
            <circle cx="240" cy="180" r="190" fill="rgba(138, 180, 248, 0.1)"/>
          </svg>
        </div>
      </div>
      <div class="os-void-watermark" style="display:none">
        <div class="os-welcome-card">
          <div class="os-void-emblem">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="11" stroke="#1a73e8" stroke-width="2.4"/>
              <circle cx="16" cy="16" r="4.5" fill="#1a73e8"/>
            </svg>
          </div>
          <div class="os-void-title">ExNihilo OS</div>
          <div class="os-void-subtitle">
            无预设内核，所有应用界面与媒体均由大模型实时生成。<br/>
            配置 API 后，按下 <span class="os-kbd-chip">Ctrl / ⌘ + K</span> 或点击左下角启动器开始创建应用。
          </div>
          <div class="os-void-actions">
            <button type="button" class="os-ghost-btn primary" data-action="spotlight">启动器 / 创建应用</button>
            <button type="button" class="os-ghost-btn" data-action="settings">大模型 API 设置</button>
          </div>
        </div>
      </div>
      <div class="os-desktop-grid"></div>
    `;

    this.watermarkEl = this.element.querySelector('.os-void-watermark')!;
    this.gridEl = this.element.querySelector('.os-desktop-grid')!;

    this.watermarkEl.querySelector('[data-action="spotlight"]')!.addEventListener('click', () => {
      this.callbacks.onOpenSpotlight();
    });
    this.watermarkEl.querySelector('[data-action="settings"]')!.addEventListener('click', () => {
      this.callbacks.onOpenSettings();
    });

    document.addEventListener('click', () => this.closeContextMenu());
    window.addEventListener('blur', () => this.closeContextMenu());
  }

  render(): void {
    const apps = Array.from(osState.apps.values());
    const signature = apps
      .map((a) => `${a.id}:${a.name}:${a.icon}:${a.description}:${a.status}`)
      .join('|');

    this.watermarkEl.style.display = apps.length === 0 ? 'flex' : 'none';

    if (signature === this.lastAppsSignature) return;
    this.lastAppsSignature = signature;

    this.gridEl.innerHTML = '';
    for (const app of apps) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-desktop-icon${app.status === 'generating' ? ' generating' : ''}`;
      btn.title = app.description || app.name;

      const dotHtml =
        app.status === 'generating'
          ? '<span class="os-status-dot" title="正在生成"></span>'
          : app.status === 'error'
            ? '<span class="os-status-dot error" title="生成失败"></span>'
            : '';

      btn.innerHTML = `
        <div class="os-desktop-icon-glyph">
          <span></span>
          ${dotHtml}
        </div>
        <div class="os-desktop-icon-label"></div>
      `;
      btn.querySelector('.os-desktop-icon-glyph span')!.textContent = app.icon || '📦';
      btn.querySelector('.os-desktop-icon-label')!.textContent = app.name;

      btn.addEventListener('click', () => {
        this.callbacks.onOpenApp(app.id);
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openContextMenu(e.clientX, e.clientY, app);
      });

      this.gridEl.appendChild(btn);
    }
  }

  private openContextMenu(x: number, y: number, app: AppRecord): void {
    this.closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'os-desktop-context-menu';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'os-context-item';
    openBtn.textContent = '↗ 打开应用';
    openBtn.addEventListener('click', () => {
      this.closeContextMenu();
      this.callbacks.onOpenApp(app.id);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'os-context-item danger';
    delBtn.textContent = app.status === 'generating' ? '✕ 终止并删除' : '🗑 卸载应用';
    delBtn.addEventListener('click', () => {
      this.closeContextMenu();
      this.callbacks.onUninstallApp(app.id);
    });

    menu.append(openBtn, delBtn);
    document.body.appendChild(menu);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, vw - rect.width - 8)}px`;
    menu.style.top = `${Math.min(y, vh - rect.height - 8)}px`;
    this.contextMenuEl = menu;
  }

  private closeContextMenu(): void {
    if (this.contextMenuEl) {
      this.contextMenuEl.remove();
      this.contextMenuEl = null;
    }
  }
}
