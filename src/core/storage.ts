import type { AppRecord, LLMConfig } from '../types';

const LLM_CONFIG_KEY = 'exnihilo_os_llm_config';
const APPS_FALLBACK_KEY = 'exnihilo_os_apps_fallback';
const DB_NAME = 'ExNihiloOSDB';
const DB_VERSION = 1;
const STORE_NAME = 'apps';

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  fastModel: '',
  temperature: 0.7,
};

export function isLLMConfigured(cfg: LLMConfig): boolean {
  const base = cfg.baseUrl.trim();
  const model = cfg.model.trim();
  if (!base || !model) return false;
  if (cfg.apiKey.trim().length > 0) return true;
  if (base.startsWith('/')) return true;
  return /:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(base);
}

export function loadLLMConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(LLM_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_LLM_CONFIG };
    const parsed = JSON.parse(raw) as Partial<LLMConfig>;
    return {
      ...DEFAULT_LLM_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_LLM_CONFIG };
  }
}

export function saveLLMConfig(config: LLMConfig): void {
  localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(config));
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function loadFallbackApps(): AppRecord[] {
  try {
    const raw = localStorage.getItem(APPS_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFallbackApps(apps: AppRecord[]): void {
  try {
    localStorage.setItem(APPS_FALLBACK_KEY, JSON.stringify(apps));
  } catch {
    // Ignore quota errors in fallback mode
  }
}

export async function getAllApps(): Promise<AppRecord[]> {
  const db = await openDatabase();
  if (!db) {
    return loadFallbackApps().sort((a, b) => a.createdAt - b.createdAt);
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as AppRecord[]) || [];
        resolve(list.sort((a, b) => a.createdAt - b.createdAt));
      };
      req.onerror = () => resolve(loadFallbackApps());
    } catch {
      resolve(loadFallbackApps());
    }
  });
}

export async function saveApp(app: AppRecord): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    const all = loadFallbackApps().filter((item) => item.id !== app.id);
    all.push(app);
    saveFallbackApps(all);
    return;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(app);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        const all = loadFallbackApps().filter((item) => item.id !== app.id);
        all.push(app);
        saveFallbackApps(all);
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

export async function deleteApp(appId: string): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    saveFallbackApps(loadFallbackApps().filter((item) => item.id !== appId));
    return;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(appId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearAllApps(): Promise<void> {
  const db = await openDatabase();
  saveFallbackApps([]);
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
