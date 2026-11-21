import { testConnection } from '../core/llm';
import { osState } from '../core/os-state';
import type { LLMConfig } from '../types';

interface PresetItem {
  label: string;
  baseUrl: string;
  model: string;
  fastModel?: string;
  getHint?: (origin: string) => string;
}

const PRESETS: PresetItem[] = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', fastModel: 'gpt-4o-mini' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', fastModel: 'deepseek-chat' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.0-flash-001' },
  {
    label: 'Magpie (Dev Proxy)',
    baseUrl: '/magpie/v1',
    model: '',
    getHint: () => '已填入 Magpie 开发代理预设（仅在 npm run dev 下有效），请确认 Model 名称（及如需 Key）后测试或保存。',
  },
  {
    label: 'Magpie (直连 CORS)',
    baseUrl: 'http://127.0.0.1:3425/v1',
    model: '',
    getHint: (origin) =>
      `已填入 Magpie 直连预设：请在 Magpie「设置 › 网络与共享 › 网页」中添加白名单 ${origin}，并在「网关」页创建网关密钥填入上方 API Key 后测试或保存。`,
  },
];

export interface SettingsModalCallbacks {
  onClearAllApps: () => Promise<void>;
}

export class SettingsModal {
  readonly element: HTMLElement;
  private baseUrlInput: HTMLInputElement;
  private apiKeyInput: HTMLInputElement;
  private modelInput: HTMLInputElement;
  private fastModelInput: HTMLInputElement;
  private statusEl: HTMLElement;
  private appsCountEl: HTMLElement;
  private clearBtn: HTMLButtonElement;
  private testBtn: HTMLButtonElement;
  private callbacks: SettingsModalCallbacks;

  private wasOpen = false;
  private confirmingClear = false;
  private clearTimer = 0;

