// Tiny shared DOM helpers used by more than one module.

// Calls `handler` on any click that lands outside `containerEl` (and
// outside `triggerEl`, if given — e.g. a toggle button that sits outside
// containerEl in the DOM, so a click on it doesn't count as "outside").
export function onOutsideClick(containerEl, handler, { triggerEl } = {}) {
  document.addEventListener('click', (e) => {
    if (containerEl.contains(e.target)) return;
    if (triggerEl && e.target === triggerEl) return;
    handler(e);
  });
}
