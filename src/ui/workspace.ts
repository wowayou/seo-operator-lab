import { replaceIcon, requireElement } from './dom';

export type MissionView = 'overview' | 'results' | 'hints';
const WIDTH_KEY = 'seo-operator-lab:mission-panel-width';
const PIN_KEY = 'seo-operator-lab:mission-panel-pinned';

/** Docked on desktop; an explicitly opened sheet on compact screens. */
export function setupWorkspace() {
  const app = requireElement<HTMLElement>('#app-shell');
  const workspace = requireElement<HTMLElement>('.workspace');
  const panel = requireElement<HTMLElement>('#mission-panel');
  const canvas = requireElement<HTMLElement>('#runtime-canvas');
  const toggle = requireElement<HTMLButtonElement>('#toggle-mission-panel');
  const pin = requireElement<HTMLButtonElement>('#pin-mission-panel');
  const resizer = requireElement<HTMLElement>('#mission-resizer');
  const fullscreen = requireElement<HTMLButtonElement>('#toggle-runtime-fullscreen');
  const compact = window.matchMedia('(max-width: 1050px)');
  const tabs = (['overview', 'results', 'hints'] as const).map((view) => ({
    view,
    button: requireElement<HTMLButtonElement>(`#mission-tab-${view}`),
    panel: requireElement<HTMLElement>(`#mission-view-${view}`),
  }));
  let width = 380;
  let pinned = false;
  let fallbackFullscreen = false;
  let fullscreenPending = false;
  let beforeFullscreen = false;
  let isFullscreen = false;
  try {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(stored) && stored > 0) width = stored;
    pinned = localStorage.getItem(PIN_KEY) === 'true';
  } catch { /* Preferences are optional when storage is blocked. */ }

  function setWidth(next: number, persist = false) {
    const maximum = Math.max(320, Math.min(520, window.innerWidth - 660));
    width = Math.round(Math.max(320, Math.min(maximum, next)));
    workspace.style.setProperty('--mission-panel-width', `${width}px`);
    resizer.setAttribute('aria-valuemax', String(maximum));
    resizer.setAttribute('aria-valuenow', String(width));
    resizer.setAttribute('aria-valuetext', `${width} 像素`);
    if (persist) {
      try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* Session-only. */ }
    }
  }

  function collapsed() { return workspace.dataset.sidebar === 'collapsed'; }

  function setCollapsed(value: boolean) {
    if (value && panel.contains(document.activeElement)) toggle.focus({ preventScroll: true });
    workspace.dataset.sidebar = value ? 'collapsed' : 'expanded';
    panel.inert = value;
    panel.setAttribute('aria-hidden', String(value));
    canvas.inert = compact.matches && !value;
    resizer.tabIndex = value || compact.matches ? -1 : 0;
    resizer.setAttribute('aria-hidden', String(value || compact.matches));
    toggle.setAttribute('aria-expanded', String(!value));
    toggle.setAttribute('aria-label', value ? '打开任务与提示' : '收起任务与提示');
    toggle.title = `${value ? '打开' : '收起'}任务与提示 ([)`;
    replaceIcon(toggle, value ? 'panel-right-open' : 'panel-right-close');
  }

  function setView(view: MissionView, focus = false) {
    workspace.dataset.missionView = view;
    for (const tab of tabs) {
      const active = tab.view === view;
      tab.button.setAttribute('aria-selected', String(active));
      tab.button.tabIndex = active ? 0 : -1;
      tab.panel.hidden = !active;
      if (active && focus) tab.button.focus();
    }
  }

  function open(view: MissionView) {
    setCollapsed(false);
    setView(view);
  }

  function focusRuntime() {
    if (!pinned || compact.matches || isFullscreen) setCollapsed(true);
  }

  function syncPin() {
    pin.setAttribute('aria-pressed', String(pinned));
    pin.title = pinned ? '取消固定，编辑时自动收起' : '固定提示面板，编辑时保持展开';
    pin.querySelector('span')!.textContent = pinned ? '已固定' : '固定';
  }

  function renderFullscreen(active: boolean) {
    if (active && !isFullscreen) {
      beforeFullscreen = collapsed();
      setCollapsed(true);
    } else if (!active && isFullscreen) {
      setCollapsed(compact.matches ? true : beforeFullscreen);
    }
    isFullscreen = active;
    app.dataset.fullscreen = active ? (fallbackFullscreen ? 'fallback' : 'native') : 'false';
    fullscreen.setAttribute('aria-pressed', String(active));
    fullscreen.setAttribute('aria-label', active ? '退出全屏' : '全屏专注');
    fullscreen.querySelector('span')!.textContent = active ? '退出全屏' : '全屏';
    replaceIcon(fullscreen, active ? 'minimize-2' : 'maximize-2');
  }

  async function toggleFullscreen() {
    if (fullscreenPending) return;
    fullscreenPending = true;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (fallbackFullscreen) {
        fallbackFullscreen = false;
        renderFullscreen(false);
        return;
      }
      if (app.requestFullscreen && document.fullscreenEnabled) {
        try { await app.requestFullscreen({ navigationUI: 'hide' }); return; } catch { /* Use viewport mode. */ }
      }
      fallbackFullscreen = true;
      renderFullscreen(true);
    } catch {
      // If native exit is denied, the browser still owns its Escape affordance.
    } finally {
      fullscreenPending = false;
    }
  }

  toggle.addEventListener('click', () => setCollapsed(!collapsed()));
  requireElement('#close-mission-panel').addEventListener('click', () => setCollapsed(true));
  pin.addEventListener('click', () => {
    pinned = !pinned;
    syncPin();
    try { localStorage.setItem(PIN_KEY, String(pinned)); } catch { /* Session-only. */ }
  });
  for (const [index, tab] of tabs.entries()) {
    tab.button.addEventListener('click', () => setView(tab.view));
    tab.button.addEventListener('keydown', (event) => {
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      setView(tabs[next].view, true);
    });
  }
  let pointer: number | undefined;
  resizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || compact.matches) return;
    pointer = event.pointerId;
    resizer.setPointerCapture(pointer);
    document.body.classList.add('is-resizing-mission-panel');
  });
  resizer.addEventListener('pointermove', (event) => {
    if (pointer === event.pointerId) setWidth(workspace.getBoundingClientRect().right - event.clientX);
  });
  const finish = () => {
    pointer = undefined;
    document.body.classList.remove('is-resizing-mission-panel');
    setWidth(width, true);
  };
  resizer.addEventListener('pointerup', finish);
  resizer.addEventListener('pointercancel', finish);
  resizer.addEventListener('lostpointercapture', finish);
  resizer.addEventListener('keydown', (event) => {
    const next = { ArrowLeft: width + 16, ArrowRight: width - 16, Home: 520, End: 320 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setWidth(next, true);
  });
  fullscreen.addEventListener('click', () => void toggleFullscreen());
  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    if (active) fallbackFullscreen = false;
    renderFullscreen(active || fallbackFullscreen);
  });
  compact.addEventListener('change', () => {
    setWidth(width);
    setCollapsed(compact.matches || !pinned);
  });
  window.addEventListener('resize', () => setWidth(width));
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]')) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable], [role="textbox"]')) return;
    if (event.key === 'Escape' && fallbackFullscreen) {
      fallbackFullscreen = false;
      renderFullscreen(false);
    } else if (event.key === '[') {
      event.preventDefault();
      setCollapsed(!collapsed());
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void toggleFullscreen();
    }
  });
  setWidth(width);
  syncPin();
  setCollapsed(compact.matches);
  setView('overview');
  renderFullscreen(false);
  return { open, setView, focusRuntime, setCollapsed };
}
