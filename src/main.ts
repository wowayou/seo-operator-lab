import {
  Check,
  CircleCheck,
  CircleHelp,
  CircleX,
  Copy,
  ChevronDown,
  createIcons,
  ExternalLink,
  Eye,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  X,
} from 'lucide';
import type { PlaygroundClient } from '@wp-playground/client';
import { getQuest, quests } from './quests/registry';
import type { AdvancedChallenge, QuestDefinition, ValidationCheck, ValidationResult } from './quests/types';
import './styles.css';

const iconSet = {
  Check,
  CircleCheck,
  CircleHelp,
  CircleX,
  Copy,
  ChevronDown,
  ExternalLink,
  Eye,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  X,
};

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required Phase B element is missing: ${selector}`);
  return element;
}

function refreshIcons(root: Document | Element = document): void {
  createIcons({ icons: iconSet, root, attrs: { 'stroke-width': 1.8 } });
}

function createIcon(name: string): HTMLElement {
  const icon = document.createElement('i');
  icon.dataset.lucide = name;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

const iframeElement = requireElement<HTMLIFrameElement>('#wp-playground');
const questSelect = requireElement<HTMLSelectElement>('#quest-select');
const phaseLabel = requireElement<HTMLElement>('#phase-label');
const difficulty = requireElement<HTMLElement>('#difficulty');
const challengeHeading = requireElement<HTMLElement>('#challenge-heading');
const missionBrief = requireElement<HTMLElement>('#mission-brief');
const targetUrl = requireElement<HTMLElement>('#target-url');
const completionCondition = requireElement<HTMLElement>('#completion-condition');
const editPluginLabel = requireElement<HTMLElement>('#edit-plugin-label');
const editorLocation = requireElement<HTMLElement>('#editor-location');
const runtimeTargetPath = requireElement<HTMLElement>('#runtime-target-path');
const validateButton = requireElement<HTMLButtonElement>('#validate');
const editPluginButton = requireElement<HTMLButtonElement>('#edit-plugin');
const viewTargetButton = requireElement<HTMLButtonElement>('#view-target');
const resetButton = requireElement<HTMLButtonElement>('#reset');
const confirmResetButton = requireElement<HTMLButtonElement>('#confirm-reset');
const resetDialog = requireElement<HTMLDialogElement>('#reset-dialog');
const rebuildDialogTitle = requireElement<HTMLElement>('#rebuild-dialog-title');
const rebuildDialogDescription = requireElement<HTMLElement>('#rebuild-dialog-description');
const workspace = requireElement<HTMLElement>('.workspace');
const runtimePane = requireElement<HTMLElement>('.runtime-pane');
const successToast = requireElement<HTMLElement>('#success-toast');
const successTitle = requireElement<HTMLElement>('#success-title');
const successMessage = requireElement<HTMLElement>('#success-message');
const successResetButton = requireElement<HTMLButtonElement>('#success-reset');
const dismissSuccessButton = requireElement<HTMLButtonElement>('#dismiss-success');
const runtimeStatus = requireElement<HTMLElement>('#runtime-status');
const runtimeIndicator = requireElement<HTMLElement>('.runtime-indicator');
const validationOutput = requireElement<HTMLElement>('#validation-output');
const resultBadge = requireElement<HTMLElement>('#result-badge');
const bootCover = requireElement<HTMLElement>('#boot-cover');
const revealHintButton = requireElement<HTMLButtonElement>('#reveal-hint');
const hintList = requireElement<HTMLOListElement>('#hint-list');
const hintProgress = requireElement<HTMLElement>('#hint-progress');
const copyQueryButton = requireElement<HTMLButtonElement>('#copy-query');
const searchQuery = requireElement<HTMLElement>('#search-query');
const researchClue = requireElement<HTMLElement>('.research-clue');
const stepEnvironment = requireElement<HTMLLIElement>('#step-environment');
const stepEvidence = requireElement<HTMLLIElement>('#step-evidence');
const stepRepair = requireElement<HTMLLIElement>('#step-repair');
const reviewSection = requireElement<HTMLElement>('#review-section');
const reviewHeading = requireElement<HTMLElement>('#review-heading');
const reviewBadge = requireElement<HTMLElement>('#review-badge');
const reviewSummary = requireElement<HTMLElement>('#review-summary');
const reviewNotes = requireElement<HTMLUListElement>('#review-notes');
const advancedChallenge = requireElement<HTMLElement>('#advanced-challenge');
const advancedTitle = requireElement<HTMLElement>('#advanced-title');
const advancedDescription = requireElement<HTMLElement>('#advanced-description');
const advancedWhy = requireElement<HTMLElement>('#advanced-why');
const advancedSteps = requireElement<HTMLOListElement>('#advanced-steps');
const advancedInstruction = requireElement<HTMLElement>('#advanced-instruction');
const copyAdvancedInstructionButton = requireElement<HTMLButtonElement>('#copy-advanced-instruction');
const startAdvancedButton = requireElement<HTMLButtonElement>('#start-advanced');
const advancedActive = requireElement<HTMLElement>('#advanced-active');
const advancedActiveTitle = requireElement<HTMLElement>('#advanced-active-title');
const advancedActiveDescription = requireElement<HTMLElement>('#advanced-active-description');
const advancedActiveWhy = requireElement<HTMLElement>('#advanced-active-why');
const advancedActiveSteps = requireElement<HTMLOListElement>('#advanced-active-steps');
const advancedActiveInstruction = requireElement<HTMLElement>('#advanced-active-instruction');
const copyAdvancedActiveInstructionButton = requireElement<HTMLButtonElement>('#copy-advanced-active-instruction');

let currentQuest = getQuest(new URL(window.location.href).searchParams.get('quest'));
let iframe: HTMLIFrameElement = iframeElement;
let client: PlaygroundClient | undefined;
let bootPromise: Promise<void> | undefined;
let revealedHints = 0;
let advancedMode = false;

type RuntimeState = 'booting' | 'ready' | 'validating' | 'resetting' | 'error';
type ProgressStage = 'booting' | 'ready' | 'failed' | 'passed';
type StepState = 'pending' | 'current' | 'done';

type RebuildRequest =
  | { kind: 'reset' }
  | { kind: 'switch'; quest: QuestDefinition }
  | { kind: 'advanced'; editorFile: string };

let pendingRebuild: RebuildRequest | undefined;

function setRuntimeStatus(message: string, state: RuntimeState): void {
  runtimeStatus.textContent = message;
  runtimeStatus.dataset.state = state;
  runtimeIndicator.dataset.state = state;
}

function setProgress(stage: ProgressStage): void {
  const states: Record<ProgressStage, [StepState, StepState, StepState]> = {
    booting: ['current', 'pending', 'pending'],
    ready: ['done', 'current', 'pending'],
    failed: ['done', 'done', 'current'],
    passed: ['done', 'done', 'done'],
  };
  const [environment, evidence, repair] = states[stage];
  stepEnvironment.dataset.state = environment;
  stepEvidence.dataset.state = evidence;
  stepRepair.dataset.state = repair;
}

function setBootCover(
  visible: boolean,
  title = `正在创建 WordPress ${currentQuest.metadata.environment.wordpress}`,
  detail = '首次启动通常需要 30–90 秒',
  state: 'loading' | 'error' = 'loading',
): void {
  bootCover.classList.toggle('is-hidden', !visible);
  bootCover.setAttribute('aria-hidden', String(!visible));
  bootCover.dataset.state = state;
  const currentIcon = bootCover.querySelector('svg, i');
  currentIcon?.replaceWith(createIcon(state === 'error' ? 'triangle-alert' : 'loader-circle'));
  const heading = bootCover.querySelector('strong');
  const note = bootCover.querySelector('span');
  if (heading) heading.textContent = title;
  if (note) note.textContent = detail;
  refreshIcons(bootCover);
}

function setRuntimeControls(disabled: boolean): void {
  validateButton.disabled = disabled;
  editPluginButton.disabled = disabled;
  viewTargetButton.disabled = disabled;
  questSelect.disabled = disabled;
}

function hideReview(): void {
  reviewSection.hidden = true;
  advancedChallenge.hidden = true;
}

function renderIdleValidation(): void {
  workspace.dataset.result = 'idle';
  successToast.dataset.visible = 'false';
  validationOutput.dataset.result = 'idle';
  delete validationOutput.dataset.outcome;
  resultBadge.dataset.result = 'idle';
  resultBadge.textContent = '未运行';
  hideReview();
  validationOutput.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.append(createIcon('scan-search'));
  const message = document.createElement('p');
  message.textContent = '先运行一次验证，建立故障基线。';
  empty.append(message);
  validationOutput.append(empty);
  refreshIcons(validationOutput);
}

function appendEvidence(details: HTMLDetailsElement, check: ValidationCheck): void {
  const evidence = document.createElement('dl');
  evidence.className = 'check-evidence';
  const expectedLabel = document.createElement('dt');
  expectedLabel.textContent = '期望';
  const expectedValue = document.createElement('dd');
  expectedValue.dataset.value = 'expected';
  expectedValue.textContent = check.expected;
  const actualLabel = document.createElement('dt');
  actualLabel.textContent = '实际';
  const actualValue = document.createElement('dd');
  actualValue.dataset.value = 'actual';
  actualValue.textContent = check.actual;
  evidence.append(expectedLabel, expectedValue, actualLabel, actualValue);
  if (check.details) {
    const detailsLabel = document.createElement('dt');
    detailsLabel.textContent = '说明';
    const detailsValue = document.createElement('dd');
    detailsValue.textContent = check.details;
    evidence.append(detailsLabel, detailsValue);
  }
  details.append(evidence);
}

function renderAdvancedGuide(
  advanced: AdvancedChallenge,
  why: HTMLElement,
  steps: HTMLOListElement,
  instruction: HTMLElement,
): void {
  why.textContent = advanced.why ?? '';
  why.hidden = !advanced.why;
  steps.replaceChildren(
    ...(advanced.steps ?? []).map((step) => {
      const item = document.createElement('li');
      item.textContent = step;
      return item;
    }),
  );
  steps.hidden = !advanced.steps?.length;
  instruction.textContent = advanced.instruction;
}

function renderReview(result: ValidationResult): void {
  if (!result.passed || !result.review) {
    hideReview();
    return;
  }
  const metadata = currentQuest.metadata;
  reviewSection.hidden = false;
  reviewHeading.textContent = metadata.postPassReview.title;
  reviewBadge.textContent = result.review.label;
  reviewBadge.dataset.level = result.review.level;
  reviewSummary.textContent = result.review.summary;
  reviewNotes.replaceChildren(
    ...metadata.postPassReview.notes.map((note) => {
      const item = document.createElement('li');
      item.textContent = note;
      return item;
    }),
  );

  const advanced = metadata.postPassReview.advancedChallenge;
  const showAdvanced = Boolean(advanced && result.review.level !== 'production');
  advancedChallenge.hidden = !showAdvanced;
  if (advanced && showAdvanced) {
    advancedTitle.textContent = advanced.title;
    advancedDescription.textContent = advanced.description;
    renderAdvancedGuide(advanced, advancedWhy, advancedSteps, advancedInstruction);
    const label = startAdvancedButton.querySelector('span');
    if (label) label.textContent = advanced.buttonLabel;
  }
  refreshIcons(reviewSection);
}

function renderValidation(result: ValidationResult): void {
  const resultState = result.passed ? 'pass' : 'fail';
  const regressionFailed = result.targetPassed && !result.passed;
  validationOutput.dataset.result = resultState;
  validationOutput.dataset.outcome = regressionFailed ? 'regression' : resultState;
  workspace.dataset.result = resultState;
  successToast.dataset.visible = String(result.passed);
  resultBadge.dataset.result = resultState;
  resultBadge.textContent = result.passed ? '通过' : regressionFailed ? '回归失败' : '未通过';
  validationOutput.replaceChildren();

  const summary = document.createElement('div');
  summary.className = 'validation-summary';
  summary.append(createIcon(result.passed ? 'circle-check' : 'circle-x'));
  const summaryCopy = document.createElement('div');
  const summaryTitle = document.createElement('strong');
  summaryTitle.textContent = result.passed
    ? '目标与回归检查均通过'
    : regressionFailed
      ? '目标已修复，但产生了副作用'
      : '目标检查仍有失败项';
  const summaryNote = document.createElement('span');
  summaryNote.textContent = result.passed
    ? '当前实现满足本题全部确定性条件。'
    : regressionFailed
      ? '不要只看症状消失；阅读回归证据并收窄修改范围。'
      : '先阅读失败项的证据，再决定下一次修改。';
  summaryCopy.append(summaryTitle, summaryNote);
  summary.append(summaryCopy);

  const checks = document.createElement('ol');
  checks.className = 'validation-checks';
  for (const group of ['target', 'regression'] as const) {
    const groupChecks = result.checks.filter((check) => check.group === group);
    if (!groupChecks.length) continue;
    const groupLabel = document.createElement('li');
    groupLabel.className = 'validation-group-label';
    groupLabel.dataset.group = group;
    groupLabel.textContent = group === 'target' ? '目标检查' : '回归检查';
    checks.append(groupLabel);

    for (const check of groupChecks) {
      const row = document.createElement('li');
      row.className = 'validation-check';
      row.dataset.checkId = check.id;
      row.dataset.checkGroup = check.group;
      row.dataset.passed = String(check.passed);
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.className = 'check-summary';
      summary.append(createIcon(check.passed ? 'check' : 'circle-x'));
      const copy = document.createElement('div');
      copy.className = 'check-copy';
      const name = document.createElement('strong');
      name.textContent = check.name;
      const state = document.createElement('span');
      state.textContent = check.passed ? '符合预期' : '需要处理';
      copy.append(name, state);
      const evidenceToggle = document.createElement('span');
      evidenceToggle.className = 'evidence-toggle';
      evidenceToggle.append(document.createTextNode('查看证据'), createIcon('chevron-down'));
      summary.append(copy, evidenceToggle);
      details.append(summary);
      appendEvidence(details, check);
      row.append(details);
      checks.append(row);
    }
  }

  validationOutput.append(summary, checks);
  renderReview(result);
  refreshIcons(validationOutput);
}

function resetHints(): void {
  revealedHints = 0;
  hintList.replaceChildren();
  hintProgress.textContent = `0 / ${currentQuest.metadata.hints.length}`;
  revealHintButton.disabled = false;
  const label = revealHintButton.querySelector('span');
  if (label) label.textContent = '显示第一条提示';
}

function addNextHint(): void {
  const hints = currentQuest.metadata.hints;
  if (revealedHints >= hints.length) return;
  const hint = hints[revealedHints];
  revealedHints += 1;

  const item = document.createElement('li');
  item.className = 'hint-item';
  const number = document.createElement('span');
  number.className = 'hint-number';
  number.textContent = String(hint.level);
  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = hint.title;
  const body = document.createElement('p');
  body.textContent = hint.text;
  content.append(title, body);

  if (hint.href && hint.linkLabel) {
    const link = document.createElement('a');
    link.href = hint.href;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.append(document.createTextNode(hint.linkLabel), createIcon('external-link'));
    content.append(link);
  }

  if (hint.action === 'open-editor') {
    const action = document.createElement('button');
    action.id = 'hint-open-editor';
    action.className = 'button hint-action';
    action.type = 'button';
    action.append(createIcon('wrench'));
    const label = document.createElement('span');
    label.textContent = currentQuest.metadata.editor.label;
    action.append(label);
    action.addEventListener('click', () => void openPluginEditor(currentQuest.metadata.editor.file));
    content.append(action);
  }

  item.append(number, content);
  hintList.append(item);
  hintProgress.textContent = `${revealedHints} / ${hints.length}`;
  const label = revealHintButton.querySelector('span');
  if (revealedHints === hints.length) {
    revealHintButton.disabled = true;
    if (label) label.textContent = '已显示全部提示';
  } else if (label) {
    label.textContent = `显示第 ${revealedHints + 1} 条提示`;
  }
  refreshIcons(item);
}

function renderQuest(): void {
  const metadata = currentQuest.metadata;
  phaseLabel.textContent = `Phase B · Quest ${String(metadata.sequence).padStart(2, '0')}`;
  difficulty.textContent = `难度 ${metadata.difficulty} / 5`;
  difficulty.setAttribute('aria-label', `难度 ${metadata.difficulty} 星`);
  challengeHeading.textContent = metadata.title;
  missionBrief.textContent = metadata.description;
  targetUrl.textContent = metadata.target.url;
  completionCondition.textContent = metadata.objective.completion;
  editPluginLabel.textContent = metadata.editor.label;
  editorLocation.textContent = metadata.editor.location;
  runtimeTargetPath.textContent = metadata.target.url;
  searchQuery.textContent = metadata.searchQuery;
  successTitle.textContent = metadata.success.title;
  successMessage.textContent = metadata.success.message;
  document.title = `${metadata.title} | SEO Operator Lab`;
  questSelect.value = metadata.id;
  advancedActive.hidden = true;
  advancedMode = false;
  resetHints();
  renderIdleValidation();

  const url = new URL(window.location.href);
  url.searchParams.set('quest', metadata.id);
  window.history.replaceState({}, '', url);
}

async function boot(): Promise<void> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    setRuntimeControls(true);
    setRuntimeStatus(`正在准备「${currentQuest.metadata.title}」`, 'booting');
    setProgress('booting');
    setBootCover(true);
    renderIdleValidation();
    const { startPlaygroundWeb } = await import('@wp-playground/client');
    client = await startPlaygroundWeb({
      iframe,
      remoteUrl: 'https://playground.wordpress.net/remote.html',
      blueprint: currentQuest.blueprint,
    });
    setRuntimeControls(false);
    setBootCover(false);
    setProgress('ready');
    setRuntimeStatus(`${currentQuest.metadata.title}环境已就绪`, 'ready');
  })();

  try {
    await bootPromise;
  } catch (error) {
    bootPromise = undefined;
    setRuntimeControls(true);
    setRuntimeStatus('环境启动失败', 'error');
    setBootCover(true, '环境启动失败', error instanceof Error ? error.message : String(error), 'error');
    throw error;
  }
}

async function runValidation(): Promise<void> {
  if (!client) return;
  validateButton.disabled = true;
  validateButton.classList.add('is-loading');
  const buttonLabel = validateButton.querySelector('span');
  if (buttonLabel) buttonLabel.textContent = '验证中';
  setRuntimeStatus('正在运行目标与回归检查', 'validating');
  try {
    const result = await currentQuest.validate(client);
    renderValidation(result);
    setProgress(result.passed ? 'passed' : 'failed');
    setRuntimeStatus(
      result.passed
        ? '验证通过；实现复盘已生成'
        : result.targetPassed
          ? '目标已修复，但回归检查失败'
          : '验证未通过，请根据证据继续定位',
      'ready',
    );
  } catch (error) {
    setRuntimeStatus(`验证失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  } finally {
    validateButton.disabled = false;
    validateButton.classList.remove('is-loading');
    if (buttonLabel) buttonLabel.textContent = '再次验证';
  }
}

