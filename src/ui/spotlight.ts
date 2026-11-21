import { chatCompletionJson } from '../core/llm';
import { osState } from '../core/os-state';
import { buildCandidateMessages } from '../core/prompts';
import { isLLMConfigured } from '../core/storage';
import type { AppRecord, CandidateApp } from '../types';

export interface SpotlightCallbacks {
  onOpenInstalled: (appId: string) => void;
  onLaunchCandidate: (candidate: CandidateApp) => void;
  onOpenSettings: () => void;
}

type SelectableItem =
  | { kind: 'installed'; app: AppRecord }
  | { kind: 'candidate'; candidate: CandidateApp }
  | { kind: 'direct'; query: string };

export class SpotlightModal {
  readonly element: HTMLElement;
  private inputEl: HTMLInputElement;
  private resultsEl: HTMLElement;
  private callbacks: SpotlightCallbacks;

  private debounceTimer = 0;
  private candidateAbort: AbortController | null = null;
  private candidates: CandidateApp[] = [];
  private loadingCandidates = false;
  private candidateError = '';
  private selectedIndex = -1;
  private selectableItems: SelectableItem[] = [];
  private wasOpen = false;

  constructor(callbacks: SpotlightCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'os-overlay';

    this.element.innerHTML = `
      <div class="os-spotlight-panel" role="dialog" aria-label="ExNihilo 启动器">
        <div class="os-spotlight-input-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2">
            <circle cx="11" cy="11" r="7"/>
            <path d="M20 20L16.2 16.2" stroke-linecap="round"/>
          </svg>
          <input
            type="text"
            class="os-spotlight-input"
            placeholder="搜索应用，或输入想法实时生成新应用..."
            autocomplete="off"
          />
          <span class="os-spotlight-kbd">Enter 生成</span>
        </div>
        <div class="os-spotlight-results"></div>
      </div>
    `;

    this.inputEl = this.element.querySelector('.os-spotlight-input')!;
    this.resultsEl = this.element.querySelector('.os-spotlight-results')!;

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        osState.setSpotlightOpen(false);
      }
    });

    this.inputEl.addEventListener('input', () => {
      this.selectedIndex = -1;
      this.handleQueryChanged();
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        osState.setSpotlightOpen(false);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.selectableItems.length > 0) {
          this.selectedIndex = (this.selectedIndex + 1) % this.selectableItems.length;
          this.renderResults();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.selectableItems.length > 0) {
          this.selectedIndex =
            this.selectedIndex <= 0
              ? this.selectableItems.length - 1
              : this.selectedIndex - 1;
          this.renderResults();
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const query = this.inputEl.value.trim();

        if (this.selectedIndex >= 0 && this.selectedIndex < this.selectableItems.length) {
          const item = this.selectableItems[this.selectedIndex];
          this.triggerItem(item);
          return;
        }

        if (query) {
          this.launchDirect(query);
        }
      }
    });
  }

  render(): void {
    const isOpen = osState.spotlightOpen;
    this.element.classList.toggle('open', isOpen);

    if (isOpen && !this.wasOpen) {
      this.wasOpen = true;
      this.selectedIndex = -1;
      this.candidates = [];
      this.candidateError = '';
      this.loadingCandidates = false;
      this.renderResults();
      window.requestAnimationFrame(() => {
        this.inputEl.focus();
        this.inputEl.select();
      });
    } else if (!isOpen && this.wasOpen) {
      this.wasOpen = false;
      this.cancelPendingCandidates();
    } else if (isOpen) {
      this.renderResults();
    }
  }

  private cancelPendingCandidates(): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = 0;
    }
    if (this.candidateAbort) {
      this.candidateAbort.abort();
      this.candidateAbort = null;
    }
  }

  private handleQueryChanged(): void {
    this.cancelPendingCandidates();
    this.candidates = [];
    this.candidateError = '';

    const query = this.inputEl.value.trim();
    if (!query) {
      this.loadingCandidates = false;
      this.renderResults();
      return;
    }

    if (!isLLMConfigured(osState.llmConfig)) {
      this.loadingCandidates = false;
      this.renderResults();
      return;
    }

    this.loadingCandidates = true;
    this.renderResults();

    this.debounceTimer = window.setTimeout(() => {
      void this.fetchCandidates(query);
    }, 1300);
  }

  private async fetchCandidates(query: string): Promise<void> {
    const ctrl = new AbortController();
    this.candidateAbort = ctrl;

    const existingNames = Array.from(osState.apps.values()).map((a) => a.name);
    const messages = buildCandidateMessages(query, existingNames);

    try {
      const list = await chatCompletionJson<CandidateApp[]>(osState.llmConfig, messages, {
        signal: ctrl.signal,
      });

      if (ctrl.signal.aborted || this.inputEl.value.trim() !== query) return;
      this.candidates = Array.isArray(list)
        ? list
            .filter((item) => item && typeof item.name === 'string' && item.name.trim())
            .slice(0, 4)
            .map((item) => ({
              name: item.name.trim(),
              icon: (item.icon || '📦').trim(),
              description: (item.description || '').trim(),
              prompt: (item.prompt || item.name).trim(),
            }))
        : [];
      this.candidateError = '';
    } catch (err) {
      if (ctrl.signal.aborted) return;
      this.candidates = [];
      this.candidateError = err instanceof Error ? err.message : String(err);
    } finally {
      if (!ctrl.signal.aborted) {
        this.loadingCandidates = false;
        this.renderResults();
      }
    }
  }

  private getMatchingInstalledApps(query: string): AppRecord[] {
    const all = Array.from(osState.apps.values());
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.prompt.toLowerCase().includes(q),
    );
  }

  private triggerItem(item: SelectableItem): void {
    osState.setSpotlightOpen(false);
    if (item.kind === 'installed') {
      this.callbacks.onOpenInstalled(item.app.id);
    } else if (item.kind === 'candidate') {
      this.callbacks.onLaunchCandidate(item.candidate);
    } else {
      this.launchDirect(item.query);
    }
  }

  private launchDirect(query: string): void {
    osState.setSpotlightOpen(false);
    this.callbacks.onLaunchCandidate({
      name: query.length > 24 ? `${query.slice(0, 24)}...` : query,
      icon: '📦',
      description: `根据「${query}」实时生成`,
      prompt: query,
    });
  }

  private renderResults(): void {
    const query = this.inputEl.value.trim();
    const installed = this.getMatchingInstalledApps(query);
    const configured = isLLMConfigured(osState.llmConfig);

    this.selectableItems = [];
    this.resultsEl.innerHTML = '';

    // 1. Installed Apps Section (priority)
    if (installed.length > 0) {
      const secTitle = document.createElement('div');
      secTitle.className = 'os-spotlight-section-title';
      secTitle.innerHTML = `<span>已安装</span><span>${installed.length}</span>`;
      this.resultsEl.appendChild(secTitle);

      for (const app of installed) {
        const idx = this.selectableItems.length;
        this.selectableItems.push({ kind: 'installed', app });
        this.resultsEl.appendChild(
          this.buildItemRow({
            icon: app.icon || '📦',
            name: app.name,
            desc: app.description || app.prompt,
            pillText: app.status === 'generating' ? '生成中' : '已安装',
            pillClass: 'installed',
            selected: this.selectedIndex === idx,
            onClick: () => this.triggerItem({ kind: 'installed', app }),
          }),
        );
      }
    }

    if (!query) {
      if (installed.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'os-spotlight-empty';
        empty.textContent = configured
          ? '输入任意应用想法（如「记事本」「天气」「音乐播放器」），停顿片刻获取 AI 候选，或按回车立即生成。'
          : '输入任意应用想法开始使用，请先在右下角或下方配置大模型 API Key。';
        this.resultsEl.appendChild(empty);
      }
      if (!configured) {
        this.appendUnconfiguredNotice();
      }
      return;
    }

    // 2. AI Candidates Section
    const candTitle = document.createElement('div');
    candTitle.className = 'os-spotlight-section-title';
    candTitle.innerHTML = `<span>AI 候选</span><span>${
      this.loadingCandidates ? '生成候选中...' : configured ? '点击创建' : '未配置 API'
    }</span>`;
    this.resultsEl.appendChild(candTitle);

    if (!configured) {
      this.appendUnconfiguredNotice();
      return;
    }

    if (this.loadingCandidates) {
      for (let i = 0; i < 3; i++) {
        const skel = document.createElement('div');
        skel.className = 'os-shimmer-card';
        this.resultsEl.appendChild(skel);
      }
    } else if (this.candidateError) {
      const errDiv = document.createElement('div');
      errDiv.className = 'os-spotlight-empty';
      errDiv.style.color = '#c5221f';
      errDiv.textContent = `候选生成失败：${this.candidateError}（仍可直接按回车生成）`;
      this.resultsEl.appendChild(errDiv);
    } else {
      for (const cand of this.candidates) {
        const idx = this.selectableItems.length;
        this.selectableItems.push({ kind: 'candidate', candidate: cand });
        this.resultsEl.appendChild(
          this.buildItemRow({
            icon: cand.icon || '📦',
            name: cand.name,
            desc: cand.description,
            pillText: '立即生成',
            pillClass: 'candidate',
            selected: this.selectedIndex === idx,
            onClick: () => this.triggerItem({ kind: 'candidate', candidate: cand }),
          }),
        );
      }
    }

    // Direct generation action
    const directIdx = this.selectableItems.length;
    this.selectableItems.push({ kind: 'direct', query });
    this.resultsEl.appendChild(
      this.buildItemRow({
        icon: '+',
        name: `创建「${query}」`,
        desc: '立即根据当前输入流式构造应用界面',
        pillText: 'Enter',
        pillClass: 'direct',
        selected: this.selectedIndex === directIdx,
        onClick: () => this.triggerItem({ kind: 'direct', query }),
      }),
    );
  }

  private appendUnconfiguredNotice(): void {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'os-spotlight-item';
    btn.innerHTML = `
      <div class="os-spotlight-item-icon">⚙</div>
      <div class="os-spotlight-item-body">
        <div class="os-spotlight-item-name">尚未配置大模型 API Key</div>
        <div class="os-spotlight-item-desc">点击此处前往填写 Base URL、API Key 与 Model 名称</div>
      </div>
      <span class="os-pill direct">去配置</span>
    `;
    btn.addEventListener('click', () => {
      osState.setSpotlightOpen(false);
      this.callbacks.onOpenSettings();
    });
    this.resultsEl.appendChild(btn);
  }

  private buildItemRow(opts: {
    icon: string;
    name: string;
    desc: string;
    pillText: string;
    pillClass: string;
    selected: boolean;
    onClick: () => void;
  }): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `os-spotlight-item${opts.selected ? ' selected' : ''}`;
    btn.innerHTML = `
      <div class="os-spotlight-item-icon"></div>
      <div class="os-spotlight-item-body">
        <div class="os-spotlight-item-name"></div>
        <div class="os-spotlight-item-desc"></div>
      </div>
      <span class="os-pill ${opts.pillClass}"></span>
    `;
    btn.querySelector('.os-spotlight-item-icon')!.textContent = opts.icon;
    btn.querySelector('.os-spotlight-item-name')!.textContent = opts.name;
    btn.querySelector('.os-spotlight-item-desc')!.textContent = opts.desc;
    btn.querySelector('.os-pill')!.textContent = opts.pillText;
    btn.addEventListener('click', opts.onClick);
    return btn;
  }
}
