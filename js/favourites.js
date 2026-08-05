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

export function updateFavourite(list, id, updates) {
  const next = list.map((f) => (f.id === id ? { ...f, ...updates } : f));
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

// Replaces a favourite row's display button with an inline edit form
// covering both the name and the target height + unit. Built via DOM APIs
// (not template-string HTML) so arbitrary favourite names can never break
// out of an attribute value.
function startEdit(li, fav, onSave) {
  const selectBtn = li.querySelector('.favourite-select');

  const form = document.createElement('form');
  form.className = 'favourite-edit-form';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'favourite-rename-input';
  nameInput.value = fav.name;

  const heightRow = document.createElement('div');
  heightRow.className = 'favourite-edit-height-row';

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.className = 'favourite-height-input';
  heightInput.min = '0';
  heightInput.step = '10';
  heightInput.value = fav.heightValue;

  const unitBtn = document.createElement('button');
  unitBtn.type = 'button';
  unitBtn.className = 'favourite-unit-toggle';
  unitBtn.textContent = fav.heightUnit;

  heightRow.append(heightInput, unitBtn);
  form.append(nameInput, heightRow);
  selectBtn.replaceWith(form);

  let unit = fav.heightUnit;
  unitBtn.addEventListener('click', () => {
    unit = unit === 'ft' ? 'm' : 'ft';
    unitBtn.textContent = unit;
  });

  nameInput.focus();
  nameInput.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const name = nameInput.value.trim() || fav.name;
    const heightValue = parseFloat(heightInput.value);
    onSave(name, Number.isFinite(heightValue) ? heightValue : fav.heightValue, unit);
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    commit();
  });

  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Revert the fields, then commit — nets out to a no-op save.
      nameInput.value = fav.name;
      heightInput.value = fav.heightValue;
      unit = fav.heightUnit;
      unitBtn.textContent = unit;
      commit();
    }
  });

  // Clicking away from the whole form commits (not just leaving one field —
  // moving focus between the name/height/unit inputs shouldn't count).
  form.addEventListener('focusout', (e) => {
    if (form.contains(e.relatedTarget)) return;
    commit();
  });
}

export function renderFavourites(container, list, { onSelect, onEdit, onRemove, activeId = null }) {
  if (list.length === 0) {
    container.innerHTML = '<li class="favourites-empty">No favourites yet.</li>';
    return;
  }

  container.innerHTML = list
    .map(
      (fav) => `
    <li class="favourite-item${fav.id === activeId ? ' is-active' : ''}" data-id="${fav.id}">
      <button type="button" class="favourite-select" data-action="select">
        <span class="favourite-name">${escapeHtml(fav.name)}</span>
        <span class="favourite-meta">${fav.heightValue}${fav.heightUnit}</span>
      </button>
      <button type="button" class="favourite-icon-btn" data-action="edit" aria-label="Edit favourite" title="Edit">&#9998;</button>
      <button type="button" class="favourite-icon-btn" data-action="remove" aria-label="Remove favourite" title="Remove">&times;</button>
    </li>`
    )
    .join('');

  container.querySelectorAll('.favourite-item').forEach((li) => {
    const id = li.dataset.id;
    const fav = list.find((f) => f.id === id);

    li.querySelector('[data-action="select"]').addEventListener('click', () => onSelect(id));
    li.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      startEdit(li, fav, (name, heightValue, heightUnit) => onEdit(id, { name, heightValue, heightUnit }));
    });
    li.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove(id);
    });
  });
}