function scrollRuntimeIntoView(): void {
  if (window.matchMedia('(max-width: 900px)').matches) {
    runtimePane.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function pluginEditorUrl(file: string): string {
  const params = new URLSearchParams({ file, plugin: file });
  return `/wp-admin/plugin-editor.php?${params.toString()}`;
}

async function openPluginEditor(file: string): Promise<void> {
  if (!client) return;
  try {
    await client.goTo(pluginEditorUrl(file));
    setRuntimeStatus('已打开插件文件，修改后返回验证', 'ready');
    scrollRuntimeIntoView();
  } catch (error) {
    setRuntimeStatus(`无法打开插件编辑器：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

async function viewTarget(): Promise<void> {
  if (!client) return;
  try {
    await client.goTo(currentQuest.metadata.target.url);
    setRuntimeStatus('正在查看目标页面', 'ready');
    scrollRuntimeIntoView();
  } catch (error) {
    setRuntimeStatus(`无法打开目标页面：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function requestRebuild(request: RebuildRequest): void {
  pendingRebuild = request;
  resetDialog.returnValue = '';
  if (request.kind === 'switch') {
    rebuildDialogTitle.textContent = `切换到「${request.quest.metadata.title}」？`;
    rebuildDialogDescription.textContent = '当前 Playground 的所有修改会被丢弃，并按新 Quest 的 Blueprint 重建。';
    confirmResetButton.textContent = '确认切换';
  } else if (request.kind === 'advanced') {
    rebuildDialogTitle.textContent = '开始生产级改进？';
    rebuildDialogDescription.textContent = '当前实验修复会被重置。新环境就绪后将自动打开站点自有的 Site Overrides 插件。';
    confirmResetButton.textContent = '重置并继续';
  } else {
    rebuildDialogTitle.textContent = '重置当前环境？';
    rebuildDialogDescription.textContent = '所有运行时修改会被丢弃，Blueprint 会重新创建这道 Quest 的初始故障。';
    confirmResetButton.textContent = '确认重置';
  }
  resetDialog.showModal();
}

function showAdvancedMode(): void {
  const advanced = currentQuest.metadata.postPassReview.advancedChallenge;
  if (!advanced) return;
  advancedMode = true;
  advancedActive.hidden = false;
  advancedActiveTitle.textContent = `${advanced.title}进行中`;
  advancedActiveDescription.textContent = advanced.description;
  renderAdvancedGuide(advanced, advancedActiveWhy, advancedActiveSteps, advancedActiveInstruction);
  refreshIcons(advancedActive);
}

async function rebuild(request: RebuildRequest): Promise<void> {
  resetButton.disabled = true;
  setRuntimeControls(true);
  successToast.dataset.visible = 'false';
  if (request.kind === 'switch') {
    currentQuest = request.quest;
    renderQuest();
  } else if (request.kind === 'advanced') {
    showAdvancedMode();
  } else {
    advancedMode = false;
    advancedActive.hidden = true;
  }
  setRuntimeStatus('正在重建 Quest 环境', 'resetting');
  setProgress('booting');
  setBootCover(true, '正在重置 WordPress', '所有运行时修改都会被丢弃');
  try {
    client = undefined;
    bootPromise = undefined;
    const nextIframe = iframe.cloneNode(false) as HTMLIFrameElement;
    iframe.replaceWith(nextIframe);
    iframe = nextIframe;
    await boot();
    if (request.kind === 'advanced') await openPluginEditor(request.editorFile);
  } catch {
    // boot() writes the actionable error to the status and cover.
  } finally {
    resetButton.disabled = false;
  }
}

for (const quest of quests) {
  const option = document.createElement('option');
  option.value = quest.metadata.id;
  option.textContent = `${String(quest.metadata.sequence).padStart(2, '0')} · ${quest.metadata.title}`;
  questSelect.append(option);
}

questSelect.addEventListener('change', () => {
  const nextQuest = getQuest(questSelect.value);
  if (nextQuest.metadata.id === currentQuest.metadata.id) return;
  requestRebuild({ kind: 'switch', quest: nextQuest });
});

resetDialog.addEventListener('close', () => {
  if (resetDialog.returnValue !== 'confirm') questSelect.value = currentQuest.metadata.id;
  pendingRebuild = undefined;
});

confirmResetButton.addEventListener('click', () => {
  const request = pendingRebuild;
  if (!request) return;
  pendingRebuild = undefined;
  resetDialog.close('confirm');
  void rebuild(request);
});

validateButton.addEventListener('click', () => void runValidation());
editPluginButton.addEventListener('click', () => void openPluginEditor(currentQuest.metadata.editor.file));
viewTargetButton.addEventListener('click', () => void viewTarget());
resetButton.addEventListener('click', () => requestRebuild({ kind: 'reset' }));
successResetButton.addEventListener('click', () => requestRebuild({ kind: 'reset' }));
dismissSuccessButton.addEventListener('click', () => {
  successToast.dataset.visible = 'false';
});
startAdvancedButton.addEventListener('click', () => {
  const advanced = currentQuest.metadata.postPassReview.advancedChallenge;
  if (advanced) requestRebuild({ kind: 'advanced', editorFile: advanced.editorFile });
});
revealHintButton.addEventListener('click', addNextHint);

copyQueryButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(searchQuery.textContent ?? '');
    researchClue.dataset.copied = 'true';
    copyQueryButton.setAttribute('aria-label', '已复制检索线索');
    window.setTimeout(() => {
      delete researchClue.dataset.copied;
      copyQueryButton.setAttribute('aria-label', '复制检索线索');
    }, 1800);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(searchQuery);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }
});

async function copyAdvancedInstruction(button: HTMLButtonElement, instruction: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(instruction);
    button.dataset.copied = 'true';
    button.setAttribute('aria-label', '已复制生产级修复代码');
    button.title = '已复制';
    window.setTimeout(() => {
      delete button.dataset.copied;
      button.setAttribute('aria-label', '复制生产级修复代码');
      button.title = '复制修复代码';
    }, 1800);
  } catch {
    const range = document.createRange();
    const source = button.parentElement?.querySelector('code');
    if (!source) return;
    range.selectNodeContents(source);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }
}

copyAdvancedInstructionButton.addEventListener('click', () => {
  void copyAdvancedInstruction(copyAdvancedInstructionButton, advancedInstruction.textContent ?? '');
});
copyAdvancedActiveInstructionButton.addEventListener('click', () => {
  void copyAdvancedInstruction(copyAdvancedActiveInstructionButton, advancedActiveInstruction.textContent ?? '');
});

renderQuest();
refreshIcons();
void boot();
