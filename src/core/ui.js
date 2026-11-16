// Small DOM helpers shared by all Kelar apps.
// User data must only ever reach the DOM as text nodes (never innerHTML).

import { icon } from './icons.js';

/**
 * Create an element.
 * props: `class`, `dataset`, `on<Event>` handlers, boolean attributes, other attributes.
 * children: Nodes, strings/numbers (inserted as text), arrays, or null/false (skipped).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  appendChildren(el, children);
  return el;
}

export function appendChildren(el, children) {
  for (const child of [children].flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Replace all children of `el`. */
export function mount(el, ...children) {
  el.replaceChildren();
  return appendChildren(el, children);
}

let toastHost;

/** Show a short message at the bottom of the screen. */
export function toast(message, { action, onAction, duration = 3500 } = {}) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const item = h(
    'div',
    { class: 'toast' },
    h('span', {}, message),
    action &&
      h('button', { type: 'button', class: 'toast-action', onClick: () => { onAction?.(); item.remove(); } }, action),
  );
  toastHost.append(item);
  if (duration > 0) setTimeout(() => item.remove(), duration);
  return item;
}

// ---------- Stepper ----------

/**
 * Number input with − / + buttons (44px). `onChange(value)` runs inside the tap.
 * @returns {HTMLElement}
 */
export function stepper({ id, label, value, min, max, unit = '', onChange, write = true }) {
  let current = value;
  const output = h('output', { id, class: 'stepper__value', 'aria-live': 'polite' }, `${current}${unit ? ` ${unit}` : ''}`);
  const dec = h('button', { type: 'button', class: 'stepper__btn', 'aria-label': `Kurangi ${label.toLowerCase()}` }, '−');
  const inc = h('button', { type: 'button', class: 'stepper__btn', 'aria-label': `Tambah ${label.toLowerCase()}` }, '+');
  if (write) {
    dec.dataset.write = '';
    inc.dataset.write = '';
  }
  const refresh = () => {
    output.textContent = `${current}${unit ? ` ${unit}` : ''}`;
    dec.setAttribute('aria-disabled', String(current <= min));
    inc.setAttribute('aria-disabled', String(current >= max));
  };
  const step = (delta) => {
    const next = Math.min(max, Math.max(min, current + delta));
    if (next === current) return;
    current = next;
    refresh();
    onChange?.(current);
  };
  dec.addEventListener('click', () => step(-1));
  inc.addEventListener('click', () => step(1));
  refresh();
  return h(
    'div',
    { class: 'stepper', role: 'group', 'aria-labelledby': `${id}-label` },
    h('span', { id: `${id}-label`, class: 'stepper__label' }, label),
    h('div', { class: 'stepper__controls' }, dec, output, inc),
  );
}

// ---------- Dialogs ----------
// Built on <dialog>.showModal(): the browser handles the focus trap, Esc to close
// and returning focus to the button that opened it.

let dialogCount = 0;

function openDialog(className, title, body, { onClose } = {}) {
  const titleId = `dialog-title-${++dialogCount}`;
  const dialog = h('dialog', { class: className, 'aria-labelledby': titleId });
  const close = () => {
    if (dialog.open) dialog.close();
  };
  const panel = h(
    'div',
    { class: `${className}__panel` },
    h(
      'div',
      { class: `${className}__head` },
      h('h2', { id: titleId }, title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tutup', onClick: close }, icon('close', { size: 22 })),
    ),
    typeof body === 'function' ? body(close) : body,
  );
  dialog.append(panel);
  // A click on the backdrop lands on the <dialog> itself (the panel fills it).
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { close, dialog };
}

/**
 * Bottom sheet. `body` is a node/array or `(close) => nodes`.
 * @returns {{ close: () => void }}
 */
export function openSheet({ title, body, onClose }) {
  return openDialog('sheet', title, body, { onClose });
}

/**
 * Confirmation modal. `onConfirm` runs synchronously inside the confirm tap, so it
 * may open the Google login popup.
 */
export function confirmDialog({ title, message, confirmLabel = 'Ya', cancelLabel = 'Batal', danger = false, onConfirm }) {
  return openDialog('modal', title, (close) => [
    h('p', { class: 'modal__message' }, message),
    h(
      'div',
      { class: 'modal__actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', autofocus: true, onClick: close }, cancelLabel),
      h(
        'button',
        {
          type: 'button',
          class: danger ? 'btn btn-danger' : 'btn btn-primary',
          onClick: () => {
            close();
            onConfirm?.();
          },
        },
        confirmLabel,
      ),
    ),
  ]);
}
