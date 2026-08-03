// Small self-contained month/year-navigable calendar popover. Day cells use
// local-time Date construction throughout (never ISO-string parsing) to avoid
// timezone off-by-one bugs.

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function createDatePicker({ buttonEl, popoverEl, labelEl, daysEl, weekdaysEl, initialDate, onSelect }) {
  let viewYear, viewMonth;
  let selectedDate = initialDate ? new Date(initialDate) : null;

  function setView(date) {
    viewYear = date.getFullYear();
    viewMonth = date.getMonth();
  }
  setView(selectedDate || new Date());

  weekdaysEl.innerHTML = WEEKDAY_LABELS.map((d) => `<span>${d}</span>`).join('');

  function render() {
    labelEl.textContent = `${MONTH_LABELS[viewMonth]} ${viewYear}`;

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    const today = new Date();

    const cells = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ year: viewMonth === 0 ? viewYear - 1 : viewYear, month: (viewMonth + 11) % 12, day: daysInPrevMonth - i, muted: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ year: viewYear, month: viewMonth, day: d, muted: false });
    }
    while (cells.length % 7 !== 0 || cells.length < 42) {
      const last = cells[cells.length - 1];
      const next = new Date(last.year, last.month, last.day + 1);
      cells.push({ year: next.getFullYear(), month: next.getMonth(), day: next.getDate(), muted: true });
    }

    daysEl.innerHTML = cells
      .map((c) => {
        const cellDate = new Date(c.year, c.month, c.day);
        const classes = ['date-picker-day'];
        if (c.muted) classes.push('date-picker-day--muted');
        if (isSameDay(cellDate, today)) classes.push('date-picker-day--today');
        if (selectedDate && isSameDay(cellDate, selectedDate)) classes.push('date-picker-day--selected');
        return `<button type="button" class="${classes.join(' ')}" data-year="${c.year}" data-month="${c.month}" data-day="${c.day}">${c.day}</button>`;
      })
      .join('');
  }

  function open() {
    render();
    popoverEl.hidden = false;
  }
  function close() {
    popoverEl.hidden = true;
  }
  function toggle() {
    if (popoverEl.hidden) open();
    else close();
  }

  buttonEl.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  popoverEl.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      if (nav.dataset.nav === 'prev-month') viewMonth -= 1;
      if (nav.dataset.nav === 'next-month') viewMonth += 1;
      if (nav.dataset.nav === 'prev-year') viewYear -= 1;
      if (nav.dataset.nav === 'next-year') viewYear += 1;
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      render();
      return;
    }

    const day = e.target.closest('.date-picker-day');
    if (day) {
      selectedDate = new Date(Number(day.dataset.year), Number(day.dataset.month), Number(day.dataset.day));
      close();
      onSelect(selectedDate);
    }
  });

  document.addEventListener('click', (e) => {
    if (!popoverEl.hidden && !popoverEl.contains(e.target) && e.target !== buttonEl) close();
  });

  return {
    setSelected(date) {
      selectedDate = date ? new Date(date) : null;
      setView(selectedDate || new Date());
    },
  };
}
