import './styles/tokens.css';
import './styles/os.css';
import { osState } from './core/os-state';
import { appRuntime } from './core/runtime';
import { isLLMConfigured } from './core/storage';
import type { AppRecord, CandidateApp } from './types';
import { DesktopView } from './ui/desktop';
import { SettingsModal } from './ui/settings-modal';
import { SpotlightModal } from './ui/spotlight';
import { TaskbarView } from './ui/taskbar';
import { WindowManager } from './ui/window-manager';

function createAppId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function boot(): Promise<void> {
  const root = document.getElementById('os-root');
  if (!root) return;

  const openApp = (appId: string) => {
    if (!osState.apps.has(appId)) return;
    osState.openWindow(appId);
  };

  const abortAndRemoveApp = async (appId: string) => {
    appRuntime.abortGeneration(appId);
    await osState.removeApp(appId);
  };

  const clearAllAppsAndAbort = async () => {
    for (const appId of osState.apps.keys()) {
      appRuntime.abortGeneration(appId);
    }
    await osState.clearApps();
  };

  const launchNewApp = async (candidate: CandidateApp) => {
    if (!isLLMConfigured(osState.llmConfig)) {
      osState.setSettingsOpen(true);
      return;
    }

    const now = Date.now();
    const app: AppRecord = {
      id: createAppId(),
      name: candidate.name,
      icon: candidate.icon || '✦',
      description: candidate.description || candidate.prompt,
      prompt: candidate.prompt,
      html: '',
      status: 'generating',
      createdAt: now,
      updatedAt: now,
    };

    await osState.upsertApp(app);
    osState.openWindow(app.id);

    const iframe = windowManager.prepareStreamingIframe(app.id);
    if (iframe) {
      void appRuntime.generateAppStream(iframe, app);
      if (candidate.needsMetadata) {
        void appRuntime.enrichAppMetadata(app.id, candidate.prompt);
      }
    }
  };

  const desktop = new DesktopView({
    onOpenApp: openApp,
    onUninstallApp: (appId) => {
      void abortAndRemoveApp(appId);
    },
    onOpenSpotlight: () => osState.setSpotlightOpen(true),
    onOpenSettings: () => osState.setSettingsOpen(true),
  });

  const windowManager = new WindowManager({
    onAbortAndDelete: (appId) => {
      void abortAndRemoveApp(appId);
    },
    onUninstallApp: (appId) => {
      void abortAndRemoveApp(appId);
    },
    onExtendApp: (appId, iframe, featureRequest) => {
      const app = osState.apps.get(appId);
      if (!app) return;
      void appRuntime.extendAppFeature(iframe, app, featureRequest);
    },
  });

  const taskbar = new TaskbarView({
    onToggleSpotlight: () => osState.setSpotlightOpen(!osState.spotlightOpen),
    onToggleSettings: () => osState.setSettingsOpen(!osState.settingsOpen),
    onClickWindow: (appId) => osState.toggleMinimize(appId),
  });

  const spotlight = new SpotlightModal({
    onOpenInstalled: openApp,
    onLaunchCandidate: (cand) => {
      void launchNewApp(cand);
    },
    onOpenSettings: () => osState.setSettingsOpen(true),
  });

  const settingsModal = new SettingsModal({
    onClearAllApps: clearAllAppsAndAbort,
  });

  desktop.element.appendChild(windowManager.element);
  root.append(desktop.element, taskbar.element, spotlight.element, settingsModal.element);

  const renderAll = () => {
    desktop.render();
    windowManager.render();
    taskbar.render();
    spotlight.render();
    settingsModal.render();
  };

  osState.subscribe(renderAll);

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      osState.setSpotlightOpen(!osState.spotlightOpen);
      return;
    }
    if (e.key === 'Escape') {
      if (osState.spotlightOpen) {
        osState.setSpotlightOpen(false);
      } else if (osState.settingsOpen) {
        osState.setSettingsOpen(false);
      }
    }
  });

  await osState.init();
  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot());
} else {
  void boot();
}
