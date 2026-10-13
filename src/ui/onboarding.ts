import { requireElement } from './dom';

const GUIDE_KEY = 'seo-operator-lab:guide-v1';

/** An opt-in inline walkthrough: points to real controls without covering the editor. */
export function setupOnboarding() {
  const welcome = requireElement<HTMLElement>('#welcome-guide');
  const guide = requireElement<HTMLElement>('#operation-guide');
  const title = requireElement<HTMLElement>('#guide-title');
  const detail = requireElement<HTMLElement>('#guide-detail');
  const count = requireElement<HTMLElement>('#guide-count');
  const previous = requireElement<HTMLButtonElement>('#guide-previous');
  const next = requireElement<HTMLButtonElement>('#guide-next');
  const help = requireElement<HTMLButtonElement>('#open-guide');
  const steps = [
    { target: '#quest-select', title: '选择一关，不必先懂术语', text: '左上角「当前关卡」可切换练习。切换或重置会先确认；刷新网页会丢失当前 WordPress 修改。不要放入真实账号、密钥或私密内容。' },
    { target: '#validate', title: '① 先验证，知道哪里错了', text: '绿色「运行验证」按钮一直在顶部。首次故意失败是正常的。验证面板里展开失败行，比较「期望」和「实际」；回归检查用来确认没有误伤其他功能。' },
    { target: '#edit-plugin', title: '② 打开代码，再保存', text: '「编辑代码」会直达本关文件；提示面板自动让出空间。WordPress 首次可能显示 I understand（我了解风险），仅在这个临时实验环境确认。改好后点击编辑框下方 Update File（更新文件），再点顶部「运行验证」。' },
    { target: '#toggle-mission-panel', title: '③ 卡住时看提示，不用猜按钮', text: '「任务与提示」随时打开侧栏。提示从定位证据逐步到具体修改，「照着操作」会展示改前／改后代码。想边看边改可点「固定」；小屏和全屏优先留出编辑空间。' },
    { target: '#toggle-runtime-fullscreen', title: '专注、重试与生产边界', text: '「全屏」自动收起侧栏；再次点击可退出。F / [ 快捷键只在外层工作台生效，不会抢走编辑器按键。练习通过后阅读实现复盘：实验性编辑不等于真实生产发布；「重置环境」可恢复初始故障。' },
  ];
  let current = 0;
  let returnFocus: HTMLElement = help;
  try { welcome.hidden = localStorage.getItem(GUIDE_KEY) === 'seen'; } catch { /* Show the invitation without requiring storage. */ }

  function render() {
    document.querySelectorAll('.is-guided').forEach((node) => node.classList.remove('is-guided'));
    const step = steps[current];
    requireElement(step.target).classList.add('is-guided');
    title.textContent = step.title;
    detail.textContent = step.text;
    count.textContent = `${current + 1} / ${steps.length}`;
    previous.disabled = current === 0;
    next.textContent = current === steps.length - 1 ? '完成引导' : '下一步';
  }
  function close() {
    guide.hidden = true;
    document.querySelectorAll('.is-guided').forEach((node) => node.classList.remove('is-guided'));
    try { localStorage.setItem(GUIDE_KEY, 'seen'); } catch { /* Session-only. */ }
    returnFocus.focus({ preventScroll: true });
  }
  function open() {
    returnFocus = document.activeElement instanceof HTMLElement && document.activeElement.id !== 'start-guide' ? document.activeElement : help;
    welcome.hidden = true;
    guide.hidden = false;
    current = 0;
    render();
    next.focus({ preventScroll: true });
  }
  help.addEventListener('click', open);
  requireElement('#start-guide').addEventListener('click', open);
  requireElement('#dismiss-welcome').addEventListener('click', () => { welcome.hidden = true; close(); });
  requireElement('#close-guide').addEventListener('click', close);
  previous.addEventListener('click', () => { if (current > 0) { --current; render(); } });
  next.addEventListener('click', () => { if (current === steps.length - 1) close(); else { ++current; render(); } });
  guide.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
}
