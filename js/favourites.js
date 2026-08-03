// Bookmarked location + target-height pairs, persisted to localStorage.
// A "favourite" is: { id, name, lat, lon, heightValue, heightUnit }.

const STORAGE_KEY = 'moonshot.favourites';

export function loadFavourites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFavourites(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable (private browsing, quota, etc.) — favourites just won't persist.
  }
}

export function addFavourite(list, fav) {
  const next = [...list, { id: crypto.randomUUID(), ...fav }];
  saveFavourites(next);
  return next;
}

export function renameFavourite(list, id, name) {
  const next = list.map((f) => (f.id === id ? { ...f, name } : f));
  saveFavourites(next);
  return next;
}

export function removeFavourite(list, id) {
  const next = list.filter((f) => f.id !== id);
  saveFavourites(next);
  return next;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function startRename(li, id, currentName, onRename) {
  const nameEl = li.querySelector('.favourite-name');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'favourite-rename-input';
  input.value = currentName;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const value = input.value.trim() || currentName;
    onRename(id, value);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      committed = true; // discard — re-render will restore the original name
      input.blur();
      onRename(id, currentName);
    }
  });
  input.addEventListener('blur', commit);
}

export function renderFavourites(container, list, { onSelect, onRename, onRemove }) {
  if (list.length === 0) {
    container.innerHTML = '<li class="favourites-empty">No favourites yet.</li>';
    return;
  }

  container.innerHTML = list
    .map(
      (fav) => `
    <li class="favourite-item" data-id="${fav.id}">
      <button type="button" class="favourite-select" data-action="select">
        <span class="favourite-name">${escapeHtml(fav.name)}</span>
        <span class="favourite-meta">${fav.heightValue}${fav.heightUnit}</span>
      </button>
      <button type="button" class="favourite-icon-btn" data-action="rename" aria-label="Rename favourite" title="Rename">&#9998;</button>
      <button type="button" class="favourite-icon-btn" data-action="remove" aria-label="Remove favourite" title="Remove">&times;</button>
    </li>`
    )
    .join('');

  container.querySelectorAll('.favourite-item').forEach((li) => {
    const id = li.dataset.id;
    const fav = list.find((f) => f.id === id);

    li.querySelector('[data-action="select"]').addEventListener('click', () => onSelect(id));
    li.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(li, id, fav.name, onRename);
    });
    li.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove(id);
    });
  });
}