  constructor(callbacks: SettingsModalCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'os-overlay';

    this.element.innerHTML = `
      <div class="os-settings-panel" role="dialog" aria-label="大模型 API 配置">
        <div class="os-modal-header">
          <div class="os-modal-title">
            <span style="color:#1a73e8">⚙</span>
            <span>大模型接入配置 (OpenAI 兼容协议)</span>
          </div>
          <button type="button" class="os-win-ctrl-btn close" data-act="close" title="关闭">×</button>
        </div>

        <div class="os-form-field">
          <div class="os-form-label"><span>快捷预设</span></div>
          <div class="os-presets-row"></div>
        </div>

        <div class="os-form-field">
          <label class="os-form-label" for="en-cfg-url"><span>Base URL</span></label>
          <input id="en-cfg-url" class="os-input" type="text" placeholder="https://api.openai.com/v1" />
        </div>

        <div class="os-form-field">
          <label class="os-form-label" for="en-cfg-key">
            <span>API Key</span>
            <span style="font-size:11px">仅存储在当前浏览器 localStorage</span>
          </label>
          <div class="os-input-row">
            <input id="en-cfg-key" class="os-input" type="password" placeholder="sk-..." />
            <button type="button" class="os-ghost-btn" data-act="toggle-key" style="flex-shrink:0">显示</button>
          </div>
        </div>

        <div class="os-form-field">
          <label class="os-form-label" for="en-cfg-model"><span>主模型 (Model)</span></label>
          <input id="en-cfg-model" class="os-input" type="text" placeholder="gpt-4o-mini / deepseek-chat" />
        </div>

        <div class="os-form-field">
          <label class="os-form-label" for="en-cfg-fast">
            <span>快速候选模型 (可选)</span>
            <span style="font-size:11px">留空则复用主模型</span>
          </label>
          <input id="en-cfg-fast" class="os-input" type="text" placeholder="用于聚焦候选构想的轻量模型" />
        </div>

        <div class="os-modal-status"></div>

        <div class="os-modal-footer">
          <div class="os-btn-group">
            <span class="os-muted" data-role="apps-count">已缓存 0 个应用</span>
            <button type="button" class="os-win-pill-btn danger" data-act="clear-apps">清空应用</button>
          </div>
          <div class="os-btn-group">
            <button type="button" class="os-ghost-btn" data-act="test">测试连接</button>
            <button type="button" class="os-ghost-btn primary" data-act="save">保存配置</button>
          </div>
        </div>
      </div>
    `;

    this.baseUrlInput = this.element.querySelector('#en-cfg-url')!;
    this.apiKeyInput = this.element.querySelector('#en-cfg-key')!;
    this.modelInput = this.element.querySelector('#en-cfg-model')!;
    this.fastModelInput = this.element.querySelector('#en-cfg-fast')!;
    this.statusEl = this.element.querySelector('.os-modal-status')!;
    this.appsCountEl = this.element.querySelector('[data-role="apps-count"]')!;
    this.clearBtn = this.element.querySelector('[data-act="clear-apps"]')!;
    this.testBtn = this.element.querySelector('[data-act="test"]')!;

    const presetsRow = this.element.querySelector('.os-presets-row')!;
    for (const preset of PRESETS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'os-preset-chip';
      chip.textContent = preset.label;
      chip.addEventListener('click', () => {
        this.baseUrlInput.value = preset.baseUrl;
        if (preset.model) {
          this.modelInput.value = preset.model;
        } else if (!this.modelInput.value.trim()) {
          this.modelInput.focus();
        }
        this.fastModelInput.value = preset.fastModel || '';
        if (preset.getHint) {
          const origin =
            typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
              ? window.location.origin
              : 'https://renamoe.github.io';
          this.showStatus(preset.getHint(origin), 'info');
        } else {
          this.showStatus(`已填入 ${preset.label} 预设，请确认 API Key 后保存。`, 'info');
        }
      });
      presetsRow.appendChild(chip);
    }

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        osState.setSettingsOpen(false);
      }
    });

    this.element.querySelector('[data-act="close"]')!.addEventListener('click', () => {
      osState.setSettingsOpen(false);
    });

    const toggleKeyBtn = this.element.querySelector('[data-act="toggle-key"]') as HTMLButtonElement;
    toggleKeyBtn.addEventListener('click', () => {
      const hidden = this.apiKeyInput.type === 'password';
      this.apiKeyInput.type = hidden ? 'text' : 'password';
      toggleKeyBtn.textContent = hidden ? '隐藏' : '显示';
    });

    this.testBtn.addEventListener('click', () => void this.runTest());

    this.element.querySelector('[data-act="save"]')!.addEventListener('click', () => {
      const next = this.collectFormConfig();
      if (!next.baseUrl || !next.model) {
        this.showStatus('请填写 Base URL 和 Model 名称。', 'err');
        return;
      }
      osState.updateLLMConfig(next);
      this.showStatus('配置已保存到本地浏览器缓存。', 'ok');
      window.setTimeout(() => {
        osState.setSettingsOpen(false);
      }, 450);
    });

    this.clearBtn.addEventListener('click', () => {
      if (!this.confirmingClear) {
        this.confirmingClear = true;
        this.clearBtn.classList.add('confirming');
        this.clearBtn.textContent = '确认清空?';
        this.clearTimer = window.setTimeout(() => {
          this.confirmingClear = false;
          this.clearBtn.classList.remove('confirming');
          this.clearBtn.textContent = '清空应用';
        }, 3000);
      } else {
        if (this.clearTimer) window.clearTimeout(this.clearTimer);
        this.confirmingClear = false;
        this.clearBtn.classList.remove('confirming');
        this.clearBtn.textContent = '清空应用';
        void this.callbacks.onClearAllApps();
        this.showStatus('已清空全部缓存应用。', 'ok');
      }
    });
  }

  private collectFormConfig(): LLMConfig {
    return {
      ...osState.llmConfig,
      baseUrl: this.baseUrlInput.value.trim(),
      apiKey: this.apiKeyInput.value.trim(),
      model: this.modelInput.value.trim(),
      fastModel: this.fastModelInput.value.trim() || undefined,
    };
  }

  private async runTest(): Promise<void> {
    const cfg = this.collectFormConfig();
    this.testBtn.disabled = true;
    this.testBtn.textContent = '测试中...';
    this.showStatus('正在发送连通性测试请求...', 'info');

    const res = await testConnection(cfg);
    this.testBtn.disabled = false;
    this.testBtn.textContent = '测试连接';
    this.showStatus(res.message, res.ok ? 'ok' : 'err');
  }

  private showStatus(msg: string, kind: 'info' | 'ok' | 'err'): void {
    this.statusEl.textContent = msg;
    this.statusEl.className = 'os-modal-status visible';
    if (kind === 'ok') this.statusEl.classList.add('ok');
    if (kind === 'err') this.statusEl.classList.add('err');
  }

  render(): void {
    const isOpen = osState.settingsOpen;
    this.element.classList.toggle('open', isOpen);
    this.appsCountEl.textContent = `已缓存 ${osState.apps.size} 个应用`;
    this.clearBtn.disabled = osState.apps.size === 0;

    if (isOpen && !this.wasOpen) {
      this.wasOpen = true;
      const cfg = osState.llmConfig;
      this.baseUrlInput.value = cfg.baseUrl || '';
      this.apiKeyInput.value = cfg.apiKey || '';
      this.modelInput.value = cfg.model || '';
      this.fastModelInput.value = cfg.fastModel || '';
      this.statusEl.className = 'os-modal-status';
      this.statusEl.textContent = '';
    } else if (!isOpen) {
      this.wasOpen = false;
    }
  }
}
