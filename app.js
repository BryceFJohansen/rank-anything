(() => {
  'use strict';
  const E = window.RankingEngine;
  const KEY = 'rank-anything-v1';
  const root = document.getElementById('app');
  const pendingItemInputs = new Map();
  const openDialogs = [];
  let pendingFocus = null;
  let state = { version: 1, collections: [] },
    selected = null,
    tab = 'Rank',
    draft = null,
    storageWarning = '',
    toastTimer,
    lastGood = JSON.stringify(state),
    unreadableSave = null,
    historyPage = 0,
    savedRound = null;
  const uid = () =>
    'id_' +
    (window.crypto?.randomUUID?.() ||
      Date.now().toString(36) + Math.random().toString(36).slice(2));
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'disabled') n.disabled = v;
      else n.setAttribute(k, v);
    }
    for (const c of children.flat(Infinity))
      if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  };
  const btn = (text, action, cls = '', attrs = {}) =>
    el('button', { type: 'button', class: cls, onClick: action, ...attrs }, text);
  const collection = () => state.collections.find((c) => c.id === selected);
  const name = (id) => collection()?.items.find((i) => i.id === id)?.name || 'Removed item';
  const countRanked = () => draft?.groups.flat().length || 0;
  function focusContent(ids) {
    pendingFocus = [ids].flat().filter(Boolean);
    // The page is inert until the last modal closes.
    if (openDialogs.length) return;
    const targets = pendingFocus;
    pendingFocus = null;
    for (const id of [...targets, 'view-heading']) {
      const target = document.getElementById(id);
      if (target && !target.disabled) {
        target.focus();
        return;
      }
    }
  }
  function showDialog(d) {
    // A replacement dialog inherits the original page control as its return target.
    const opener = openDialogs.at(-1)?.opener || document.activeElement;
    const entry = { opener };
    const close = () => {
      const focused = document.activeElement;
      d.close();
      d.remove();
      openDialogs.splice(openDialogs.indexOf(entry), 1);
      if (openDialogs.length) {
        // Closing an earlier prompt must not take focus from its replacement.
        if (focused?.isConnected) focused.focus();
      } else if (pendingFocus) focusContent(pendingFocus);
      else if (opener?.isConnected) opener.focus();
      else focusContent(opener?.id);
    };
    d.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    openDialogs.push(entry);
    document.body.append(d);
    d.showModal();
    return close;
  }
  function notify(text) {
    document.querySelector('.toast')?.remove();
    clearTimeout(toastTimer);
    root.append(el('div', { class: 'toast', role: 'status' }, text));
    toastTimer = setTimeout(() => document.querySelector('.toast')?.remove(), 5500);
  }
  function persist() {
    try {
      state = E.validateBackup(state);
      lastGood = JSON.stringify(state);
    } catch (err) {
      state = JSON.parse(lastGood);
      if (!collection()) selected = state.collections[0]?.id || null;
      setTimeout(() => notify('Change not saved: ' + err.message), 0);
      return false;
    }
    if (unreadableSave !== null) {
      storageWarning =
        'An unreadable previous save is being preserved. Export this session before closing, or download the previous save and replace it below.';
      return true;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageWarning = '';
    } catch {
      storageWarning =
        'This browser cannot save these changes locally. Keep this tab open and export a backup before closing it.';
    }
    return true;
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      unreadableSave = saved;
      state = E.validateBackup(JSON.parse(saved));
      unreadableSave = null;
    }
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    storageWarning =
      'Local storage is unavailable or a saved file could not be read. Your session still works. Export a backup before closing; importing a valid backup can restore your data.';
  }
  lastGood = JSON.stringify(state);
  selected = state.collections[0]?.id || null;
  function dialog(
    title,
    body,
    onConfirm,
    { label = 'Continue', inputValue = null, danger = false } = {},
  ) {
    const d = el('dialog', { class: 'modal', 'aria-label': title });
    const error = el('p', {
      id: 'dialog-error-' + uid(),
      class: 'notice warning dialog-error',
      role: 'alert',
    });
    d.append(el('h2', {}, title), el('p', {}, body));
    let field;
    if (inputValue !== null) {
      field = el('input', {
        value: inputValue,
        maxlength: '200',
        'aria-label': title,
        'aria-describedby': error.id,
        'aria-invalid': 'false',
        onInput: () => {
          error.textContent = '';
          field.setAttribute('aria-invalid', 'false');
        },
      });
      d.append(field);
    }
    d.append(error);
    const showError = (message) => {
      error.textContent = message;
      field?.setAttribute('aria-invalid', 'true');
      field?.focus();
      return false;
    };
    const ok = () => {
      const value = field?.value.trim();
      if (field && !value) {
        showError('Please enter a name.');
        return;
      }
      if (onConfirm(value, showError) !== false) close();
    };
    d.append(
      el(
        'div',
        { class: 'actions' },
        btn('Cancel', () => close()),
        btn(label, ok, danger ? 'danger' : 'primary'),
      ),
    );
    if (field)
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          ok();
        }
      });
    const close = showDialog(d);
    if (field) {
      field.focus();
      field.select();
    }
  }
  function confirmLeaveDraft(action) {
    if (draft)
      dialog(
        'Leave this ballot?',
        'Your unsubmitted order will be discarded. Saved ballots are safe.',
        action,
        { label: 'Leave ballot' },
      );
    else action();
  }
  function newCollection() {
    confirmLeaveDraft(() =>
      dialog(
        'A place for your preferences',
        'What would you like to rank? Books, games, albums, weekend plans…',
        (value, showError) => {
          if (state.collections.length >= 100) {
            return showError('Maximum 100 collections. Export and remove one first.');
          }
          const c = { id: uid(), name: value, items: [], ballots: [] };
          const candidate = { ...state, collections: [...state.collections, c] };
          try {
            E.validateBackup(candidate);
          } catch (err) {
            return showError('Collection not created: ' + err.message);
          }
          state = candidate;
          selected = c.id;
          draft = null;
          savedRound = null;
          tab = 'Items';
          persist();
          render('bulk-items');
        },
        { label: 'Create collection', inputValue: '' },
      ),
    );
  }
  function switchCollection(id) {
    const go = () => {
      selected = id;
      draft = null;
      savedRound = null;
      tab = 'Rank';
      render('view-heading');
    };
    confirmLeaveDraft(go);
  }
  function demo() {
    const names = [
      'A quiet bookshop',
      'A long coastal walk',
      'A new coffee spot',
      'A museum afternoon',
      'A live music night',
      'Cooking with friends',
      'A lazy movie night',
      'A trail in the woods',
      'A weekend market',
      'A picnic in the park',
      'An evening board game',
      'An early morning swim',
    ];
    const c = {
      id: uid(),
      name: 'Weekend possibilities · demo',
      items: names.map((name) => ({ id: uid(), name })),
      ballots: [],
    };
    if (state.collections.length >= 100) {
      notify('Maximum 100 collections.');
      return;
    }
    state.collections.push(c);
    selected = c.id;
    draft = null;
    savedRound = null;
    tab = 'Rank';
    persist();
    render('view-heading');
    notify('Demo items added. No preferences have been assumed.');
  }
  function download(data, filename, type = 'application/json') {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function exportBackup() {
    download(
      JSON.stringify(state, null, 2),
      'rank-anything-backup-' + new Date().toISOString().slice(0, 10) + '.json',
    );
    notify('Backup download requested. Keep it somewhere safe.');
  }
  async function importBackup(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 100000000) {
      notify('That file is too large. Maximum backup size is 100 MB.');
      return;
    }
    try {
      const data = E.validateBackup(JSON.parse(await file.text()));
      if (!data.collections.length) throw new Error('This backup has no collections.');
      const merged = {
        version: 1,
        collections: [
          ...state.collections,
          ...data.collections.map((c) => ({ ...c, id: uid(), name: c.name })),
        ],
      };
      E.validateBackup(merged);
      dialog(
        'Import ' +
          data.collections.length +
          ' collection' +
          (data.collections.length === 1 ? '' : 's') +
          '?',
        'These will be added as separate collections. Existing items and ballots will stay as they are. Unsubmitted ballot progress will be discarded.',
        () => {
          state = merged;
          selected = state.collections.at(-data.collections.length).id;
          draft = null;
          savedRound = null;
          tab = 'Results';
          persist();
          render('view-heading');
          notify('Backup imported. Existing collections preserved.');
        },
        { label: 'Import collections' },
      );
    } catch (err) {
      notify('Import stopped: ' + err.message);
    }
  }
  function startBallot() {
    const source = { ...collection(), items: [...collection().items] };
    for (let i = source.items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [source.items[i], source.items[j]] = [source.items[j], source.items[i]];
    }
    const ids = E.chooseBatch(source, E.LIMITS.batchSize);
    // Randomize presentation so engine tie-breaks do not imply a preference.
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    if (draft) return;
    savedRound = null;
    tab = 'Rank';
    draft = { groups: ids.map((id) => [id]), skipped: [] };
    render('ballot-heading');
  }
  function chooseItems() {
    const d = el('dialog', { class: 'modal', 'aria-label': 'Choose ballot items' });
    const chosen = new Set();
    const meter = el('p', { class: 'muted' }, '0 of 5 selected');
    const start = btn(
      'Start chosen ballot',
      () => {
        if (chosen.size < 2 || chosen.size > E.LIMITS.batchSize) return;
        savedRound = null;
        draft = { groups: [...chosen].map((id) => [id]), skipped: [] };
        tab = 'Rank';
        render('ballot-heading');
        close();
      },
      'primary',
      { disabled: true },
    );
    const list = el('div', { style: 'max-height:45vh;overflow:auto' });
    for (const item of collection().items) {
      const checkbox = el('input', {
        type: 'checkbox',
        style: 'width:auto',
        onChange: (e) => {
          if (e.target.checked) {
            if (chosen.size === E.LIMITS.batchSize) {
              e.target.checked = false;
              return;
            }
            chosen.add(item.id);
          } else chosen.delete(item.id);
          meter.textContent = chosen.size + ' of 5 selected';
          start.disabled = chosen.size < 2;
        },
      });
      list.append(
        el(
          'label',
          { class: 'list-item', style: 'justify-content:flex-start;font-weight:400' },
          checkbox,
          el('span', {}, item.name),
        ),
      );
    }
    d.append(
      el('h2', {}, 'Choose familiar items'),
      el(
        'p',
        {},
        'Select 2–5 items to compare. This replaces any unsubmitted ballot. Starting order follows your selections; review it before saving.',
      ),
      meter,
      list,
      el(
        'div',
        { class: 'actions' },
        btn('Cancel', () => close()),
        start,
      ),
    );
    const close = showDialog(d);
  }
  function mutateDraft(fn, focusIds = []) {
    fn();
    render(focusIds);
  }
  function move(id, direction) {
    mutateDraft(() => {
      const index = draft.groups.findIndex((g) => g.includes(id));
      const group = draft.groups[index];
      if (group.length > 1) {
        group.splice(group.indexOf(id), 1);
        draft.groups.splice(direction < 0 ? index : index + 1, 0, [id]);
      } else {
        const next = index + direction;
        if (next >= 0 && next < draft.groups.length)
          [draft.groups[index], draft.groups[next]] = [draft.groups[next], draft.groups[index]];
      }
    }, [
      'move-' + (direction < 0 ? 'up-' : 'down-') + id,
      'move-' + (direction < 0 ? 'down-' : 'up-') + id,
      'skip-' + id,
    ]);
  }
  function tie(id) {
    mutateDraft(() => {
      const i = draft.groups.findIndex((g) => g.includes(id));
      if (i > 0) {
        draft.groups[i].splice(draft.groups[i].indexOf(id), 1);
        draft.groups[i - 1].push(id);
        if (!draft.groups[i].length) draft.groups.splice(i, 1);
      }
    }, 'skip-' + id);
  }
  function skip(id) {
    mutateDraft(() => {
      draft.groups = draft.groups.map((g) => g.filter((x) => x !== id)).filter((g) => g.length);
      draft.skipped.push(id);
    }, 'restore-' + id);
  }
  function submit() {
    if (!draft) return;
    if (countRanked() + draft.skipped.length > E.LIMITS.batchSize) {
      notify('A new ballot can include at most five items.');
      return;
    }
    if (countRanked() < 2) {
      notify('Rank at least two familiar items to save a ballot.');
      return;
    }
    const c = collection();
    const ballot = {
      id: uid(),
      createdAt: new Date().toISOString(),
      groups: draft.groups.map((g) => [...g]),
      skipped: [...draft.skipped],
    };
    const candidate = {
      ...state,
      collections: state.collections.map((x) =>
        x.id === c.id ? { ...c, ballots: [...c.ballots, ballot] } : x,
      ),
    };
    try {
      E.validateBackup(candidate);
    } catch (err) {
      notify(err.message);
      return;
    }
    c.ballots.push(ballot);
    if (!persist()) return;
    draft = null;
    savedRound = { collectionId: c.id, ballotId: ballot.id };
    tab = 'Rank';
    render('next-round');
  }
  function rankView(c) {
    if (c.items.length < 2 && !draft)
      return el(
        'div',
        { class: 'panel empty' },
        el('div', { class: 'big-icon' }, '↗'),
        el('h2', {}, 'Start with a few things you love'),
        el(
          'p',
          { class: 'muted' },
          'Add at least two items. You can rank books, games, films, ideas, or anything else you want to compare.',
        ),
        btn(
          'Add your items',
          () => {
            tab = 'Items';
            render('bulk-items');
          },
          'primary',
          { id: 'add-your-items' },
        ),
      );
    if (
      !draft &&
      savedRound?.collectionId === c.id &&
      c.ballots.some((b) => b.id === savedRound.ballotId)
    )
      return el(
        'div',
        { class: 'panel empty' },
        el(
          'span',
          { class: 'badge', role: 'status' },
          storageWarning ? 'Ballot added to this session' : 'Ballot saved',
        ),
        el('h2', { style: 'margin-top:18px' }, 'Ready for another round?'),
        el(
          'p',
          { class: 'muted' },
          'A few different items, with familiar ones to connect your rankings. Each saved round adds to the same results.',
        ),
        el(
          'div',
          { class: 'actions', style: 'justify-content:center' },
          btn('Next round', startBallot, 'primary', { id: 'next-round' }),
          btn('View results', () => {
            tab = 'Results';
            render('tab-Results');
          }),
          btn('Choose items', chooseItems),
        ),
        el(
          'p',
          { class: 'muted', style: 'font-size:12px;margin-top:18px' },
          'Up to five at a time. Stop whenever you like; undo any round in History.',
        ),
      );
    if (!draft)
      return el(
        'div',
        {},
        el(
          'div',
          { class: 'stats' },
          stat(c.items.length, 'items to explore'),
          stat(c.ballots.length, 'saved ballots'),
          stat(Math.min(5, c.items.length), 'items per ballot'),
        ),
        el(
          'div',
          { class: 'panel empty' },
          el('div', { class: 'big-icon' }, '↑ ↓'),
          el('h2', {}, 'What rises to the top?'),
          el(
            'p',
            { class: 'muted' },
            'Put up to five items in your preferred order. Tie the ones you can’t separate, and skip anything you don’t know.',
          ),
          el(
            'div',
            { class: 'actions', style: 'justify-content:center' },
            btn('Start a ballot', startBallot, 'primary', { id: 'start-ballot' }),
            btn('Choose items', chooseItems),
          ),
          el(
            'p',
            { class: 'muted', style: 'font-size:12px;margin-top:18px' },
            'New pairs and less-compared items come first, with some overlap between rounds.',
          ),
        ),
      );
    const section = el(
      'div',
      {},
      el(
        'div',
        { class: 'row ballot-head wrap' },
        el(
          'div',
          {},
          el('h2', { id: 'ballot-heading', tabindex: '-1' }, 'Go with your preference'),
          el('p', { class: 'muted' }, 'Use the arrows to order items. First is most preferred.'),
        ),
        el(
          'div',
          { class: 'actions' },
          el(
            'span',
            { class: 'badge' },
            countRanked() + ' ranking · ' + draft.skipped.length + ' skipped',
          ),
          btn('Choose items', chooseItems, 'small'),
        ),
      ),
      el(
        'div',
        { class: 'notice' },
        'Starting order is not a preference. Review every item before saving. “Skip” means no comparison; it never counts as a loss.',
      ),
      el('div', { class: 'direction' }, 'Most preferred'),
    );
    draft.groups.forEach((group, index) => {
      const rows = group.map((id) =>
        el(
          'div',
          { class: 'rank-item' },
          el(
            'div',
            { class: 'item-name' },
            name(id),
            group.length > 1
              ? el('span', { class: 'badge', style: 'margin-left:8px' }, 'tied')
              : null,
          ),
          el(
            'div',
            { class: 'item-controls' },
            btn('↑', () => move(id, -1), 'icon', {
              id: 'move-up-' + id,
              disabled: index === 0 && group.length === 1,
              'aria-label': 'Move ' + name(id) + ' up',
              title: group.length > 1 ? 'Split into a higher rank' : 'Move up',
            }),
            btn('↓', () => move(id, 1), 'icon', {
              id: 'move-down-' + id,
              disabled: index === draft.groups.length - 1 && group.length === 1,
              'aria-label': 'Move ' + name(id) + ' down',
              title: group.length > 1 ? 'Split into a lower rank' : 'Move down',
            }),
            btn('Tie ↑', () => tie(id), 'small', {
              disabled: index === 0,
              'aria-label': 'Tie ' + name(id) + ' with the rank above',
            }),
            btn('Skip', () => skip(id), 'link', {
              id: 'skip-' + id,
              'aria-label': 'Skip ' + name(id) + ' — not familiar or not today',
            }),
          ),
        ),
      );
      section.append(
        el(
          'div',
          { class: 'rank-group' },
          el(
            'span',
            { class: 'rank-number', 'aria-label': 'Rank ' + (index + 1) },
            String(index + 1).padStart(2, '0'),
          ),
          el('div', { class: 'rank-items' }, rows),
        ),
      );
    });
    section.append(el('div', { class: 'direction' }, 'Least preferred among ranked items'));
    if (draft.skipped.length)
      section.append(
        el(
          'div',
          { class: 'skipped' },
          el('h3', {}, 'Sitting this one out'),
          draft.skipped.map((id) =>
            el(
              'div',
              { class: 'row' },
              el('span', {}, name(id)),
              btn(
                'Restore',
                () =>
                  mutateDraft(() => {
                    draft.skipped = draft.skipped.filter((x) => x !== id);
                    draft.groups.push([id]);
                  }, ['move-up-' + id, 'skip-' + id]),
                'small',
                { id: 'restore-' + id, 'aria-label': 'Restore ' + name(id) },
              ),
            ),
          ),
          el(
            'p',
            { class: 'muted', style: 'font-size:12px;margin-bottom:0' },
            'Skipped items have no effect on this ballot. Restored items start at the bottom; move them where they belong.',
          ),
        ),
      );
    if (countRanked() < 2)
      section.append(
        el(
          'div',
          { class: 'notice', role: 'status' },
          'At least two ranked items are needed to save this ballot. ' +
            (c.items.length < 2
              ? 'Add more items in Items, then use Choose items to start a new ballot.'
              : 'Restore skipped items or use Choose items to start a new ballot.'),
        ),
      );
    section.append(
      el(
        'div',
        { class: 'row wrap ballot-footer' },
        btn(
          'Discard ballot',
          () =>
            dialog(
              'Discard this ballot?',
              'Only this unsubmitted order will be lost.',
              () => {
                draft = null;
                savedRound = null;
                render(['start-ballot', 'add-your-items']);
              },
              { label: 'Discard' },
            ),
          'link',
        ),
        btn('Save ballot →', submit, 'primary', { disabled: countRanked() < 2 }),
      ),
    );
    return section;
  }
  const stat = (value, label) =>
    el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
  function resultsView(c) {
    const r = E.aggregate(c);
    const section = el(
      'div',
      {},
      el(
        'div',
        { class: 'row wrap' },
        el(
          'div',
          {},
          el('h2', {}, 'Your preference landscape'),
          el(
            'p',
            { class: 'muted', style: 'font-size:13px;margin-bottom:0' },
            'Built from your ballots, without numerical ratings.',
          ),
        ),
        btn(
          'Rank another batch',
          () => {
            tab = 'Rank';
            if (!draft) startBallot();
            else render('ballot-heading');
          },
          'primary',
          { disabled: c.items.length < 2 },
        ),
      ),
      el(
        'div',
        { class: 'stats' },
        stat(c.ballots.length, 'ballots contributing'),
        stat(r.observedPairs + ' / ' + r.possiblePairs, 'item pairs compared'),
        stat(r.uncompared.length, 'items still unranked'),
      ),
    );
    if (r.cycles)
      section.append(
        el(
          'div',
          { class: 'notice' },
          'A preference cycle is present (for example A over B, B over C, C over A). Strongest comparison paths resolve what they can; unresolved items remain grouped.',
        ),
      );
    if (r.observedPairs < r.possiblePairs && r.observedPairs)
      section.append(
        el(
          'div',
          { class: 'notice' },
          'Still a partial picture. Some pairs have never met. Results can change as you compare more items; shared tiers can reflect missing evidence, not an equal preference.',
        ),
      );
    if (!r.tiers.length)
      section.append(
        el(
          'div',
          { class: 'panel empty' },
          el('h2', {}, 'Your order is waiting to emerge'),
          el(
            'p',
            { class: 'muted' },
            'Save a ballot with at least two familiar items to see the first results.',
          ),
        ),
      );
    else {
      const panel = el('div', { class: 'panel' });
      r.tiers.forEach((tier, i) =>
        panel.append(
          el(
            'div',
            { class: 'result-tier' },
            el('div', { class: 'tier-number' }, String(i + 1).padStart(2, '0')),
            el(
              'div',
              { class: 'result-items' },
              tier.map((id) => el('div', { class: 'result-item' }, el('span', {}, name(id)))),
              tier.length > 1
                ? el(
                    'small',
                    { class: 'muted' },
                    'Unresolved within this tier · shown alphabetically',
                  )
                : null,
            ),
          ),
        ),
      );
      section.append(
        panel,
        el(
          'p',
          { class: 'muted', style: 'font-size:12px' },
          'Tiers summarize the Schulze strongest-path ordering. Shared tiers are unresolved by the available evidence, not a claim that every item is equally preferred.',
        ),
      );
    }
    if (r.uncompared.length)
      section.append(
        el(
          'div',
          { class: 'panel soft' },
          el('h3', {}, 'Not ranked yet'),
          el(
            'p',
            { class: 'muted', style: 'font-size:13px' },
            'These items have no comparisons. They have not been placed last.',
          ),
          el(
            'div',
            { class: 'actions' },
            r.uncompared.map((id) => el('span', { class: 'badge' }, name(id))),
          ),
        ),
      );
    if (r.observedPairs) {
      const tieCounts = new Map();
      const pairKey = (a, b) => JSON.stringify([a, b].sort());
      for (const ballot of c.ballots)
        for (const group of ballot.groups)
          for (let i = 0; i < group.length; i++)
            for (let j = i + 1; j < group.length; j++) {
              const key = pairKey(group[i], group[j]);
              tieCounts.set(key, (tieCounts.get(key) || 0) + 1);
            }
      const pairs = [];
      for (let i = 0; i < c.items.length; i++)
        for (let j = i + 1; j < c.items.length; j++) {
          const a = c.items[i],
            b = c.items[j],
            aw = r.pairwise[a.id]?.[b.id] || 0,
            bw = r.pairwise[b.id]?.[a.id] || 0;
          const ties = tieCounts.get(pairKey(a.id, b.id)) || 0;
          if (aw + bw + ties) pairs.push([a.name, b.name, aw, bw, ties]);
        }
      section.append(
        el(
          'details',
          { class: 'panel' },
          el('summary', {}, 'Inspect the pairwise evidence'),
          el(
            'p',
            { class: 'muted', style: 'font-size:12px' },
            'Counts of ballots favoring each item, plus explicit ties. Missing pairs are omitted; skipped items create no evidence. Showing the first 200 observed pairs in collection order; the JSON backup includes all ballots.',
          ),
          el(
            'div',
            { class: 'table-wrap' },
            el(
              'table',
              {},
              el(
                'thead',
                {},
                el(
                  'tr',
                  {},
                  ['Item A', 'Item B', 'A preferred', 'B preferred', 'Tied'].map((t) =>
                    el('th', { scope: 'col' }, t),
                  ),
                ),
              ),
              el(
                'tbody',
                {},
                pairs.slice(0, 200).map((row) =>
                  el(
                    'tr',
                    {},
                    row.map((cell) => el('td', {}, cell)),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }
    return section;
  }
  function itemsView(c) {
    const input = el('textarea', {
      id: 'bulk-items',
      placeholder: 'One item per line\nThe thing you already love\nThe thing you’re curious about',
      'aria-label': 'Items, one per line',
      onInput: (event) => {
        if (event.target.value) pendingItemInputs.set(c.id, event.target.value);
        else pendingItemInputs.delete(c.id);
      },
    });
    input.value = pendingItemInputs.get(c.id) || '';
    const add = () => {
      const values = input.value
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!values.length) {
        notify('Add one or more item names first.');
        return;
      }
      const seen = new Set(c.items.map((i) => E.nameKey(i.name)));
      let skipped = 0;
      const fresh = [];
      for (const value of values) {
        if (value.length > 200) {
          notify('Item names must be 200 characters or fewer. Nothing was added.');
          return;
        }
        const key = E.nameKey(value);
        if (seen.has(key)) {
          skipped++;
          continue;
        }
        seen.add(key);
        fresh.push({ id: uid(), name: value });
      }
      if (c.items.length + fresh.length > 300) {
        notify('A collection can hold up to 300 items. Nothing was added.');
        return;
      }
      c.items.push(...fresh);
      if (persist() === false) {
        render('bulk-items');
        return;
      }
      pendingItemInputs.delete(c.id);
      render('bulk-items');
      notify(
        fresh.length +
          ' items added' +
          (skipped ? ' · ' + skipped + ' duplicate names skipped' : '') +
          '.',
      );
    };
    const section = el(
      'div',
      {},
      el(
        'div',
        { class: 'panel' },
        el('h2', {}, 'Make it your collection'),
        el(
          'p',
          { class: 'muted', style: 'font-size:13px' },
          'Paste your list, one item per line. Duplicate names are skipped. Unadded names stay here when you switch views or collections; add them before closing.',
        ),
        el('label', { for: 'bulk-items' }, 'Add items'),
        input,
        el(
          'div',
          { class: 'row wrap', style: 'margin-top:13px' },
          el('span', { class: 'muted', style: 'font-size:12px' }, c.items.length + ' of 300 items'),
          btn('Add to collection', add, 'primary'),
        ),
      ),
    );
    if (c.items.length)
      section.append(
        el(
          'div',
          { class: 'panel' },
          el(
            'div',
            { class: 'row' },
            el('h3', { id: 'items-heading', tabindex: '-1' }, 'All items'),
            el('span', { class: 'badge' }, c.items.length),
          ),
          c.items.map((item) =>
            el(
              'div',
              { class: 'list-item' },
              el('span', { class: 'item-name' }, item.name),
              el(
                'div',
                { class: 'actions' },
                btn(
                  'Edit',
                  () =>
                    dialog(
                      'Rename item',
                      'Ballots stay attached to this item.',
                      (value, showError) => {
                        if (
                          c.items.some(
                            (i) => i.id !== item.id && E.nameKey(i.name) === E.nameKey(value),
                          )
                        ) {
                          return showError('Another item already uses that name.');
                        }
                        item.name = value;
                        persist();
                        render('edit-' + item.id);
                      },
                      { label: 'Save name', inputValue: item.name },
                    ),
                  'small',
                  { id: 'edit-' + item.id },
                ),
                btn(
                  'Remove',
                  () =>
                    dialog(
                      'Remove ' + item.name + '?',
                      'This removes the item from saved ballots, too. Saved ballots with fewer than two ranked items afterward will be removed. Any unfinished ballot keeps its remaining order, ties, and skips. Export a backup first if you might want to restore the item.',
                      () => {
                        const withoutItem = (ballot) => ({
                          ...ballot,
                          groups: ballot.groups
                            .map((group) => group.filter((id) => id !== item.id))
                            .filter((group) => group.length),
                          skipped: ballot.skipped.filter((id) => id !== item.id),
                        });
                        c.items = c.items.filter((i) => i.id !== item.id);
                        c.ballots = c.ballots
                          .map(withoutItem)
                          .filter((b) => b.groups.flat().length >= 2);
                        if (persist()) {
                          if (draft) draft = withoutItem(draft);
                          savedRound = null;
                        }
                        render(['items-heading', 'bulk-items']);
                      },
                      { label: 'Remove item', danger: true },
                    ),
                  'small danger',
                ),
              ),
            ),
          ),
        ),
      );
    section.append(
      el(
        'div',
        { class: 'row wrap' },
        btn(
          'Rename collection',
          () =>
            dialog(
              'Rename collection',
              'Choose a name for this collection.',
              (value) => {
                c.name = value;
                persist();
                render('rename-collection');
              },
              { label: 'Save name', inputValue: c.name },
            ),
          'link',
          { id: 'rename-collection' },
        ),
        btn(
          'Delete collection',
          () =>
            dialog(
              'Delete this collection?',
              'All ' +
                c.items.length +
                ' items and ' +
                c.ballots.length +
                ' ballots in “' +
                c.name +
                '” will be removed, along with any unadded item names for this collection. This cannot be undone here. Export a backup first if you may want it back.',
              () => {
                state.collections = state.collections.filter((x) => x.id !== c.id);
                selected = state.collections[0]?.id || null;
                draft = null;
                savedRound = null;
                if (persist()) pendingItemInputs.delete(c.id);
                render('view-heading');
              },
              { label: 'Delete collection', danger: true },
            ),
          'link danger',
        ),
      ),
    );
    return section;
  }
  function historyView(c) {
    if (!c.ballots.length)
      return el(
        'div',
        { class: 'panel empty' },
        el('h2', { id: 'history-heading', tabindex: '-1' }, 'Every preference has a history'),
        el(
          'p',
          { class: 'muted' },
          'Your saved ballots will appear here. Remove any ballot to undo its contribution.',
        ),
      );
    historyPage = Math.min(historyPage, Math.ceil(c.ballots.length / 50) - 1);
    const offset = historyPage * 50;
    return el(
      'div',
      {},
      el('h2', { id: 'history-heading', tabindex: '-1' }, 'Your ballots'),
      el(
        'p',
        { class: 'muted', style: 'font-size:13px' },
        'Each ballot counts once. Deleting a ballot immediately recalculates the results.',
      ),
      el(
        'div',
        { class: 'row wrap', style: 'margin-bottom:18px' },
        el(
          'span',
          { class: 'muted' },
          'Page ' + (historyPage + 1) + ' of ' + Math.ceil(c.ballots.length / 50),
        ),
        el(
          'div',
          { class: 'actions' },
          btn(
            'Newer',
            () => {
              historyPage--;
              render(['history-newer', 'history-older']);
            },
            'small',
            { id: 'history-newer', disabled: historyPage === 0 },
          ),
          btn(
            'Older',
            () => {
              historyPage++;
              render(['history-older', 'history-newer']);
            },
            'small',
            { id: 'history-older', disabled: offset + 50 >= c.ballots.length },
          ),
        ),
      ),
      [...c.ballots]
        .reverse()
        .slice(offset, offset + 50)
        .map((b, i) =>
          el(
            'div',
            { class: 'panel' },
            el(
              'div',
              { class: 'row' },
              el('span', { class: 'badge' }, 'Ballot ' + (c.ballots.length - offset - i)),
              el('span', { class: 'history-date' }, new Date(b.createdAt).toLocaleString()),
            ),
            el(
              'div',
              { class: 'history-groups' },
              b.groups.map((g) => g.map(name).join(' = ')).join('  ›  '),
            ),
            b.skipped.length
              ? el(
                  'p',
                  { class: 'muted', style: 'font-size:12px' },
                  'Skipped: ' + b.skipped.map(name).join(', '),
                )
              : null,
            btn(
              i === 0 && offset === 0 ? 'Undo this ballot' : 'Delete ballot',
              () =>
                dialog(
                  'Remove this ballot?',
                  'Its comparisons will no longer contribute to your results.',
                  () => {
                    c.ballots = c.ballots.filter((x) => x.id !== b.id);
                    persist();
                    render('history-heading');
                    notify('Ballot removed; ranking recalculated.');
                  },
                  { label: 'Remove ballot', danger: true },
                ),
              'small danger',
            ),
          ),
        ),
    );
  }
  function helpView() {
    return el(
      'div',
      { class: 'panel help' },
      el('h2', {}, 'A little room for nuance'),
      [
        [
          'Preference, not a score',
          'This is your evolving order of preference. No stars, grades, or claims of objective quality. Separate collections keep different subjects and their results independent. Each saved ballot has equal weight; repeated ballots add more evidence, so undo old ballots if you want to replace an opinion.',
        ],
        [
          'How a ballot works',
          'A batch contains up to five items. Use ↑ and ↓ to move an item; with a tied item, the arrows split it into a separate rank. “Tie ↑” joins the rank above. Use Choose items to select 2–5 familiar items yourself, including items that have not appeared in an automatic batch. The top is most preferred. Automatic rounds start in a random order; chosen rounds follow your selection order. Review both before saving. Skip anything unfamiliar or anything you cannot compare today. Skips never become losses. You need at least two ranked items.',
        ],
        [
          'Keep going in small rounds',
          'After saving, choose Next round for up to five items. A familiar item helps connect rounds, while new pairs and less-compared items get priority. With small collections, some items naturally repeat. Skipped items rest for two saved rounds when alternatives exist; rounds may be smaller during that rest. Skips never count as losses or permanently hide an item. Choose items always lets you bring anything back. Older backups with up to ten items per ballot still work.',
        ],
        [
          'What about A > B > C > A?',
          'Cycles are normal in preference data. The app uses the Schulze method (winning-votes variant): it compares the strongest paths of pairwise majority support, rather than pretending every ballot fits a simple score. If neither direction is stronger, the evidence does not resolve that pair. Maximal remaining items are shown in a shared tier, alphabetically. This can reflect explicit ties, a cycle, or missing comparisons. Shared tiers do not prove equal preference.',
        ],
        [
          'Partial evidence stays visible',
          'Items with zero pair comparisons stay under “Not ranked yet”, separate from the ordering. An explicit tied comparison counts as evidence but gives neither item a win. Pair coverage tells you how much of the collection has met; it is not a confidence score. Disconnected groups can share unresolved tiers. More ballots can change any provisional order.',
        ],
        [
          'Keep a backup',
          'Your data lives in this browser, on this device, when browser storage is available. Nothing is uploaded, synced, or shared. Private browsing, clearing browser data, moving the app files, or switching browsers may lose or separate your saved state. Export JSON backups regularly and before deleting data. Import adds separate collections; it never overwrites existing ones. Export includes added items and saved ballots, but not unadded names or a ballot in progress.',
        ],
        [
          'Keyboard & offline use',
          'Use Tab to navigate and Enter or Space to activate buttons. After moving or restoring an item, focus stays on an enabled ranking control for that item. Skipping an item moves focus to its Restore button. Open index.html alongside app.js, engine.js, and style.css in a desktop browser, or use the self-contained Rank-Anything.html file. No server or internet connection is needed. Use one browser tab at a time.',
        ],
      ].map(([title, text]) =>
        el('section', {}, el('h3', {}, title), el('p', { class: 'muted' }, text)),
      ),
    );
  }
  function render(focusIds) {
    root.replaceChildren();
    const c = collection();
    const file = el('input', {
      type: 'file',
      class: 'file-input',
      accept: '.json,application/json',
      onChange: importBackup,
      'aria-label': 'Import backup',
    });
    const sidebar = el(
      'aside',
      { class: 'sidebar' },
      el(
        'div',
        { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')),
        'Rank Anything',
      ),
      el(
        'div',
        {},
        el('div', { class: 'eyebrow' }, 'Your collections'),
        el(
          'nav',
          { class: 'collections', 'aria-label': 'Collections' },
          state.collections.map((x) =>
            btn(
              [el('span', {}, x.name), el('small', {}, x.items.length)],
              () => switchCollection(x.id),
              'collection' + (x.id === selected ? ' active' : ''),
              { 'aria-current': x.id === selected ? 'true' : 'false' },
            ),
          ),
        ),
        btn('+ New collection', newCollection, 'new'),
      ),
      el(
        'div',
        { class: 'sidebar-foot' },
        el('div', { class: 'eyebrow' }, 'Yours to keep'),
        el('p', {}, 'A little order for the things\nyou care about.'),
        el(
          'div',
          { class: 'side-actions' },
          btn('Export backup', exportBackup),
          btn('Import backup', () => file.click()),
        ),
        file,
        el('span', {}, 'Offline · No account · No tracking'),
      ),
    );
    const main = el(
      'main',
      { class: 'main' },
      el(
        'div',
        { class: 'topline' },
        el('span', {}, 'A matter of preference'),
        el(
          'span',
          {},
          el('i', { class: 'local-dot' }),
          storageWarning ? 'Export to keep this session' : 'Stored on this device',
        ),
      ),
    );
    if (storageWarning)
      main.append(
        el(
          'div',
          { class: 'notice warning', role: 'alert' },
          storageWarning,
          unreadableSave !== null
            ? el(
                'div',
                { class: 'actions', style: 'margin-top:10px' },
                btn(
                  'Download unreadable save',
                  () => download(unreadableSave, 'rank-anything-unreadable-save.txt', 'text/plain'),
                  'small',
                ),
                btn(
                  'Replace previous save',
                  () =>
                    dialog(
                      'Replace unreadable saved data?',
                      'Download the unreadable save first if you may need to recover it. This will replace it with this session’s current collections.',
                      () => {
                        unreadableSave = null;
                        persist();
                        render('view-heading');
                      },
                      { label: 'Replace save', danger: true },
                    ),
                  'small danger',
                ),
              )
            : null,
        ),
      );
    if (!c) {
      main.append(
        el(
          'div',
          { class: 'onboard' },
          el('div', { class: 'eyebrow' }, 'Your taste. Your order.'),
          el(
            'h1',
            { id: 'view-heading', tabindex: '-1' },
            'Rank anything.\nDiscover your favorites.',
          ),
          el(
            'p',
            { class: 'intro muted' },
            'Turn a jumble of good things into a preference order. Compare a handful at a time, leave room for ties, and watch your favorites emerge.',
          ),
          el(
            'div',
            { class: 'welcome-grid' },
            el(
              'div',
              { class: 'panel' },
              el('span', { class: 'badge' }, 'A clean slate'),
              el('h2', { style: 'margin-top:17px' }, 'Make it yours'),
              el(
                'p',
                { class: 'muted' },
                'Start with games, books, films, meals, or a collection of your own.',
              ),
              btn('Create a collection', newCollection, 'primary'),
            ),
            el(
              'div',
              { class: 'panel soft' },
              el('span', { class: 'badge' }, 'Try it first'),
              el('h2', { style: 'margin-top:17px' }, 'A weekend well spent'),
              el(
                'p',
                { class: 'muted' },
                'Explore twelve demo activities. You bring the preferences.',
              ),
              btn('Explore demo', demo),
            ),
          ),
        ),
      );
    } else {
      main.append(
        el('div', { class: 'eyebrow' }, 'Your collection'),
        el('h1', { id: 'view-heading', tabindex: '-1' }, c.name),
        el('p', { class: 'muted' }, 'A living order of the things you prefer.'),
        el(
          'nav',
          { class: 'tabs', 'aria-label': 'Collection views' },
          ['Rank', 'Results', 'Items', 'History', 'Guide'].map((t) =>
            btn(
              t,
              () => {
                tab = t;
                render('tab-' + t);
              },
              t === tab ? 'active' : '',
              { id: 'tab-' + t, 'aria-current': t === tab ? 'page' : 'false' },
            ),
          ),
        ),
      );
      main.append(
        tab === 'Rank'
          ? rankView(c)
          : tab === 'Results'
            ? resultsView(c)
            : tab === 'Items'
              ? itemsView(c)
              : tab === 'History'
                ? historyView(c)
                : helpView(),
      );
    }
    main.append(el('footer', {}, 'Rank Anything · Preferences change. Your ranking can, too.'));
    root.append(el('div', { class: 'shell' }, sidebar, main));
    if (focusIds !== undefined) focusContent(focusIds);
  }
  window.addEventListener('beforeunload', (e) => {
    if (draft || storageWarning || [...pendingItemInputs.values()].some((value) => value.trim())) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY)
      notify(
        'Data changed in another tab. Export this tab if needed, then reload before editing to avoid overwriting it.',
      );
  });
  render();
})();
