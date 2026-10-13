import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleCheck, CircleHelp,
  CircleX, Copy, ExternalLink, Eye, LoaderCircle, Maximize2, Minimize2,
  PanelRightClose, PanelRightOpen, Pin, RotateCcw, ScanSearch, ShieldCheck,
  TriangleAlert, Wrench, X, createIcons,
} from 'lucide';

const icons = {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleCheck, CircleHelp,
  CircleX, Copy, ExternalLink, Eye, LoaderCircle, Maximize2, Minimize2,
  PanelRightClose, PanelRightOpen, Pin, RotateCcw, ScanSearch, ShieldCheck,
  TriangleAlert, Wrench, X,
};

export function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required element is missing: ${selector}`);
  return element;
}

export function refreshIcons(root: Document | Element = document): void {
  createIcons({ icons, root, attrs: { 'stroke-width': 1.8 } });
}

export function createIcon(name: string): HTMLElement {
  const icon = document.createElement('i');
  icon.dataset.lucide = name;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export function replaceIcon(button: HTMLElement, name: string): void {
  button.querySelector('svg, i')?.replaceWith(createIcon(name));
  refreshIcons(button);
}

const copyLabels = new WeakMap<HTMLButtonElement, string>();
const copyTimers = new WeakMap<HTMLButtonElement, number>();

/** Clipboard permission is optional; selected text remains manually copyable. */
export async function copyCode(button: HTMLButtonElement, source: HTMLElement): Promise<void> {
  const original = copyLabels.get(button) ?? button.getAttribute('aria-label') ?? '复制代码';
  copyLabels.set(button, original);
  try {
    await navigator.clipboard.writeText(source.textContent ?? '');
    button.dataset.copied = 'true';
    button.setAttribute('aria-label', '已复制');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(source);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    button.setAttribute('aria-label', '请手动复制已选中的文字');
  }
  window.clearTimeout(copyTimers.get(button));
  copyTimers.set(button, window.setTimeout(() => {
    delete button.dataset.copied;
    button.setAttribute('aria-label', original);
    copyTimers.delete(button);
  }, 1800));
}
