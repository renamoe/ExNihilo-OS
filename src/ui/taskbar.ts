import { osState } from '../core/os-state';
import { isLLMConfigured } from '../core/storage';

export interface TaskbarCallbacks {
  onToggleSpotlight: () => void;
  onToggleSettings: () => void;
  onClickWindow: (appId: string) => void;
}

export class TaskbarView {
  readonly element: HTMLElement;
  private systemBtn: HTMLButtonElement;
  private appsContainer: HTMLElement;
  private llmBtn: HTMLButtonElement;
  private llmDot: HTMLElement;
  private llmLabel: HTMLElement;
  private clockTimeEl: HTMLElement;
  private clockDateEl: HTMLElement;
  private callbacks: TaskbarCallbacks;

  constructor(callbacks: TaskbarCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('footer');
    this.element.className = 'os-taskbar';

    this.element.innerHTML = `
      <button type="button" class="os-system-btn" title="启动器 (Ctrl/⌘ + K)" aria-label="ExNihilo 启动器">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke="#f1f3f4" stroke-width="2"/>
          <circle cx="12" cy="12" r="3.5" fill="#f1f3f4"/>
        </svg>
      </button>
      <div class="os-taskbar-apps"></div>
      <div class="os-taskbar-right">
        <button type="button" class="os-llm-btn" title="大模型 API 设置">
          <span class="os-indicator-dot"></span>
          <span class="os-llm-label"></span>
        </button>
        <div class="os-clock">
          <span class="os-clock-time">--:--</span>
          <span class="os-clock-date">----/--/--</span>
        </div>
      </div>
    `;

    this.systemBtn = this.element.querySelector('.os-system-btn')!;
    this.appsContainer = this.element.querySelector('.os-taskbar-apps')!;
    this.llmBtn = this.element.querySelector('.os-llm-btn')!;
    this.llmDot = this.element.querySelector('.os-indicator-dot')!;
    this.llmLabel = this.element.querySelector('.os-llm-label')!;
    this.clockTimeEl = this.element.querySelector('.os-clock-time')!;
    this.clockDateEl = this.element.querySelector('.os-clock-date')!;

    this.systemBtn.addEventListener('click', () => this.callbacks.onToggleSpotlight());
    this.llmBtn.addEventListener('click', () => this.callbacks.onToggleSettings());

    this.updateClock();
    window.setInterval(() => this.updateClock(), 1000);
  }

  private updateClock(): void {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const yyyy = now.getFullYear();
    const mon = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    this.clockTimeEl.textContent = `${hh}:${mm}`;
    this.clockDateEl.textContent = `${yyyy}/${mon}/${dd} ${weekdays[now.getDay()]}`;
  }

  render(): void {
    this.systemBtn.classList.toggle('active', osState.spotlightOpen);

    const configured = isLLMConfigured(osState.llmConfig);
    this.llmDot.classList.toggle('ready', configured);
    this.llmLabel.textContent = configured
      ? osState.llmConfig.model.trim()
      : '未配置 API';

    this.appsContainer.innerHTML = '';
    for (const win of osState.windows.values()) {
      const app = osState.apps.get(win.appId);
      if (!app) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = osState.activeWindowId === win.appId && !win.minimized;
      btn.className = `os-taskbar-app-btn${isActive ? ' active' : ''}`;
      btn.title = app.name;

      const iconSpan = document.createElement('span');
      iconSpan.textContent = app.icon || '📦';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'os-taskbar-app-name';
      nameSpan.textContent = app.name;

      btn.append(iconSpan, nameSpan);

      if (app.status === 'generating' || win.extending) {
        const pulse = document.createElement('span');
        pulse.className = 'os-taskbar-app-pulse';
        btn.appendChild(pulse);
      }

      btn.addEventListener('click', () => this.callbacks.onClickWindow(win.appId));
      this.appsContainer.appendChild(btn);
    }
  }
}
