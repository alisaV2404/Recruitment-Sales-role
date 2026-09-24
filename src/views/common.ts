import { KIND_LABELS, QuestionKind } from '../../shared/types.js';
import * as app from '../app.js';
import { state } from '../app.js';
import { h } from '../dom.js';
import { QStatus, STATUS_LABELS } from '../model.js';

export function modePill() {
  const st = state.status;
  if (!st) return h('span', { class: 'pill pill-muted' }, 'Checking AI…');
  if (st.live) {
    return h('span', { class: 'pill pill-live', title: `Provider: ${st.provider}` }, h('span', { class: 'dot' }), `Live AI · ${st.model}`);
  }
  return h('span', { class: 'pill pill-demo', title: st.reason ?? '' }, h('span', { class: 'dot' }), 'Demo mode · Preloaded analysis');
}

export function topbar() {
  const s = state.session;
  const screen = state.ui.screen;
  const tab = (label: string, target: app.Screen, enabled: boolean) =>
    h(
      'button',
      {
        class: `nav-tab${screen === target ? ' active' : ''}`,
        disabled: !enabled,
        'aria-current': screen === target ? 'page' : undefined,
        onclick: () => app.go(target),
      },
      label,
    );
  return h(
    'header',
    { class: 'topbar no-print' },
    h(
      'button',
      { class: 'brand', onclick: () => app.go('start'), title: 'Start a new review' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'SL'),
      h('span', { class: 'brand-text' }, h('strong', null, 'Second Look'), h('small', null, 'AI-powered appraisal review')),
    ),
    s
      ? h(
          'nav',
          { class: 'nav', 'aria-label': 'Review steps' },
          tab('1 · Source', 'source', true),
          tab('2 · Questions', 'workspace', !!s.analysis),
          tab('3 · Summary', 'summary', !!s.analysis),
        )
      : h('span', { class: 'nav-spacer' }),
    modePill(),
  );
}

export function kindBadge(kind: QuestionKind) {
  return h('span', { class: `badge kind-${kind}` }, KIND_LABELS[kind]);
}

export function statusBadge(status: QStatus) {
  return h('span', { class: `status status-${status}` }, STATUS_LABELS[status]);
}

export function modal() {
  const d = state.ui.confirm;
  if (!d) return null;
  return h(
    'div',
    { class: 'modal-backdrop', onclick: (e: Event) => e.target === e.currentTarget && app.closeConfirm(false) },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      h('h2', { id: 'modal-title' }, d.title),
      h('p', null, d.message),
      h(
        'div',
        { class: 'row end' },
        h('button', { class: 'btn', onclick: () => app.closeConfirm(false) }, 'Cancel'),
        h('button', { class: `btn ${d.danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => app.closeConfirm(true), autofocus: true }, d.confirmLabel),
      ),
    ),
  );
}

export function toastView() {
  return state.ui.toast ? h('div', { class: 'toast', role: 'status' }, state.ui.toast) : null;
}

export function errorBox(err: { message: string; retryable: boolean; code: string }, retry?: () => void) {
  return h(
    'div',
    { class: 'error-box', role: 'alert' },
    h('strong', null, 'The request failed. '),
    err.message,
    err.code === 'not_configured' ? h('p', { class: 'small' }, 'Live AI needs a model key on the server; see README.') : null,
    retry && err.retryable ? h('div', null, h('button', { class: 'btn btn-small', onclick: retry }, 'Try again')) : null,
    retry && !err.retryable ? h('div', null, h('button', { class: 'btn btn-small', onclick: retry }, 'Retry anyway')) : null,
  );
}

export function draftInput(key: string, props: Record<string, unknown> = {}, textarea = false) {
  return h(textarea ? 'textarea' : 'input', {
    ...props,
    value: app.drafts.get(key) ?? '',
    oninput: (e: Event) => app.drafts.set(key, (e.target as HTMLInputElement).value),
  });
}
