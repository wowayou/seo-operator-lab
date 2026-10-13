import { getQuest, quests } from './quests/registry';
import type { AdvancedChallenge, QuestDefinition, ValidationCheck, ValidationResult } from './quests/types';
import { RuntimeSession } from './runtime';
import { copyCode, createIcon, refreshIcons, replaceIcon, requireElement } from './ui/dom';
import { setupOnboarding } from './ui/onboarding';
import { setupWorkspace } from './ui/workspace';
import './styles.css';

const element = <T extends HTMLElement = HTMLElement>(id: string) => requireElement<T>(`#${id}`);
const questSelect = element<HTMLSelectElement>('quest-select');
const validateButton = element<HTMLButtonElement>('validate');
const output = element('validation-output');
const badge = element('result-badge');
const resetDialog = element<HTMLDialogElement>('reset-dialog');
const hintList = element<HTMLOListElement>('hint-list');
const revealHintButton = element<HTMLButtonElement>('reveal-hint');
const workspace = requireElement<HTMLElement>('.workspace');
const layout = setupWorkspace();
let currentQuest = getQuest(new URL(location.href).searchParams.get('quest'));
let iframe = element<HTMLIFrameElement>('wp-playground');
let revealedHints = 0;
let advancedMode = false;
let hasEditsRisk = false;
let validationAttempt = 0;

type RebuildRequest = { kind: 'reset' } | { kind: 'switch'; quest: QuestDefinition } | { kind: 'advanced' };
let pendingRebuild: RebuildRequest | undefined;

function setStatus(message: string, state: string): void {
  const status = element('runtime-status');
  status.textContent = message;
  status.title = message;
  status.dataset.state = state;
  requireElement<HTMLElement>('.runtime-indicator').dataset.state = state;
}

function setControls(): void {
  for (const id of ['validate', 'edit-plugin', 'view-target', 'solution-open-editor', 'hint-open-editor', 'start-advanced']) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button) button.disabled = !runtime.available;
  }
}

function setProgress(stage: 'booting' | 'ready' | 'failed' | 'passed'): void {
  const states = {
    booting: ['current', 'pending', 'pending'],
    ready: ['done', 'current', 'pending'],
    failed: ['done', 'done', 'current'],
    passed: ['done', 'done', 'done'],
  };
  ['environment', 'evidence', 'repair'].forEach((step, index) => {
    element(`step-${step}`).dataset.state = states[stage][index];
  });
}

function bootCover(visible: boolean, error?: string): void {
  const cover = element('boot-cover');
  cover.hidden = !visible;
  cover.dataset.state = error ? 'error' : 'loading';
  cover.querySelector('strong')!.textContent = error ? '环境启动失败，可手动重试' : `正在创建 WordPress ${currentQuest.metadata.environment.wordpress}`;
  cover.querySelector('span')!.textContent = error ?? '首次启动通常需要 30–90 秒。可以先读任务或操作指引。';
  element('retry-runtime').hidden = !error;
  replaceIcon(cover, error ? 'triangle-alert' : 'loader-circle');
}

