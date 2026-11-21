import type { AppRecord, LLMConfig, WindowInstance } from '../types';
import {
  clearAllApps,
  deleteApp,
  getAllApps,
  loadLLMConfig,
  saveApp,
  saveLLMConfig,
} from './storage';

type Listener = () => void;

class OSStateStore {
  apps = new Map<string, AppRecord>();
  windows = new Map<string, WindowInstance>();
  activeWindowId: string | null = null;
  spotlightOpen = false;
  settingsOpen = false;
  llmConfig: LLMConfig = loadLLMConfig();

  private listeners = new Set<Listener>();
  private topZ = 10;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  async init(): Promise<void> {
    this.llmConfig = loadLLMConfig();
    const savedApps = await getAllApps();
    this.apps.clear();
    for (const app of savedApps) {
      if (app.status === 'generating' && !app.html) {
        // Interrupted generation from a closed tab: mark as error so user can retry or delete
        app.status = 'error';
        app.errorMessage = '上次生成在完成前被中断';
      } else if (app.status === 'generating') {
        app.status = 'ready';
      }
      this.apps.set(app.id, app);
    }
    this.emit();
  }

  async upsertApp(app: AppRecord, persist = true): Promise<void> {
    this.apps.set(app.id, app);
    if (persist) {
      await saveApp(app);
    }
    this.emit();
  }

  async removeApp(appId: string): Promise<void> {
    this.apps.delete(appId);
    this.windows.delete(appId);
    if (this.activeWindowId === appId) {
      this.activeWindowId = this.findTopWindowId();
    }
    await deleteApp(appId);
    this.emit();
  }

  async clearApps(): Promise<void> {
    this.apps.clear();
    this.windows.clear();
    this.activeWindowId = null;
    await clearAllApps();
    this.emit();
  }

  openWindow(appId: string): void {
    const existing = this.windows.get(appId);
    if (existing) {
      existing.minimized = false;
      this.focusWindow(appId);
      return;
    }

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight - 52 : 740;
    const width = Math.min(820, Math.max(400, vw - 80));
    const height = Math.min(580, Math.max(320, vh - 64));

    const offsetIndex = this.windows.size % 6;
    const baseX = Math.max(24, Math.round((vw - width) / 2) - 48 + offsetIndex * 26);
    const baseY = Math.max(20, Math.round((vh - height) / 2) - 36 + offsetIndex * 24);

    const win: WindowInstance = {
      appId,
      x: Math.min(baseX, Math.max(12, vw - width - 12)),
      y: Math.min(baseY, Math.max(12, vh - height - 12)),
      width,
      height,
      zIndex: ++this.topZ,
      minimized: false,
      maximized: false,
      extendOpen: false,
      extending: false,
    };

    this.windows.set(appId, win);
    this.activeWindowId = appId;
    this.emit();
  }

  closeWindow(appId: string): void {
    if (!this.windows.has(appId)) return;
    this.windows.delete(appId);
    if (this.activeWindowId === appId) {
      this.activeWindowId = this.findTopWindowId();
    }
    this.emit();
  }

  focusWindow(appId: string): void {
    const win = this.windows.get(appId);
    if (!win) return;
    win.minimized = false;
    win.zIndex = ++this.topZ;
    this.activeWindowId = appId;
    this.emit();
  }

  toggleMinimize(appId: string): void {
    const win = this.windows.get(appId);
    if (!win) return;
    if (win.minimized) {
      this.focusWindow(appId);
      return;
    }
    if (this.activeWindowId === appId) {
      win.minimized = true;
      this.activeWindowId = this.findTopWindowId();
      this.emit();
    } else {
      this.focusWindow(appId);
    }
  }

  toggleMaximize(appId: string): void {
    const win = this.windows.get(appId);
    if (!win) return;
    win.maximized = !win.maximized;
    win.zIndex = ++this.topZ;
    this.activeWindowId = appId;
    this.emit();
  }

  updateWindowRect(appId: string, rect: Partial<Pick<WindowInstance, 'x' | 'y' | 'width' | 'height'>>): void {
    const win = this.windows.get(appId);
    if (!win) return;
    Object.assign(win, rect);
  }

  setExtendOpen(appId: string, open: boolean): void {
    const win = this.windows.get(appId);
    if (!win) return;
    win.extendOpen = open;
    this.emit();
  }

  setExtending(appId: string, extending: boolean): void {
    const win = this.windows.get(appId);
    if (!win) return;
    win.extending = extending;
    this.emit();
  }

  setSpotlightOpen(open: boolean): void {
    if (this.spotlightOpen === open) return;
    this.spotlightOpen = open;
    if (open) this.settingsOpen = false;
    this.emit();
  }

  setSettingsOpen(open: boolean): void {
    if (this.settingsOpen === open) return;
    this.settingsOpen = open;
    if (open) this.spotlightOpen = false;
    this.emit();
  }

  updateLLMConfig(config: LLMConfig): void {
    this.llmConfig = { ...config };
    saveLLMConfig(this.llmConfig);
    this.emit();
  }

  private findTopWindowId(): string | null {
    let bestId: string | null = null;
    let bestZ = -1;
    for (const [id, win] of this.windows) {
      if (!win.minimized && win.zIndex > bestZ) {
        bestZ = win.zIndex;
        bestId = id;
      }
    }
    return bestId;
  }
}

export const osState = new OSStateStore();
