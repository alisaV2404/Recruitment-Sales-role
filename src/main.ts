import * as app from './app.js';
import { state } from './app.js';
import { h, morph } from './dom.js';
import { modal, toastView, topbar } from './views/common.js';
import { sourceView } from './views/source.js';
import { startView } from './views/start.js';
import { summaryView } from './views/summary.js';
import { workspaceView } from './views/workspace.js';

const root = document.getElementById('app')!;

function view() {
  const s = state.session;
  let screen = state.ui.screen;
  if (!s) screen = 'start';
  else if ((screen === 'workspace' || screen === 'summary') && !s.analysis) screen = 'source';
  const body = screen === 'start' ? startView() : screen === 'source' ? sourceView() : screen === 'workspace' ? workspaceView() : summaryView();
  return h('div', { id: 'app', class: `screen-${screen}` }, topbar(), body, modal(), toastView());
}

function afterRender() {
  const target = state.ui.scrollTo;
  if (target) {
    state.ui.scrollTo = null;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-hl="${target.qid}-${target.idx}"]`) ?? document.querySelector<HTMLElement>(`[data-hl^="${target.qid}-"]`);
      if (el && el.offsetParent !== null) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      }
      const card = document.getElementById(`card-${target.qid}`);
      if (card && window.matchMedia('(min-width: 1000px)').matches) {
        const r = card.getBoundingClientRect();
        if (r.top < 0 || r.top > window.innerHeight * 0.6) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}

let scheduled = false;
function render() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const next = view();
    morph(root, next);
    afterRender();
  });
}

app.setRenderer(render);
window.addEventListener('beforeunload', (e) => {
  if (app.hasUnsavedWork()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.ui.confirm) app.closeConfirm(false);
});
void app.init();