const runtime = new RuntimeSession({
  replaceFrame: () => {
    const next = iframe.cloneNode(false) as HTMLIFrameElement;
    // Never clone the old scoped URL: it could start a second obsolete boot.
    next.removeAttribute('src');
    iframe.replaceWith(next);
    iframe = next;
    return iframe;
  },
  onState: (state) => {
    setControls();
    questSelect.disabled = state === 'booting' || state === 'validating' || state === 'navigating';
    validateButton.classList.toggle('is-loading', state === 'validating');
    validateButton.querySelector('span')!.textContent = state === 'validating' ? '验证中…' : '① 运行验证';
    if (state !== 'error') element('runtime-error').hidden = true;
    if (state === 'booting') {
      bootCover(true);
      setProgress('booting');
      setStatus('正在创建临时 WordPress，首次可能需要 30–90 秒', state);
    } else if (state === 'validating') {
      setStatus('正在读取目标页与回归证据', state);
    } else if (state === 'navigating') {
      setStatus('正在打开运行环境中的页面', state);
    }
  },
  onError: (message, operation) => {
    setStatus(message, 'error');
    element('runtime-error').hidden = false;
    element('runtime-error').textContent = message;
    if (operation === 'booting') bootCover(true, message);
    if (operation === 'validating') {
      output.dataset.result = 'error';
      badge.dataset.result = 'error';
      badge.textContent = '未完成';
      output.replaceChildren(messageNode('验证未完成，不是通过或未通过', message));
      layout.open('results');
    }
  },
  onNavigation: (url) => {
    if (/\/(?:plugin-editor|theme-editor|post|post-new|site-editor)\.php(?:[?#]|$)/.test(url)) {
      markResultStale();
      hasEditsRisk = true;
      layout.focusRuntime();
    }
  },
});

function messageNode(title: string, text: string): HTMLElement {
  const node = document.createElement('div');
  node.className = 'validation-summary';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const note = document.createElement('p');
  note.textContent = text;
  node.append(heading, note);
  return node;
}

function renderIdleValidation(): void {
  ++validationAttempt;
  workspace.dataset.result = 'idle';
  element('success-toast').dataset.visible = 'false';
  element('validation-staleness').hidden = true;
  output.dataset.result = 'idle';
  delete output.dataset.outcome;
  badge.dataset.result = 'idle';
  badge.textContent = '未运行';
  element('review-section').hidden = true;
  element('advanced-challenge').hidden = true;
  output.replaceChildren(messageNode('先建立故障基线', '点击顶部绿色「① 运行验证」。初始未通过是题目故意设置的，不是你操作错了。'));
}

function markResultStale(): void {
  if (output.dataset.result !== 'idle') element('validation-staleness').hidden = false;
  element('success-toast').dataset.visible = 'false';
  workspace.dataset.result = 'idle';
}

function renderList(id: string, values: string[]): void {
  element(id).replaceChildren(...values.map((value) => {
    const item = document.createElement('li');
    item.textContent = value;
    return item;
  }));
}

function renderAdvanced(prefix: string, challenge: AdvancedChallenge): void {
  element(`${prefix}-title`).textContent = challenge.title;
  element(`${prefix}-description`).textContent = challenge.description;
  element(`${prefix}-why`).textContent = challenge.why ?? '';
  renderList(`${prefix}-steps`, challenge.steps ?? []);
  element(`${prefix}-instruction`).textContent = challenge.instruction;
}

function renderReview(result: ValidationResult): void {
  const section = element('review-section');
  section.hidden = !result.passed || !result.review;
  if (section.hidden || !result.review) return;
  const review = currentQuest.metadata.postPassReview;
  element('review-heading').textContent = review.title;
  element('review-badge').textContent = result.review.label;
  element('review-badge').dataset.level = result.review.level;
  element('review-summary').textContent = result.review.summary;
  renderList('review-notes', review.notes);
  const challenge = review.advancedChallenge;
  const show = Boolean(challenge && result.review.level !== 'production');
  element('advanced-challenge').hidden = !show;
  if (show && challenge) {
    renderAdvanced('advanced', challenge);
    element('start-advanced').querySelector('span')!.textContent = challenge.buttonLabel;
  }
}

function appendEvidence(details: HTMLDetailsElement, check: ValidationCheck): void {
  const evidence = document.createElement('dl');
  evidence.className = 'check-evidence';
  const values = [['期望', check.expected, 'expected'], ['实际', check.actual, 'actual']];
  if (check.details) values.push(['说明', check.details, 'details']);
  for (const [label, value, kind] of values) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.dataset.value = kind;
    // Evidence comes from editable PHP/HTML. Never insert it as markup.
    description.textContent = value;
    evidence.append(term, description);
  }
  details.append(evidence);
}

function renderValidation(result: ValidationResult): void {
  const state = result.passed ? 'pass' : 'fail';
  const regressionFailed = result.targetPassed && !result.passed;
  output.dataset.result = state;
  output.dataset.outcome = regressionFailed ? 'regression' : state;
  workspace.dataset.result = state;
  badge.dataset.result = state;
  badge.textContent = result.passed ? '通过' : regressionFailed ? '回归失败' : '未通过';
  element('validation-staleness').hidden = true;
  element('success-toast').dataset.visible = String(result.passed);
  output.replaceChildren(messageNode(
    result.passed ? '目标与回归均通过' : regressionFailed ? '目标已修复，但产生了副作用' : '还有目标检查需要处理',
    result.passed ? '这是本次实验的检查结果，不是生产部署或实际搜索收录保证。' : '失败项已展开。先比较期望与实际，再用「提示」页定位修改。',
  ));
  const checks = document.createElement('ol');
  checks.className = 'validation-checks';
  for (const group of ['target', 'regression'] as const) {
    const label = document.createElement('li');
    label.className = 'validation-group-label';
    label.dataset.group = group;
    label.textContent = group === 'target' ? '目标检查 · 症状是否消失' : '回归检查 · 是否误伤其他行为';
    checks.append(label);
    for (const check of result.checks.filter((item) => item.group === group)) {
      const row = document.createElement('li');
      row.className = 'validation-check';
      row.dataset.checkId = check.id;
      row.dataset.checkGroup = check.group;
      row.dataset.passed = String(check.passed);
      const details = document.createElement('details');
      details.open = !check.passed;
      const summary = document.createElement('summary');
      summary.className = 'check-summary';
      summary.append(createIcon(check.passed ? 'check' : 'circle-x'));
      const name = document.createElement('strong');
      name.className = 'check-copy';
      name.textContent = check.name;
      const toggle = document.createElement('span');
      toggle.className = 'evidence-toggle';
      toggle.append(document.createTextNode('证据'), createIcon('chevron-down'));
      summary.append(name, toggle);
      details.append(summary);
      appendEvidence(details, check);
      row.append(details);
      checks.append(row);
    }
  }
  output.append(checks);
  renderReview(result);
  refreshIcons(output);
}

function resetHints(): void {
  revealedHints = 0;
  hintList.replaceChildren();
  element('hint-progress').textContent = `0 / ${currentQuest.metadata.hints.length}`;
  revealHintButton.disabled = false;
  revealHintButton.querySelector('span')!.textContent = '显示第一条提示';
  element<HTMLDetailsElement>('solution-guide').open = false;
}

function addNextHint(): void {
  const hints = currentQuest.metadata.hints;
  const hint = hints[revealedHints];
  if (!hint) return;
  ++revealedHints;
  const item = document.createElement('li');
  item.className = 'hint-item';
  const title = document.createElement('strong');
  title.textContent = `${hint.level}. ${hint.title}`;
  const text = document.createElement('p');
  text.textContent = hint.text;
  item.append(title, text);
  if (hint.href && hint.linkLabel && new URL(hint.href).protocol === 'https:') {
    const link = document.createElement('a');
    link.href = hint.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(document.createTextNode(hint.linkLabel), createIcon('external-link'));
    item.append(link);
  }
  if (hint.action === 'open-editor') {
    const action = document.createElement('button');
    action.id = 'hint-open-editor';
    action.className = 'button button-secondary';
    action.type = 'button';
    action.textContent = currentQuest.metadata.editor.label;
    action.disabled = !runtime.available;
    action.addEventListener('click', () => void openPluginEditor(currentQuest.metadata.editor.file));
    item.append(action);
  }
  hintList.append(item);
  element('hint-progress').textContent = `${revealedHints} / ${hints.length}`;
  revealHintButton.disabled = revealedHints === hints.length;
  revealHintButton.querySelector('span')!.textContent = revealedHints === hints.length ? '已显示全部提示' : `显示第 ${revealedHints + 1} 条提示`;
  refreshIcons(item);
}

function renderQuest(): void {
  const metadata = currentQuest.metadata;
  advancedMode = false;
  element('advanced-active').hidden = true;
  element('phase-label').textContent = `关卡 ${String(metadata.sequence).padStart(2, '0')}`;
  element('difficulty').textContent = `难度 ${metadata.difficulty} / 5`;
  element('challenge-heading').textContent = metadata.title;
  element('mission-brief').textContent = metadata.description;
  element('target-url').textContent = metadata.target.url;
  element('completion-condition').textContent = metadata.objective.completion;
  element('editor-location').textContent = metadata.editor.location;
  element('edit-plugin').title = `${metadata.editor.label}：${metadata.editor.file}`;
  element('runtime-target-path').textContent = metadata.target.url;
  element('search-query').textContent = metadata.searchQuery;
  element('success-title').textContent = metadata.success.title;
  element('success-message').textContent = metadata.success.message;
  element('solution-concept').textContent = metadata.walkthrough.concept;
  renderList('solution-steps', metadata.walkthrough.steps);
  element('solution-before').textContent = metadata.walkthrough.before;
  element('solution-after').textContent = metadata.walkthrough.after;
  element('solution-caution').textContent = metadata.walkthrough.caution;
  document.title = `${metadata.title} | SEO Operator Lab`;
  questSelect.value = metadata.id;
  layout.setView('overview');
  resetHints();
  renderIdleValidation();
  const url = new URL(location.href);
  url.searchParams.set('quest', metadata.id);
  history.replaceState({}, '', url);
}

async function runValidation(): Promise<void> {
  if (!runtime.available) return;
  const attempt = ++validationAttempt;
  element('success-toast').dataset.visible = 'false';
  element('review-section').hidden = true;
  element('validation-staleness').hidden = true;
  workspace.dataset.result = 'idle';
  output.dataset.result = 'pending';
  badge.dataset.result = 'idle';
  badge.textContent = '验证中';
  output.replaceChildren(messageNode('正在检查…', '验证不会修改你的代码。'));
  layout.open('results');
  const quest = currentQuest;
  const result = await runtime.execute('validating', (client) => quest.validate(client));
  if (!result || attempt !== validationAttempt) return;
  renderValidation(result);
  setProgress(result.passed ? 'passed' : 'failed');
  setStatus(result.passed ? '本次验证通过；请阅读实现复盘' : result.targetPassed ? '症状已消失，但回归检查失败' : '验证未通过，失败项证据已展开', 'ready');
}

async function openPluginEditor(file: string): Promise<void> {
  if (!runtime.available) return;
  const params = new URLSearchParams({ file, plugin: file });
  markResultStale();
  layout.focusRuntime();
  const navigated = await runtime.execute('navigating', async (client) => {
    await client.goTo(`/wp-admin/plugin-editor.php?${params}`);
    return true;
  });
  if (navigated) {
    hasEditsRisk = true;
    setStatus('编辑后点击 WordPress 的 Update File，再用顶部按钮验证', 'ready');
  }
}

async function viewTarget(): Promise<void> {
  if (!runtime.available) return;
  layout.focusRuntime();
  const target = currentQuest.metadata.target.url;
  const navigated = await runtime.execute('navigating', async (client) => { await client.goTo(target); return true; });
  if (navigated) setStatus('正在查看目标页；顶部按钮可返回编辑或验证', 'ready');
}

function requestRebuild(request: RebuildRequest): void {
  if (resetDialog.open) return;
  pendingRebuild = request;
  resetDialog.returnValue = '';
  if (request.kind === 'switch') {
    element('rebuild-dialog-title').textContent = `切换到「${request.quest.metadata.title}」？`;
    element('rebuild-dialog-description').textContent = '当前 WordPress 的所有修改会被丢弃，并创建新关卡。需要保留的代码请先复制。';
    element('confirm-reset').textContent = '确认切换';
  } else if (request.kind === 'advanced') {
    element('rebuild-dialog-title').textContent = '开始站点自有的生产修复路径？';
    element('rebuild-dialog-description').textContent = '当前实验修复会被重置。新环境就绪后自动打开 Site Overrides 插件。这仍是练习，不会部署到任何真实站点。';
    element('confirm-reset').textContent = '重置并继续';
  } else {
    element('rebuild-dialog-title').textContent = '重置当前环境？';
    element('rebuild-dialog-description').textContent = '所有运行时修改会被丢弃，恢复本关初始故障。需要保留的代码请先复制；提示和布局偏好不受影响。';
    element('confirm-reset').textContent = '确认重置';
  }
  resetDialog.showModal();
}

async function rebuild(request: RebuildRequest): Promise<void> {
  hasEditsRisk = false;
  renderIdleValidation();
  if (request.kind === 'switch') {
    currentQuest = request.quest;
    renderQuest();
  }
  advancedMode = request.kind === 'advanced';
  element('advanced-active').hidden = !advancedMode;
  const advanced = currentQuest.metadata.postPassReview.advancedChallenge;
  if (advancedMode && advanced) renderAdvanced('advanced-active', advanced);
  const activeFile = advancedMode && advanced ? advanced.editorFile : currentQuest.metadata.editor.file;
  element('edit-plugin').title = `编辑本关文件：${activeFile}`;
  element('editor-location').textContent = advancedMode && advanced
    ? `当前生产路径：${activeFile}。在现有 init 回调内添加代码，点击编辑框下方 Update File 保存。`
    : currentQuest.metadata.editor.location;
  layout.open('overview');
  if (!(await runtime.boot(currentQuest))) return;
  bootCover(false);
  setProgress('ready');
  setStatus('环境已就绪；先点顶部「① 运行验证」', 'ready');
  if (advancedMode && advanced) await openPluginEditor(advanced.editorFile);
}

for (const quest of quests) {
  const option = document.createElement('option');
  option.value = quest.metadata.id;
  option.textContent = `${String(quest.metadata.sequence).padStart(2, '0')} · ${quest.metadata.title}`;
  questSelect.append(option);
}
questSelect.addEventListener('change', () => {
  const next = getQuest(questSelect.value);
  questSelect.value = currentQuest.metadata.id;
  if (next !== currentQuest) requestRebuild({ kind: 'switch', quest: next });
});
resetDialog.addEventListener('close', () => { pendingRebuild = undefined; });
element('confirm-reset').addEventListener('click', () => {
  const request = pendingRebuild;
  if (!request) return;
  pendingRebuild = undefined;
  resetDialog.close('confirm');
  void rebuild(request);
});
validateButton.addEventListener('click', () => void runValidation());
element('edit-plugin').addEventListener('click', () => {
  const advanced = currentQuest.metadata.postPassReview.advancedChallenge;
  void openPluginEditor(advancedMode && advanced ? advanced.editorFile : currentQuest.metadata.editor.file);
});
element('solution-open-editor').addEventListener('click', () => void openPluginEditor(currentQuest.metadata.editor.file));
element('view-target').addEventListener('click', () => void viewTarget());
element('reset').addEventListener('click', () => requestRebuild({ kind: 'reset' }));
element('success-reset').addEventListener('click', () => requestRebuild({ kind: 'reset' }));
element('retry-runtime').addEventListener('click', () => void rebuild({ kind: 'reset' }));
element('start-advanced').addEventListener('click', () => requestRebuild({ kind: 'advanced' }));
element('dismiss-success').addEventListener('click', () => { element('success-toast').dataset.visible = 'false'; });
element('open-hints').addEventListener('click', () => layout.open('hints'));
revealHintButton.addEventListener('click', addNextHint);
for (const [buttonId, sourceId] of [
  ['copy-query', 'search-query'], ['copy-solution', 'solution-after'],
  ['copy-advanced-instruction', 'advanced-instruction'], ['copy-advanced-active-instruction', 'advanced-active-instruction'],
]) {
  element<HTMLButtonElement>(buttonId).addEventListener('click', () => void copyCode(element<HTMLButtonElement>(buttonId), element(sourceId)));
}
window.addEventListener('beforeunload', (event) => {
  if (!hasEditsRisk) return;
  event.preventDefault();
  event.returnValue = '';
});

renderQuest();
setupOnboarding();
refreshIcons();
void runtime.boot(currentQuest).then((ready) => {
  if (!ready) return;
  bootCover(false);
  setProgress('ready');
  setStatus('环境已就绪；先点顶部「① 运行验证」', 'ready');
});
