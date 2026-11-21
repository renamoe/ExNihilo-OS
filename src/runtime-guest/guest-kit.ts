export interface GuestMountRequest {
  prompt: string;
  userInput?: string;
  contextSnippet: string;
  onChunk: (htmlSoFar: string) => void;
  onDone: (finalHtml: string) => void;
  onError: (err: string) => void;
}

export interface GuestBridge {
  appId: string;
  requestMount: (req: GuestMountRequest) => () => void;
  persistDom: () => void;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seedInput: string): () => number {
  let state = hashSeed(seedInput) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

export function buildFakeMediaSvg(kind: string, prompt: string, seed = ''): string {
  const rng = makeRng(`${kind}:${prompt}:${seed}`);
  const palettes = [
    ['#1a73e8', '#669df6', '#eef3fd'],
    ['#1e8e3e', '#5bb974', '#edf7ef'],
    ['#1967d2', '#4ecde6', '#edf6fc'],
    ['#e37400', '#fbbc04', '#fef7e0'],
  ];
  const [c1, c2, bg] = palettes[Math.floor(rng() * palettes.length)];
  const gradId = `g_${hashSeed(kind + prompt + seed).toString(36)}`;

  let shapes = '';
  const k = kind.toLowerCase();

  if (k === 'chart') {
    const pts: string[] = [];
    let bars = '';
    for (let i = 0; i < 8; i++) {
      const x = 40 + i * 48;
      const y = 45 + Math.round(rng() * 115);
      pts.push(`${x},${y}`);
      const barH = 195 - y;
      bars += `<rect x="${x - 10}" y="${y + 12}" width="20" height="${Math.max(8, barH - 12)}" rx="4" fill="${c1}" opacity="0.2"/>`;
    }
    shapes = `
      <g stroke="rgba(32,33,36,0.1)" stroke-width="1">
        <line x1="24" y1="50" x2="396" y2="50"/><line x1="24" y1="100" x2="396" y2="100"/>
        <line x1="24" y1="150" x2="396" y2="150"/><line x1="24" y1="195" x2="396" y2="195"/>
      </g>
      ${bars}
      <polyline fill="none" stroke="url(#${gradId})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}"/>
      ${pts
        .map((p) => {
          const [cx, cy] = p.split(',');
          return `<circle cx="${cx}" cy="${cy}" r="4" fill="${c1}" stroke="#ffffff" stroke-width="1.5"/>`;
        })
        .join('')}
    `;
  } else if (k === 'map') {
    let streets = '';
    for (let i = 1; i < 7; i++) {
      streets += `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="220" stroke="rgba(32,33,36,0.08)"/>`;
      streets += `<line x1="0" y1="${i * 36}" x2="420" y2="${i * 36}" stroke="rgba(32,33,36,0.08)"/>`;
    }
    const p1x = 70 + Math.round(rng() * 60);
    const p1y = 60 + Math.round(rng() * 90);
    const p2x = 180 + Math.round(rng() * 70);
    const p2y = 50 + Math.round(rng() * 110);
    const p3x = 300 + Math.round(rng() * 70);
    const p3y = 45 + Math.round(rng() * 110);
    shapes = `
      ${streets}
      <path d="M ${p1x} ${p1y} Q ${(p1x + p2x) / 2} ${p1y - 40} ${p2x} ${p2y} T ${p3x} ${p3y}" fill="none" stroke="url(#${gradId})" stroke-width="3" stroke-dasharray="6 4"/>
      <circle cx="${p1x}" cy="${p1y}" r="16" fill="${c1}" opacity="0.16"/>
      <circle cx="${p1x}" cy="${p1y}" r="5" fill="${c1}" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="${p2x}" cy="${p2y}" r="5" fill="${c2}" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="${p3x}" cy="${p3y}" r="20" fill="${c1}" opacity="0.14"/>
      <circle cx="${p3x}" cy="${p3y}" r="6" fill="${c1}" stroke="#ffffff" stroke-width="1.5"/>
    `;
  } else if (k === 'code') {
    let lines = '';
    for (let i = 0; i < 9; i++) {
      const w = 70 + Math.round(rng() * 230);
      const indent = (i % 3) * 18;
      const col = i % 2 === 0 ? c1 : c2;
      lines += `<rect x="${32 + indent}" y="${34 + i * 19}" width="${w}" height="8" rx="4" fill="${col}" opacity="${(0.35 + rng() * 0.4).toFixed(2)}"/>`;
    }
    shapes = `
      <rect x="18" y="16" width="384" height="188" rx="12" fill="#ffffff" stroke="#dadce0"/>
      ${lines}
    `;
  } else {
    const cx = 110 + Math.round(rng() * 200);
    const cy = 68 + Math.round(rng() * 55);
    const r = 34 + Math.round(rng() * 32);
    const hy = 135 + Math.round(rng() * 35);
    shapes = `
      <circle cx="${cx}" cy="${cy}" r="${r * 1.6}" fill="${c2}" opacity="0.18"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gradId})" opacity="0.82"/>
      <path d="M 0 ${hy} Q 120 ${hy - 32} 220 ${hy - 6} T 420 ${hy - 18} L 420 220 L 0 220 Z" fill="${c2}" opacity="0.32"/>
      <path d="M 0 ${hy + 22} Q 150 ${hy - 8} 280 ${hy + 16} T 420 ${hy + 4} L 420 220 L 0 220 Z" fill="${c1}" opacity="0.28"/>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 220" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="420" height="220" fill="${bg}"/>
    ${shapes}
  </svg>`;
}

function buildFakeImgDataUri(alt: string): string {
  const svg = buildFakeMediaSvg('illustration', alt || 'ExNihilo Media', alt);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isElementActuallyVisible(el: Element): boolean {
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1) {
    const win = cur.ownerDocument.defaultView;
    if (win) {
      const style = win.getComputedStyle(cur);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
    }
    if (cur.tagName.toLowerCase() === 'en-tab' && !cur.hasAttribute('active')) {
      return false;
    }
    cur = cur.parentElement;
  }
  return true;
}

export function installGuestKit(winParam: Window, bridge: GuestBridge): void {
  const win = winParam as Window & typeof globalThis;
  const doc = win.document;
  const registry = win.customElements;
  const BaseHTMLElement = win.HTMLElement;

  // 1. Network isolation guard inside guest realm
  try {
    Object.defineProperty(win, 'fetch', {
      configurable: true,
      writable: true,
      value: () =>
        Promise.reject(
          new Error('ExNihilo Fake Media Sandbox: real network access is disabled.'),
        ),
    });
  } catch {
    // ignore if non-configurable
  }

  // 2. Stray <img> guard (external URLs or broken images -> deterministic Fake Media SVG)
  const sanitizeImg = (img: HTMLImageElement) => {
    const src = (img.getAttribute('src') || '').trim();
    if (!src || /^(https?:)?\/\//i.test(src)) {
      img.setAttribute('src', buildFakeImgDataUri(img.alt || src || 'ExNihilo Image'));
    }
    if (!img.dataset.enGuarded) {
      img.dataset.enGuarded = '1';
      img.addEventListener('error', () => {
        if (!img.src.startsWith('data:image/svg+xml')) {
          img.src = buildFakeImgDataUri(img.alt || 'ExNihilo Media');
        }
      });
    }
  };

  const imgObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.target instanceof win.HTMLImageElement) {
        sanitizeImg(m.target);
      }
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof win.HTMLImageElement) {
          sanitizeImg(node);
        } else if (node instanceof win.Element) {
          node.querySelectorAll('img').forEach((img) => sanitizeImg(img as HTMLImageElement));
        }
      }
    }
  });

  if (doc.body) {
    doc.body.querySelectorAll('img').forEach((img) => sanitizeImg(img as HTMLImageElement));
    imgObserver.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  }

  const defineOnce = (tag: string, ctor: CustomElementConstructor) => {
    if (!registry.get(tag)) {
      registry.define(tag, ctor);
    }
  };

  // --- <en-shell> ---
  defineOnce(
    'en-shell',
    class extends BaseHTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: flex;
              flex-direction: column;
              min-height: 100%;
              height: 100%;
              background: var(--en-bg, #f8f9fa);
              color: var(--en-text, #202124);
            }
            .header { flex-shrink: 0; }
            .workspace {
              flex: 1;
              min-height: 0;
              display: flex;
              overflow: hidden;
            }
            :host([layout="stack"]) .workspace,
            :host(:not([layout])) .workspace {
              flex-direction: column;
            }
            :host([layout="sidebar"]) .workspace {
              flex-direction: row;
            }
            :host([layout="split"]) .workspace {
              flex-direction: row;
            }
            .sidebar {
              flex-shrink: 0;
              display: none;
              border-right: 1px solid var(--en-border, #dadce0);
              background: var(--en-surface-solid, #f1f3f4);
              overflow-y: auto;
            }
            :host([layout="sidebar"]) .sidebar {
              display: block;
              width: 210px;
              padding: 12px 10px;
            }
            .main {
              flex: 1;
              min-width: 0;
              overflow-y: auto;
              padding: 16px;
              display: flex;
              flex-direction: column;
              gap: 14px;
            }
            :host([layout="grid"]) .main {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
              align-content: start;
              gap: 14px;
            }
            :host([layout="split"]) .main {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 14px;
              align-items: start;
            }
            .footer { flex-shrink: 0; }
          </style>
          <div class="header"><slot name="header"></slot></div>
          <div class="workspace">
            <aside class="sidebar"><slot name="sidebar"></slot></aside>
            <main class="main"><slot name="main"></slot><slot></slot></main>
          </div>
          <div class="footer"><slot name="footer"></slot></div>
        `;
      }
    },
  );

  // --- <en-header> ---
  defineOnce(
    'en-header',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['title', 'subtitle'];
      }
      private titleEl!: HTMLElement;
      private subEl!: HTMLElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              padding: 13px 18px;
              border-bottom: 1px solid var(--en-border, #dadce0);
              background: var(--en-surface, #ffffff);
            }
            .titles { min-width: 0; }
            .title {
              font-size: 16px;
              font-weight: 600;
              color: var(--en-text, #202124);
              margin: 0;
            }
            .sub {
              font-size: 12.5px;
              color: var(--en-muted, #5f6368);
              margin-top: 2px;
            }
            .actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
          </style>
          <div class="titles">
            <div class="title"></div>
            <div class="sub"></div>
          </div>
          <div class="actions"><slot></slot></div>
        `;
        this.titleEl = root.querySelector('.title')!;
        this.subEl = root.querySelector('.sub')!;
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        this.titleEl.textContent = this.getAttribute('title') || '';
        const sub = this.getAttribute('subtitle') || '';
        this.subEl.textContent = sub;
        this.subEl.style.display = sub ? 'block' : 'none';
      }
    },
  );

  // --- <en-tabs> & <en-tab> ---
  defineOnce(
    'en-tab',
    class extends BaseHTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host { display: none; }
            :host([active]) {
              display: block;
              animation: en-fade 0.2s ease both;
            }
            @keyframes en-fade {
              from { opacity: 0; transform: translateY(3px); }
              to { opacity: 1; transform: translateY(0); }
            }
          </style>
          <slot></slot>
        `;
      }
    },
  );

  defineOnce(
    'en-tabs',
    class extends BaseHTMLElement {
      private barEl!: HTMLElement;
      private slotEl!: HTMLSlotElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host { display: flex; flex-direction: column; gap: 12px; }
            .bar {
              display: inline-flex;
              align-self: flex-start;
              max-width: 100%;
              align-items: center;
              gap: 4px;
              padding: 4px;
              border-radius: 999px;
              background: var(--en-surface-solid, #f1f3f4);
              border: 1px solid var(--en-border, #dadce0);
              overflow-x: auto;
            }
            button {
              padding: 6px 14px;
              border: none;
              border-radius: 999px;
              background: transparent;
              color: var(--en-muted, #5f6368);
              font-family: inherit;
              font-size: 12.5px;
              font-weight: 500;
              cursor: pointer;
              white-space: nowrap;
              display: inline-flex;
              align-items: center;
              gap: 6px;
              transition: background 0.14s, color 0.14s, box-shadow 0.14s;
            }
            button:hover { color: var(--en-text, #202124); background: rgba(32, 33, 36, 0.05); }
            button.active {
              color: var(--en-accent-text, #174ea6);
              background: #ffffff;
              box-shadow: 0 1px 2px rgba(60, 64, 67, 0.18);
            }
          </style>
          <div class="bar" role="tablist"></div>
          <div class="panels"><slot></slot></div>
        `;
        this.barEl = root.querySelector('.bar')!;
        this.slotEl = root.querySelector('slot')!;
        this.slotEl.addEventListener('slotchange', () => this.rebuild());
      }

      connectedCallback() {
        this.rebuild();
      }

      private rebuild() {
        const tabs = Array.from(this.children).filter(
          (el) => el.tagName.toLowerCase() === 'en-tab',
        );
        if (tabs.length === 0) return;

        let activeTab = tabs.find((t) => t.hasAttribute('active'));
        if (!activeTab) {
          activeTab = tabs[0];
          activeTab.setAttribute('active', '');
        }

        this.barEl.innerHTML = '';
        for (const tab of tabs) {
          const btn = doc.createElement('button');
          btn.type = 'button';
          const icon = tab.getAttribute('icon') || '';
          const label = tab.getAttribute('label') || tab.getAttribute('id') || 'Tab';
          btn.textContent = icon ? `${icon} ${label}` : label;
          if (tab === activeTab) btn.classList.add('active');
          btn.addEventListener('click', () => this.activateTab(tab));
          this.barEl.appendChild(btn);
        }
      }

      private activateTab(targetTab: Element) {
        const tabs = Array.from(this.children).filter(
          (el) => el.tagName.toLowerCase() === 'en-tab',
        );
        for (const tab of tabs) {
          if (tab === targetTab) {
            tab.setAttribute('active', '');
          } else {
            tab.removeAttribute('active');
          }
        }
        this.rebuild();
        targetTab.dispatchEvent(new win.CustomEvent('en-tab-activate', { bubbles: true }));
        doc.dispatchEvent(new win.CustomEvent('en-visibility-refresh'));
      }
    },
  );

  // --- <en-sidebar> & <en-nav-item> ---
  defineOnce(
    'en-sidebar',
    class extends BaseHTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host { display: flex; flex-direction: column; gap: 4px; }
          </style>
          <slot></slot>
        `;
      }
    },
  );

  defineOnce(
    'en-nav-item',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['icon', 'label', 'active'];
      }
      private btn!: HTMLButtonElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            button {
              width: 100%;
              padding: 8px 12px;
              border-radius: 999px;
              border: none;
              background: transparent;
              color: var(--en-muted, #5f6368);
              font-family: inherit;
              font-size: 13px;
              font-weight: 500;
              text-align: left;
              display: flex;
              align-items: center;
              gap: 9px;
              cursor: pointer;
              transition: background 0.14s, color 0.14s;
            }
            button:hover {
              color: var(--en-text, #202124);
              background: rgba(32, 33, 36, 0.06);
            }
            :host([active]) button {
              color: var(--en-accent-text, #174ea6);
              background: var(--en-accent-soft, #e8f0fe);
            }
          </style>
          <button type="button"><span class="ico"></span><span class="lbl"></span><slot></slot></button>
        `;
        this.btn = root.querySelector('button')!;
        this.btn.addEventListener('click', () => this.activate());
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }

      private sync() {
        const ico = this.shadowRoot!.querySelector('.ico')!;
        const lbl = this.shadowRoot!.querySelector('.lbl')!;
        const iconAttr = this.getAttribute('icon') || '';
        const labelAttr = this.getAttribute('label') || '';
        ico.textContent = iconAttr;
        (ico as HTMLElement).style.display = iconAttr ? 'inline' : 'none';
        lbl.textContent = labelAttr;
      }

      private activate() {
        const parent = this.parentElement;
        if (parent) {
          parent.querySelectorAll('en-nav-item').forEach((item) => item.removeAttribute('active'));
        }
        this.setAttribute('active', '');

        const targetSel = this.getAttribute('target');
        if (targetSel) {
          const targetEl = doc.querySelector(targetSel);
          if (targetEl) {
            const container = targetEl.parentElement || doc;
            container.querySelectorAll('[data-panel]').forEach((panel) => {
              (panel as HTMLElement).style.display = panel === targetEl ? '' : 'none';
            });
            (targetEl as HTMLElement).style.display = '';
            targetEl.dispatchEvent(new win.CustomEvent('en-panel-activate', { bubbles: true }));
            doc.dispatchEvent(new win.CustomEvent('en-visibility-refresh'));
          }
        }
      }
    },
  );

  // --- <en-card> ---
  defineOnce(
    'en-card',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['title', 'subtitle', 'interactive'];
      }
      private headEl!: HTMLElement;
      private titleEl!: HTMLElement;
      private subEl!: HTMLElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: block;
              padding: 15px 16px;
              border-radius: 14px;
              background: var(--en-surface, #ffffff);
              border: 1px solid var(--en-border, #dadce0);
              box-shadow: 0 1px 2px rgba(60, 64, 67, 0.06);
              transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
              animation: en-fade 0.18s cubic-bezier(0.2, 0, 0, 1) both;
            }
            :host([interactive]):hover {
              cursor: pointer;
              border-color: #c2d7fa;
              background: #fafcff;
              box-shadow: 0 2px 6px rgba(60, 64, 67, 0.12);
            }
            .head { margin-bottom: 10px; }
            .title { font-size: 14.5px; font-weight: 600; color: var(--en-text, #202124); }
            .sub { font-size: 12px; color: var(--en-muted, #5f6368); margin-top: 2px; }
            @keyframes en-fade {
              from { opacity: 0; transform: translateY(3px); }
              to { opacity: 1; transform: translateY(0); }
            }
          </style>
          <div class="head"><div class="title"></div><div class="sub"></div></div>
          <div class="body"><slot></slot></div>
        `;
        this.headEl = root.querySelector('.head')!;
        this.titleEl = root.querySelector('.title')!;
        this.subEl = root.querySelector('.sub')!;
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        const t = this.getAttribute('title') || '';
        const s = this.getAttribute('subtitle') || '';
        this.titleEl.textContent = t;
        this.subEl.textContent = s;
        this.subEl.style.display = s ? 'block' : 'none';
        this.headEl.style.display = t || s ? 'block' : 'none';
      }
    },
  );

  // --- <en-list> & <en-item> ---
  defineOnce(
    'en-list',
    class extends BaseHTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
          </style>
          <slot></slot>
        `;
      }
    },
  );

  defineOnce(
    'en-item',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['title', 'meta', 'badge', 'avatar'];
      }
      private titleEl!: HTMLElement;
      private metaEl!: HTMLElement;
      private badgeEl!: HTMLElement;
      private avatarWrap!: HTMLElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 10px 14px;
              border-radius: 12px;
              background: var(--en-surface, #ffffff);
              border: 1px solid var(--en-border, #dadce0);
              transition: border-color 0.14s, background 0.14s;
            }
            :host(:hover) {
              border-color: #c2d7fa;
              background: var(--en-bg, #f8f9fa);
            }
            .av { flex-shrink: 0; display: none; }
            .content { flex: 1; min-width: 0; }
            .title { font-size: 13.5px; font-weight: 500; color: var(--en-text, #202124); }
            .meta { font-size: 12px; color: var(--en-muted, #5f6368); margin-top: 2px; }
            .badge {
              font-size: 11px;
              font-weight: 500;
              padding: 2px 9px;
              border-radius: 999px;
              background: var(--en-accent-soft, #e8f0fe);
              color: var(--en-accent-text, #174ea6);
              flex-shrink: 0;
            }
          </style>
          <div class="av"></div>
          <div class="content">
            <div class="title"></div>
            <div class="meta"></div>
            <slot></slot>
          </div>
          <div class="badge"></div>
        `;
        this.avatarWrap = root.querySelector('.av')!;
        this.titleEl = root.querySelector('.title')!;
        this.metaEl = root.querySelector('.meta')!;
        this.badgeEl = root.querySelector('.badge')!;
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        const title = this.getAttribute('title') || '';
        const meta = this.getAttribute('meta') || '';
        const badge = this.getAttribute('badge') || '';
        const avatar = this.getAttribute('avatar') || '';

        this.titleEl.textContent = title;
        this.titleEl.style.display = title ? 'block' : 'none';
        this.metaEl.textContent = meta;
        this.metaEl.style.display = meta ? 'block' : 'none';
        this.badgeEl.textContent = badge;
        this.badgeEl.style.display = badge ? 'inline-block' : 'none';

        if (avatar) {
          this.avatarWrap.style.display = 'block';
          this.avatarWrap.innerHTML = `<en-avatar name="${escapeXml(avatar)}" size="32"></en-avatar>`;
        } else {
          this.avatarWrap.style.display = 'none';
          this.avatarWrap.innerHTML = '';
        }
      }
    },
  );

  // --- <en-button> ---
  defineOnce(
    'en-button',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['variant', 'size', 'icon'];
      }
      private iconEl!: HTMLElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host { display: inline-block; }
            button {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              height: 36px;
              padding: 0 16px;
              border-radius: 999px;
              border: 1px solid var(--en-border, #dadce0);
              background: var(--en-surface, #ffffff);
              color: var(--en-text, #202124);
              font-family: inherit;
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.14s, border-color 0.14s, box-shadow 0.14s;
            }
            button:hover {
              border-color: #c2d7fa;
              background: var(--en-accent-soft, #e8f0fe);
              color: var(--en-accent-text, #174ea6);
            }
            :host([variant="primary"]) button {
              border-color: transparent;
              background: var(--en-accent, #1a73e8);
              color: #ffffff;
              box-shadow: 0 1px 2px rgba(26, 115, 232, 0.28);
            }
            :host([variant="primary"]) button:hover {
              background: #1765cc;
              color: #ffffff;
              box-shadow: 0 2px 6px rgba(26, 115, 232, 0.34);
            }
            :host([variant="ghost"]) button {
              background: transparent;
              border-color: transparent;
              color: var(--en-accent, #1a73e8);
            }
            :host([variant="ghost"]) button:hover {
              background: rgba(26, 115, 232, 0.08);
              border-color: transparent;
            }
            :host([variant="danger"]) button {
              border-color: transparent;
              background: #fce8e6;
              color: #c5221f;
            }
            :host([variant="danger"]) button:hover {
              background: #fad2cf;
              color: #a50e0e;
            }
            :host([size="sm"]) button {
              height: 30px;
              padding: 0 12px;
              font-size: 12px;
            }
          </style>
          <button type="button"><span class="ico"></span><slot></slot></button>
        `;
        this.iconEl = root.querySelector('.ico')!;
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        const ico = this.getAttribute('icon') || '';
        this.iconEl.textContent = ico;
        this.iconEl.style.display = ico ? 'inline' : 'none';
      }
    },
  );

  // --- <en-input> ---
  defineOnce(
    'en-input',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['placeholder', 'type', 'value', 'label'];
      }
      private inputEl!: HTMLInputElement;
      private labelEl!: HTMLLabelElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host { display: flex; flex-direction: column; gap: 5px; }
            label { font-size: 12px; font-weight: 500; color: var(--en-muted, #5f6368); display: none; }
            input {
              width: 100%;
              height: 38px;
              padding: 0 12px;
              border-radius: 10px;
              border: 1px solid var(--en-border, #dadce0);
              background: var(--en-surface, #ffffff);
              color: var(--en-text, #202124);
              font-family: inherit;
              font-size: 13.5px;
              outline: none;
              box-sizing: border-box;
              transition: border-color 0.14s, box-shadow 0.14s;
            }
            input:focus {
              border-color: var(--en-accent, #1a73e8);
              box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.16);
            }
          </style>
          <label></label>
          <input />
        `;
        this.labelEl = root.querySelector('label')!;
        this.inputEl = root.querySelector('input')!;
        this.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            this.dispatchEvent(
              new win.CustomEvent('en-submit', {
                bubbles: true,
                detail: { value: this.inputEl.value },
              }),
            );
          }
        });
      }

      get value(): string {
        return this.inputEl.value;
      }
      set value(v: string) {
        this.inputEl.value = v;
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        const lbl = this.getAttribute('label') || '';
        this.labelEl.textContent = lbl;
        this.labelEl.style.display = lbl ? 'block' : 'none';
        this.inputEl.placeholder = this.getAttribute('placeholder') || '';
        this.inputEl.type = this.getAttribute('type') || 'text';
        const attrVal = this.getAttribute('value');
        if (attrVal !== null && this.inputEl.value !== attrVal) {
          this.inputEl.value = attrVal;
        }
      }
    },
  );

  // --- <en-badge> ---
  defineOnce(
    'en-badge',
    class extends BaseHTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: inline-flex;
              align-items: center;
              padding: 3px 10px;
              border-radius: 999px;
              font-size: 11.5px;
              font-weight: 500;
              background: var(--en-accent-soft, #e8f0fe);
              color: var(--en-accent-text, #174ea6);
            }
            :host([variant="violet"]) {
              background: #e8eaf6;
              color: #3949ab;
            }
            :host([variant="emerald"]) {
              background: #e6f4ea;
              color: #137333;
            }
            :host([variant="amber"]) {
              background: #fef7e0;
              color: #b06000;
            }
            :host([variant="danger"]) {
              background: #fce8e6;
              color: #c5221f;
            }
          </style>
          <slot></slot>
        `;
      }
    },
  );

  // --- <en-stat> ---
  defineOnce(
    'en-stat',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['label', 'value', 'delta'];
      }
      private labelEl!: HTMLElement;
      private valEl!: HTMLElement;
      private deltaEl!: HTMLElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: flex;
              flex-direction: column;
              gap: 6px;
              padding: 14px 16px;
              border-radius: 14px;
              background: var(--en-surface, #ffffff);
              border: 1px solid var(--en-border, #dadce0);
              box-shadow: 0 1px 2px rgba(60, 64, 67, 0.06);
            }
            .lbl { font-size: 12px; font-weight: 500; color: var(--en-muted, #5f6368); }
            .row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
            .val {
              font-size: 22px;
              font-weight: 600;
              color: var(--en-accent, #1a73e8);
            }
            .delta {
              font-size: 11.5px;
              font-weight: 500;
              padding: 2px 8px;
              border-radius: 999px;
              background: #e6f4ea;
              color: #137333;
            }
          </style>
          <div class="lbl"></div>
          <div class="row"><div class="val"></div><div class="delta"></div></div>
        `;
        this.labelEl = root.querySelector('.lbl')!;
        this.valEl = root.querySelector('.val')!;
        this.deltaEl = root.querySelector('.delta')!;
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        this.labelEl.textContent = this.getAttribute('label') || '';
        this.valEl.textContent = this.getAttribute('value') || '0';
        const d = this.getAttribute('delta') || '';
        this.deltaEl.textContent = d;
        this.deltaEl.style.display = d ? 'inline-block' : 'none';
      }
    },
  );

  // --- <en-progress> ---
  defineOnce(
    'en-progress',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['value', 'max', 'label'];
      }
      private labelEl!: HTMLElement;
      private pctEl!: HTMLElement;
      private fillEl!: HTMLElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host { display: flex; flex-direction: column; gap: 6px; }
            .top { display: flex; justify-content: space-between; font-size: 12px; color: var(--en-muted, #5f6368); }
            .track {
              height: 6px;
              border-radius: 999px;
              background: #e8eaed;
              overflow: hidden;
            }
            .fill {
              height: 100%;
              border-radius: 999px;
              background: var(--en-accent, #1a73e8);
              transition: width 0.25s ease;
            }
          </style>
          <div class="top"><span class="lbl"></span><span class="pct"></span></div>
          <div class="track"><div class="fill"></div></div>
        `;
        this.labelEl = root.querySelector('.lbl')!;
        this.pctEl = root.querySelector('.pct')!;
        this.fillEl = root.querySelector('.fill')!;
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        const val = Number(this.getAttribute('value') || '0');
        const max = Math.max(1, Number(this.getAttribute('max') || '100'));
        const pct = Math.max(0, Math.min(100, Math.round((val / max) * 100)));
        this.labelEl.textContent = this.getAttribute('label') || '';
        this.pctEl.textContent = `${pct}%`;
        this.fillEl.style.width = `${pct}%`;
      }
    },
  );

  // --- <en-chat-bubble> ---
  defineOnce(
    'en-chat-bubble',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['sender', 'time', 'self'];
      }
      private metaEl!: HTMLElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
              margin: 4px 0;
            }
            :host([self]) {
              align-items: flex-end;
            }
            .meta {
              font-size: 11px;
              color: var(--en-muted, #5f6368);
              margin-bottom: 4px;
              padding: 0 6px;
            }
            .bubble {
              max-width: 82%;
              padding: 10px 14px;
              border-radius: 18px;
              background: var(--en-surface, #ffffff);
              border: 1px solid var(--en-border, #dadce0);
              color: var(--en-text, #202124);
              font-size: 13.5px;
              line-height: 1.5;
            }
            :host([self]) .bubble {
              background: var(--en-accent-soft, #e8f0fe);
              border-color: #c2d7fa;
              color: var(--en-text, #202124);
            }
          </style>
          <div class="meta"></div>
          <div class="bubble"><slot></slot></div>
        `;
        this.metaEl = root.querySelector('.meta')!;
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        const sender = this.getAttribute('sender') || '';
        const time = this.getAttribute('time') || '';
        const parts = [sender, time].filter(Boolean);
        this.metaEl.textContent = parts.join(' · ');
        this.metaEl.style.display = parts.length ? 'block' : 'none';
      }
    },
  );

  // --- <en-avatar> ---
  defineOnce(
    'en-avatar',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['name', 'seed', 'size'];
      }
      private box!: HTMLElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host { display: inline-flex; flex-shrink: 0; }
            .av {
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 600;
              color: #ffffff;
              user-select: none;
            }
          </style>
          <div class="av"></div>
        `;
        this.box = root.querySelector('.av')!;
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        const name = (this.getAttribute('name') || '?').trim();
        const seed = this.getAttribute('seed') || name;
        const size = Math.max(20, Number(this.getAttribute('size') || '36'));
        const h = hashSeed(seed);
        const hue1 = h % 360;
        const hue2 = (hue1 + 36) % 360;
        const initials = name.slice(0, 2).toUpperCase();
        this.box.style.width = `${size}px`;
        this.box.style.height = `${size}px`;
        this.box.style.fontSize = `${Math.max(10, Math.round(size * 0.38))}px`;
        this.box.style.background = `linear-gradient(135deg, hsl(${hue1}, 62%, 48%), hsl(${hue2}, 62%, 44%))`;
        this.box.textContent = initials;
      }
    },
  );

  // --- <en-media> ---
  defineOnce(
    'en-media',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['kind', 'prompt', 'caption', 'aspect', 'seed'];
      }
      private stageEl!: HTMLElement;
      private capEl!: HTMLElement;
      private svgSlot!: HTMLSlotElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: block;
              border-radius: 14px;
              overflow: hidden;
              border: 1px solid var(--en-border, #dadce0);
              background: var(--en-surface-solid, #f1f3f4);
              position: relative;
            }
            .stage {
              position: relative;
              width: 100%;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .stage svg {
              width: 100%;
              height: 100%;
              display: block;
            }
            .tag {
              position: absolute;
              top: 8px;
              right: 8px;
              font-size: 10px;
              font-weight: 500;
              letter-spacing: 0.04em;
              padding: 2px 8px;
              border-radius: 999px;
              background: rgba(255, 255, 255, 0.88);
              color: #5f6368;
              box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
              opacity: 0;
              transition: opacity 0.16s;
              pointer-events: none;
            }
            :host(:hover) .tag { opacity: 1; }
            .caption {
              padding: 8px 12px;
              font-size: 12px;
              color: var(--en-muted, #5f6368);
              border-top: 1px solid var(--en-border, #dadce0);
              background: var(--en-surface, #ffffff);
            }
          </style>
          <div class="stage">
            <div class="generated" style="width:100%;height:100%"></div>
            <slot></slot>
            <span class="tag">FAKE MEDIA</span>
          </div>
          <div class="caption"></div>
        `;
        this.stageEl = root.querySelector('.generated')!;
        this.capEl = root.querySelector('.caption')!;
        this.svgSlot = root.querySelector('slot')!;
        this.svgSlot.addEventListener('slotchange', () => this.sync());
      }

      connectedCallback() {
        this.sync();
      }
      attributeChangedCallback() {
        this.sync();
      }
      private sync() {
        const hasSlottedSvg = this.svgSlot
          .assignedElements()
          .some((el) => el.tagName.toLowerCase() === 'svg');

        const stageWrap = this.shadowRoot!.querySelector('.stage') as HTMLElement;
        stageWrap.style.aspectRatio = this.getAttribute('aspect') || '16 / 9';

        if (hasSlottedSvg) {
          this.stageEl.style.display = 'none';
        } else {
          this.stageEl.style.display = 'block';
          const kind = this.getAttribute('kind') || 'illustration';
          const prompt = this.getAttribute('prompt') || 'ExNihilo Void Scene';
          const seed = this.getAttribute('seed') || '';
          this.stageEl.innerHTML = buildFakeMediaSvg(kind, prompt, seed);
        }

        const cap = this.getAttribute('caption') || this.getAttribute('prompt') || '';
        this.capEl.textContent = cap;
        this.capEl.style.display = cap ? 'block' : 'none';
      }
    },
  );

  // --- <en-video> ---
  defineOnce(
    'en-video',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['title', 'prompt', 'duration', 'subtitles'];
      }
      private canvas!: HTMLCanvasElement;
      private playBtn!: HTMLButtonElement;
      private subEl!: HTMLElement;
      private titleEl!: HTMLElement;
      private timeEl!: HTMLElement;
      private progFill!: HTMLElement;
      private playing = false;
      private rafId = 0;
      private tick = 0;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: block;
              border-radius: 14px;
              overflow: hidden;
              border: 1px solid var(--en-border, #dadce0);
              background: var(--en-surface, #ffffff);
            }
            .screen {
              position: relative;
              aspect-ratio: 16 / 9;
              background: #1e293b;
            }
            canvas { width: 100%; height: 100%; display: block; }
            .sub {
              position: absolute;
              left: 12px;
              right: 12px;
              bottom: 12px;
              text-align: center;
              font-size: 12.5px;
              color: #ffffff;
              background: rgba(32, 33, 36, 0.72);
              padding: 4px 10px;
              border-radius: 8px;
            }
            .controls {
              display: flex;
              align-items: center;
              gap: 10px;
              padding: 9px 12px;
              background: var(--en-surface, #ffffff);
              border-top: 1px solid var(--en-border, #dadce0);
            }
            button {
              width: 30px;
              height: 30px;
              border-radius: 50%;
              border: none;
              background: var(--en-accent, #1a73e8);
              color: #ffffff;
              cursor: pointer;
              flex-shrink: 0;
            }
            .meta { flex: 1; min-width: 0; }
            .title { font-size: 12.5px; font-weight: 500; color: var(--en-text, #202124); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .bar { height: 4px; border-radius: 999px; background: #e8eaed; margin-top: 5px; overflow: hidden; }
            .fill { height: 100%; width: 18%; background: var(--en-accent, #1a73e8); }
            .time { font-size: 11px; color: var(--en-muted, #5f6368); flex-shrink: 0; }
          </style>
          <div class="screen">
            <canvas width="420" height="236"></canvas>
            <div class="sub"></div>
          </div>
          <div class="controls">
            <button type="button">▶</button>
            <div class="meta">
              <div class="title"></div>
              <div class="bar"><div class="fill"></div></div>
            </div>
            <div class="time"></div>
          </div>
        `;
        this.canvas = root.querySelector('canvas')!;
        this.playBtn = root.querySelector('button')!;
        this.subEl = root.querySelector('.sub')!;
        this.titleEl = root.querySelector('.title')!;
        this.timeEl = root.querySelector('.time')!;
        this.progFill = root.querySelector('.fill')!;
        this.playBtn.addEventListener('click', () => this.togglePlay());
      }

      connectedCallback() {
        this.sync();
        this.drawFrame();
      }
      disconnectedCallback() {
        this.stop();
      }
      attributeChangedCallback() {
        this.sync();
      }

      private sync() {
        this.titleEl.textContent = this.getAttribute('title') || '虚构影像流';
        const dur = this.getAttribute('duration') || '02:40';
        this.timeEl.textContent = `00:00 / ${dur}`;
        const subs = (this.getAttribute('subtitles') || this.getAttribute('prompt') || '').split('|');
        this.subEl.textContent = subs[0] || '';
        this.subEl.style.display = subs[0] ? 'block' : 'none';
      }

      private togglePlay() {
        if (this.playing) {
          this.stop();
        } else {
          this.playing = true;
          this.playBtn.textContent = '⏸';
          const loop = () => {
            if (!this.playing) return;
            this.tick += 1;
            this.drawFrame();
            this.rafId = win.requestAnimationFrame(loop);
          };
          this.rafId = win.requestAnimationFrame(loop);
        }
      }

      private stop() {
        this.playing = false;
        this.playBtn.textContent = '▶';
        if (this.rafId) {
          win.cancelAnimationFrame(this.rafId);
          this.rafId = 0;
        }
      }

      private drawFrame() {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const seed = hashSeed(this.getAttribute('prompt') || this.getAttribute('title') || 'void');
        const hue = seed % 360;

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, w, h);

        const t = this.tick * 0.03;
        for (let i = 0; i < 4; i++) {
          const cx = w * (0.25 + 0.5 * Math.sin(t * 0.6 + i * 1.7 + (seed % 10)));
          const cy = h * (0.3 + 0.4 * Math.cos(t * 0.4 + i * 1.3));
          const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 90);
          grad.addColorStop(0, `hsla(${(hue + i * 32) % 360}, 70%, 62%, 0.28)`);
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }

        ctx.strokeStyle = 'rgba(138, 180, 248, 0.72)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y = h * 0.52 + Math.sin(x * 0.03 + t * 2) * 18 + Math.cos(x * 0.015 - t) * 10;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const pct = (this.tick % 600) / 6;
        this.progFill.style.width = `${pct.toFixed(1)}%`;
        const sec = Math.floor((this.tick % 600) / 6);
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        const dur = this.getAttribute('duration') || '02:40';
        this.timeEl.textContent = `${mm}:${ss} / ${dur}`;

        const subs = (this.getAttribute('subtitles') || '').split('|').filter(Boolean);
        if (subs.length > 0) {
          const idx = Math.floor(this.tick / 140) % subs.length;
          this.subEl.textContent = subs[idx];
        }
      }
    },
  );

  // --- <en-audio> ---
  defineOnce(
    'en-audio',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['title', 'artist', 'mood', 'duration'];
      }
      private playBtn!: HTMLButtonElement;
      private titleEl!: HTMLElement;
      private artistEl!: HTMLElement;
      private durEl!: HTMLElement;
      private bars!: HTMLElement[];
      private playing = false;
      private timerId = 0;
      private audioCtx: AudioContext | null = null;

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host {
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 12px 14px;
              border-radius: 14px;
              background: var(--en-surface, #ffffff);
              border: 1px solid var(--en-border, #dadce0);
            }
            button {
              width: 36px;
              height: 36px;
              border-radius: 50%;
              border: none;
              background: var(--en-accent, #1a73e8);
              color: #ffffff;
              cursor: pointer;
              flex-shrink: 0;
            }
            .info { flex: 1; min-width: 0; }
            .title { font-size: 13.5px; font-weight: 500; color: var(--en-text, #202124); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .artist { font-size: 12px; color: var(--en-muted, #5f6368); }
            .eq { display: flex; align-items: flex-end; gap: 3px; height: 22px; }
            .bar { width: 3px; height: 6px; border-radius: 2px; background: var(--en-accent, #1a73e8); transition: height 0.14s; }
            .dur { font-size: 11.5px; color: var(--en-muted, #5f6368); }
          </style>
          <button type="button">▶</button>
          <div class="info">
            <div class="title"></div>
            <div class="artist"></div>
          </div>
          <div class="eq">
            <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
          </div>
          <div class="dur"></div>
        `;
        this.playBtn = root.querySelector('button')!;
        this.titleEl = root.querySelector('.title')!;
        this.artistEl = root.querySelector('.artist')!;
        this.durEl = root.querySelector('.dur')!;
        this.bars = Array.from(root.querySelectorAll('.bar'));
        this.playBtn.addEventListener('click', () => this.toggle());
      }

      connectedCallback() {
        this.sync();
      }
      disconnectedCallback() {
        this.stop();
      }
      attributeChangedCallback() {
        this.sync();
      }

      private sync() {
        this.titleEl.textContent = this.getAttribute('title') || '虚构声波';
        this.artistEl.textContent = this.getAttribute('artist') || 'ExNihilo Synth';
        this.durEl.textContent = this.getAttribute('duration') || '02:38';
      }

      private toggle() {
        if (this.playing) this.stop();
        else this.start();
      }

      private start() {
        this.playing = true;
        this.playBtn.textContent = '⏸';
        try {
          const Ctx = (win as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
            (win as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctx) {
            this.audioCtx = new Ctx();
          }
        } catch {
          this.audioCtx = null;
        }

        const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
        let step = 0;
        const pulse = () => {
          if (!this.playing) return;
          for (const bar of this.bars) {
            bar.style.height = `${6 + Math.round(Math.random() * 16)}px`;
          }
          if (this.audioCtx) {
            const now = this.audioCtx.currentTime;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            const mood = (this.getAttribute('mood') || 'ambient').toLowerCase();
            osc.type = mood === 'glitch' ? 'square' : mood === 'synth' ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(scale[(step + Math.floor(Math.random() * 2)) % scale.length], now);
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.exponentialRampToValueAtTime(0.035, now + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.6);
          }
          step += 1;
        };
        pulse();
        this.timerId = win.setInterval(pulse, 480);
      }

      private stop() {
        this.playing = false;
        this.playBtn.textContent = '▶';
        if (this.timerId) {
          win.clearInterval(this.timerId);
          this.timerId = 0;
        }
        for (const bar of this.bars) {
          bar.style.height = '6px';
        }
        if (this.audioCtx) {
          this.audioCtx.close().catch(() => {});
          this.audioCtx = null;
        }
      }
    },
  );

  // --- <en-mount> Declarative AI Mount Protocol ---
  defineOnce(
    'en-mount',
    class extends BaseHTMLElement {
      static get observedAttributes() {
        return ['prompt', 'trigger', 'mode', 'target', 'label', 'placeholder', 'status'];
      }
      private uiEl!: HTMLElement;
      private streamEl!: HTMLElement;
      private cancelActive: (() => void) | null = null;
      private io: IntersectionObserver | null = null;
      private visibilityHandler = () => this.checkAutoTrigger();

      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            :host { display: block; }
            .trigger-btn {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              width: 100%;
              padding: 10px 14px;
              border-radius: 12px;
              border: 1px dashed #8ab4f8;
              background: #f8fbff;
              color: var(--en-text, #202124);
              font-family: inherit;
              font-size: 13px;
              cursor: pointer;
              text-align: left;
              transition: background 0.15s, border-color 0.15s;
            }
            .trigger-btn:hover {
              border-style: solid;
              border-color: var(--en-accent, #1a73e8);
              background: var(--en-accent-soft, #e8f0fe);
            }
            .click-slot {
              cursor: pointer;
            }
            .submit-bar {
              display: flex;
              gap: 8px;
              align-items: center;
              margin-bottom: 10px;
            }
            .submit-bar input {
              flex: 1;
              height: 36px;
              padding: 0 14px;
              border-radius: 999px;
              border: 1px solid var(--en-border, #dadce0);
              background: var(--en-surface, #ffffff);
              color: var(--en-text, #202124);
              font-family: inherit;
              font-size: 13px;
              outline: none;
            }
            .submit-bar input:focus {
              border-color: var(--en-accent, #1a73e8);
              box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.16);
            }
            .submit-bar button {
              height: 36px;
              padding: 0 16px;
              border-radius: 999px;
              border: none;
              background: var(--en-accent, #1a73e8);
              color: #ffffff;
              font-family: inherit;
              font-size: 12.5px;
              font-weight: 500;
              cursor: pointer;
              white-space: nowrap;
            }
            .loading-box {
              padding: 12px 14px;
              border-radius: 12px;
              border: 1px solid var(--en-border, #dadce0);
              background: var(--en-surface-solid, #f1f3f4);
              margin-top: 6px;
            }
            .loading-tag {
              font-size: 12px;
              font-weight: 500;
              color: var(--en-accent, #1a73e8);
              margin-bottom: 4px;
            }
            .err-box {
              padding: 10px 12px;
              border-radius: 10px;
              border: 1px solid #fad2cf;
              background: #fce8e6;
              color: #c5221f;
              font-size: 12.5px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              margin-top: 6px;
            }
            .err-box button {
              padding: 4px 12px;
              border-radius: 999px;
              border: 1px solid #f28b82;
              background: #ffffff;
              color: #c5221f;
              cursor: pointer;
            }
          </style>
          <div class="ui"></div>
          <div class="stream"></div>
          <slot></slot>
        `;
        this.uiEl = root.querySelector('.ui')!;
        this.streamEl = root.querySelector('.stream')!;
      }

      connectedCallback() {
        if (!this.getAttribute('status')) {
          this.setAttribute('status', 'idle');
        }
        this.renderUi();

        doc.addEventListener('en-visibility-refresh', this.visibilityHandler);

        const trigger = this.getTrigger();
        if (trigger === 'visible' || trigger === 'auto') {
          this.setupVisibilityObserver();
        }
      }

      disconnectedCallback() {
        doc.removeEventListener('en-visibility-refresh', this.visibilityHandler);
        if (this.io) {
          this.io.disconnect();
          this.io = null;
        }
        if (this.cancelActive) {
          this.cancelActive();
          this.cancelActive = null;
        }
      }

      attributeChangedCallback() {
        if (this.isConnected) {
          this.renderUi();
        }
      }

      private getTrigger(): string {
        return (this.getAttribute('trigger') || 'click').toLowerCase();
      }

      private getMode(): string {
        return (this.getAttribute('mode') || 'replace').toLowerCase();
      }

      private setupVisibilityObserver() {
        if ('IntersectionObserver' in win) {
          const io = new win.IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                this.checkAutoTrigger();
              }
            },
            { threshold: 0.05 },
          );
          io.observe(this);
          this.io = io;
        }
        win.setTimeout(() => this.checkAutoTrigger(), 30);
      }

      private checkAutoTrigger() {
        const trigger = this.getTrigger();
        if (trigger !== 'visible' && trigger !== 'auto') return;
        const status = this.getAttribute('status') || 'idle';
        if (status !== 'idle') return;
        if (this.getMode() === 'replace' && !this.getAttribute('target') && this.innerHTML.trim().length > 0) {
          this.setAttribute('status', 'loaded');
          return;
        }
        if (isElementActuallyVisible(this)) {
          this.invokeMount();
        }
      }

      private renderUi() {
        const trigger = this.getTrigger();
        const status = this.getAttribute('status') || 'idle';
        const mode = this.getMode();
        const hasTarget = Boolean(this.getAttribute('target'));

        if (trigger === 'submit') {
          const placeholder =
            this.getAttribute('placeholder') || this.getAttribute('label') || '输入内容并回车...';
          // Avoid blowing away focused input if already rendered
          if (!this.uiEl.querySelector('.submit-bar')) {
            this.uiEl.innerHTML = `
              <form class="submit-bar">
                <input type="text" placeholder="${escapeXml(placeholder)}" />
                <button type="submit">生成</button>
              </form>
            `;
            const form = this.uiEl.querySelector('form')!;
            const input = this.uiEl.querySelector('input')!;
            form.addEventListener('submit', (e) => {
              e.preventDefault();
              const val = input.value.trim();
              if (!val || this.getAttribute('status') === 'loading') return;
              input.value = '';
              this.invokeMount(val);
            });
          }
          const btn = this.uiEl.querySelector('.submit-bar button') as HTMLButtonElement | null;
          if (btn) {
            btn.disabled = status === 'loading';
            btn.textContent = status === 'loading' ? '生成中...' : '生成';
          }
          return;
        }

        if (status === 'loading') {
          this.uiEl.innerHTML = `<div class="loading-box"><div class="loading-tag">正在生成内容...</div></div>`;
          return;
        }

        if (status === 'error') {
          this.uiEl.innerHTML = `
            <div class="err-box">
              <span>生成失败</span>
              <button type="button">重试</button>
            </div>
          `;
          this.uiEl.querySelector('button')!.addEventListener('click', () => {
            this.setAttribute('status', 'idle');
            this.invokeMount();
          });
          return;
        }

        if (status === 'loaded' && mode === 'replace' && !hasTarget) {
          this.uiEl.innerHTML = '';
          this.streamEl.innerHTML = '';
          return;
        }

        if (trigger === 'click') {
          const hasSlottedChildren = this.children.length > 0;
          if (hasSlottedChildren) {
            this.uiEl.innerHTML = '';
            this.classList.add('click-slot');
            if (!this.dataset.clickBound) {
              this.dataset.clickBound = '1';
              this.addEventListener('click', (e) => {
                // Allow clicking nested buttons/inputs cleanly unless clicked on this mount
                if (this.getAttribute('status') === 'loading') return;
                if (this.getAttribute('status') === 'loaded' && this.getMode() === 'replace' && !this.getAttribute('target')) {
                  return;
                }
                e.stopPropagation();
                this.invokeMount();
              });
            }
          } else {
            const label =
              this.getAttribute('label') || this.getAttribute('prompt') || '点击生成此区域内容';
            this.uiEl.innerHTML = `
              <button type="button" class="trigger-btn">
                <span>${escapeXml(label)}</span>
                <span style="font-size:11.5px;font-weight:500;color:var(--en-accent)">点击加载</span>
              </button>
            `;
            this.uiEl.querySelector('button')!.addEventListener('click', () => {
              this.invokeMount();
            });
          }
        } else {
          this.uiEl.innerHTML = '';
        }
      }

      private invokeMount(userInput?: string) {
        const prompt = this.getAttribute('prompt') || '生成相关界面内容';
        const mode = this.getMode();
        const trigger = this.getTrigger();
        const targetSel = this.getAttribute('target');
        const targetEl = targetSel ? doc.querySelector(targetSel) : null;

        if (this.cancelActive) {
          this.cancelActive();
          this.cancelActive = null;
        }

        this.setAttribute('status', 'loading');

        let appendEntry: HTMLElement | null = null;
        if (mode === 'append') {
          const host = targetEl || this;
          appendEntry = doc.createElement('div');
          appendEntry.className = 'en-mount-entry';
          appendEntry.style.animation = 'en-materialize 0.24s ease both';
          if (userInput && trigger === 'submit') {
            const userEcho = doc.createElement('en-chat-bubble');
            userEcho.setAttribute('self', '');
            userEcho.setAttribute('sender', '你');
            userEcho.textContent = userInput;
            host.appendChild(userEcho);
          }
          host.appendChild(appendEntry);
        }

        const contextSnippet = (doc.body?.innerText || '').slice(0, 1200);

        this.cancelActive = bridge.requestMount({
          prompt,
          userInput,
          contextSnippet,
          onChunk: (htmlSoFar) => {
            const safePreview = stripScriptsForPreview(htmlSoFar);
            if (appendEntry) {
              appendEntry.innerHTML = safePreview;
            } else if (targetEl) {
              targetEl.innerHTML = safePreview;
            } else {
              this.streamEl.innerHTML = safePreview;
            }
          },
          onDone: (finalHtml) => {
            this.cancelActive = null;
            this.streamEl.innerHTML = '';

            if (appendEntry) {
              appendEntry.innerHTML = finalHtml;
              executeEmbeddedScripts(doc, appendEntry);
              this.setAttribute('status', 'idle');
            } else if (targetEl) {
              targetEl.innerHTML = finalHtml;
              executeEmbeddedScripts(doc, targetEl);
              this.setAttribute('status', 'idle');
              doc.dispatchEvent(new win.CustomEvent('en-visibility-refresh'));
            } else {
              this.innerHTML = finalHtml;
              executeEmbeddedScripts(doc, this);
              this.setAttribute('status', trigger === 'submit' ? 'idle' : 'loaded');
              doc.dispatchEvent(new win.CustomEvent('en-visibility-refresh'));
            }
            bridge.persistDom();
          },
          onError: (err) => {
            this.cancelActive = null;
            if (appendEntry) {
              appendEntry.innerHTML = `<div class="en-muted" style="color:#c5221f">生成失败: ${escapeXml(err)}</div>`;
              this.setAttribute('status', 'idle');
            } else {
              this.streamEl.innerHTML = '';
              this.setAttribute('status', 'error');
              const errBox = this.uiEl.querySelector('.err-box span');
              if (errBox) errBox.textContent = `生成失败: ${err}`;
            }
          },
        });
      }
    },
  );
}
