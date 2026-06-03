'use strict';

// ── Helpers ──────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const qs = (sel, el = document) => el.querySelector(sel);
const STORAGE = {
  sharedKeys: ['kye-bookings', 'kye-packing', 'kye-todos'],
  cache: {},
  remoteEnabled: false,
  remoteReady: false,
  polling: null,
  get config() {
    return window.TRIP_SYNC_CONFIG || { provider: 'local' };
  },
  get: (k, def) => {
    if (Object.prototype.hasOwnProperty.call(STORAGE.cache, k)) return STORAGE.cache[k];
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch {
      return def;
    }
  },
  set: (k, v) => {
    STORAGE.cache[k] = v;
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
    if (STORAGE.sharedKeys.includes(k)) STORAGE.saveRemote();
  },
  async init() {
    STORAGE.sharedKeys.forEach(k => {
      try {
        const v = localStorage.getItem(k);
        STORAGE.cache[k] = v ? JSON.parse(v) : {};
      } catch {
        STORAGE.cache[k] = {};
      }
    });

    const cfg = STORAGE.config;
    STORAGE.remoteEnabled = cfg.provider === 'supabase' && cfg.url && cfg.anonKey;
    if (!STORAGE.remoteEnabled) return;

    try {
      const remote = await STORAGE.fetchRemote();
      if (remote) {
        STORAGE.sharedKeys.forEach(k => {
          STORAGE.cache[k] = remote[k] || {};
          try { localStorage.setItem(k, JSON.stringify(STORAGE.cache[k])); } catch {}
        });
      } else {
        await STORAGE.createRemote();
      }
      STORAGE.remoteReady = true;
      STORAGE.startPolling();
    } catch (err) {
      console.warn('Shared trip sync unavailable; using local storage.', err);
    }
  },
  remoteHeaders() {
    const cfg = STORAGE.config;
    return {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      'Content-Type': 'application/json',
    };
  },
  remoteBaseUrl() {
    const cfg = STORAGE.config;
    const table = encodeURIComponent(cfg.table || 'trip_state');
    const id = encodeURIComponent(cfg.id || 'west-coast-roadtrip-2026');
    return `${cfg.url.replace(/\/$/, '')}/rest/v1/${table}?id=eq.${id}`;
  },
  remotePayload() {
    return STORAGE.sharedKeys.reduce((data, k) => {
      data[k] = STORAGE.cache[k] || {};
      return data;
    }, {});
  },
  async fetchRemote() {
    const res = await fetch(`${STORAGE.remoteBaseUrl()}&select=data`, {
      headers: STORAGE.remoteHeaders(),
    });
    if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
    const rows = await res.json();
    return rows[0]?.data || null;
  },
  async createRemote() {
    const cfg = STORAGE.config;
    const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(cfg.table || 'trip_state')}`, {
      method: 'POST',
      headers: { ...STORAGE.remoteHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ id: cfg.id || 'west-coast-roadtrip-2026', data: STORAGE.remotePayload() }),
    });
    if (!res.ok && res.status !== 409) throw new Error(`Supabase create failed: ${res.status}`);
  },
  async saveRemote() {
    if (!STORAGE.remoteEnabled) return;
    try {
      const res = await fetch(STORAGE.remoteBaseUrl(), {
        method: 'PATCH',
        headers: { ...STORAGE.remoteHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ data: STORAGE.remotePayload(), updated_at: new Date().toISOString() }),
      });
      if (res.status === 404) await STORAGE.createRemote();
      if (!res.ok && res.status !== 404) throw new Error(`Supabase update failed: ${res.status}`);
    } catch (err) {
      console.warn('Shared trip sync save failed; local changes were kept.', err);
    }
  },
  startPolling() {
    if (STORAGE.polling) return;
    STORAGE.polling = setInterval(async () => {
      try {
        const remote = await STORAGE.fetchRemote();
        if (!remote) return;
        const before = JSON.stringify(STORAGE.remotePayload());
        STORAGE.sharedKeys.forEach(k => {
          STORAGE.cache[k] = remote[k] || {};
          try { localStorage.setItem(k, JSON.stringify(STORAGE.cache[k])); } catch {}
        });
        if (JSON.stringify(STORAGE.remotePayload()) !== before) renderSharedState();
      } catch (err) {
        console.warn('Shared trip sync refresh failed.', err);
      }
    }, 15000);
  }
};

const LODGING_ICON = { motel: '🏨', camp: '🏕', airbnb: '🏠', friend: '🏡' };
const FOOD_ICON = { seafood: '🦀', cafe: '☕', pub: '🍺', brewery: '🍺', bakery: '🥐', restaurant: '🍽', dessert: '🍦', diner: '🥘', dairy: '🧀', dinner: '🕯', burger: '🍔' };
const URG_LABEL = { critical: 'CRITICAL', 'very-high': 'VERY HIGH', high: 'HIGH', moderate: 'MODERATE' };
const URG_CLASS = { critical: 'urg-critical', 'very-high': 'urg-very-high', high: 'urg-high', moderate: 'urg-moderate' };

function migrateOldStorageKeys() {
  ['bookings','packing','todos','dark'].forEach(k => {
    const old = localStorage.getItem('ke-' + k);
    if (old !== null && localStorage.getItem('kye-' + k) === null) {
      localStorage.setItem('kye-' + k, old);
      localStorage.removeItem('ke-' + k);
    }
  });
}

function renderSharedState() {
  renderBookings();
  renderChecklist('packing-content', TRIP_DATA.packing, 'kye-packing');
  renderChecklist('todo-content', TRIP_DATA.todos, 'kye-todos');
}

// ── Hero ─────────────────────────────────────────────────────────

function renderHero() {
  const statsEl = $('hero-stats');
  if (statsEl) {
    statsEl.innerHTML = TRIP_DATA.stats.map(s =>
      `<div class="stat-pill"><span class="stat-value">${s.value}</span><span class="stat-label">${s.label}</span></div>`
    ).join('');
  }

  const warnEl = $('warnings-container');
  if (!warnEl) return;

  const gridItems = TRIP_DATA.warnings.map(w =>
    `<div class="warning-item sev-${w.sev}">
      <span class="warning-icon">${w.icon}</span>
      <div>
        <div class="warning-title">${w.title}</div>
        <div class="warning-desc">${w.desc}</div>
      </div>
    </div>`
  ).join('');

  warnEl.innerHTML = `
    <button class="warnings-toggle" id="warnings-toggle" aria-expanded="false">
      <span>⚠️</span>
      <span>Critical Warnings</span>
      <span class="warnings-count">${TRIP_DATA.warnings.length}</span>
      <span class="warnings-chevron">▾</span>
    </button>
    <div class="warnings-body" id="warnings-body">
      <div><div class="warnings-grid">${gridItems}</div></div>
    </div>`;

  $('warnings-toggle').addEventListener('click', () => {
    const open = warnEl.classList.toggle('warnings-open');
    $('warnings-toggle').setAttribute('aria-expanded', open);
  });
}

// ── Nights at a Glance ───────────────────────────────────────────

function renderNightsGlance() {
  const el = $('nights-glance');
  if (!el) return;

  const shortDate = s => s.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*/, '');

  const shortLodging = name => {
    if (!name || name === 'Home!') return 'Home';
    return name
      .replace(/\s+or\s+[\w\s/]+$/, '')
      .replace('Pismo State Beach — ', '')
      .replace(' — ', ' · ')
      .replace(' Campground', ' CG')
      .replace(' State Park', ' SP')
      .replace(' National Monument', ' NM')
      .replace(' (Inyo NF)', '')
      .replace(' South', '')
      .trim();
  };

  const shortDest = s => s
    .replace(' 🏠', '')
    .replace(' (Los Padres NF)', '')
    .replace(' or Natural Bridge CG', '')
    .replace(' — ', ' · ');

  // Group consecutive nights at the same lodging
  const groups = [];
  TRIP_DATA.days.forEach(d => {
    const last = groups[groups.length - 1];
    if (last && d.lodgingType !== null && last.lodgingName === d.lodgingName) {
      last.endId = d.id;
      last.endDate = d.date;
      last.count++;
    } else {
      groups.push({
        startId: d.id, endId: d.id,
        startDate: d.date, endDate: d.date,
        to: shortDest(d.to),
        zone: d.zone,
        lodgingType: d.lodgingType,
        lodgingName: d.lodgingName,
        count: d.lodgingType !== null ? 1 : 0
      });
    }
  });

  const rows = groups.map(g => {
    const isHome = g.lodgingType === null;
    const nightStr = g.startId === g.endId
      ? `${g.startId}`
      : `${g.startId}–${g.endId}`;
    const sd = shortDate(g.startDate), ed = shortDate(g.endDate);
    const dateStr = sd === ed ? sd : `${sd} – ${ed}`;
    const icon = isHome ? '🏠' : (LODGING_ICON[g.lodgingType] || '🏕');
    const lodge = shortLodging(g.lodgingName);
    const countBadge = g.count > 1
      ? `<span class="glance-count">${g.count} nights</span>` : '';

    return `<div class="glance-row" data-zone="${g.zone}">
      <span class="glance-n">${isHome ? 'Home' : `Night ${nightStr}`}</span>
      <span class="glance-date">${dateStr}</span>
      <span class="glance-dest">${g.to}</span>
      <span class="glance-lodge">${icon} ${lodge} ${countBadge}</span>
    </div>`;
  }).join('');

  const stopCount = groups.filter(g => g.count > 0).length;
  el.innerHTML = `
    <div class="glance-header">
      <span class="glance-title">Nights at a Glance</span>
      <span class="glance-meta">${stopCount} stops · Jun 18 – Jul 5</span>
    </div>
    <div class="glance-body">${rows}</div>`;
}

// ── Days ─────────────────────────────────────────────────────────

function buildDayCard(day) {
  const isRest = ['Rest day', 'City day', 'Base day', 'Minimal'].includes(day.driveTime);
  const driveClass = isRest ? 'rest' : (day.driveTime.includes('5') ? 'long' : '');
  const icon = LODGING_ICON[day.lodgingType] || '🏕';

  function secHTML(title, items, cls = '', emoji = '') {
    if (!items || !items.length) return '';
    return `<div class="day-sec ${cls}">
      <h4>${emoji ? emoji + ' ' : ''}${title}</h4>
      <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>`;
  }

  function foodSecHTML(food) {
    if (!food || !food.length) return '';
    return `<div class="day-sec">
      <h4>🍴 Food</h4>
      <ul>${food.map(f => `<li class="food-item"><strong>${f.name}</strong> <span class="food-note">— ${f.note}</span></li>`).join('')}</ul>
    </div>`;
  }

  const warningHTML = day.warnings && day.warnings.length
    ? `<div class="day-sec warn-sec full-width">
        <h4>⚠️ Warnings</h4>
        <ul>${day.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
       </div>` : '';

  const lodgingHTML = day.lodgingName !== 'Home!' ? `
    <div class="day-sec full-width">
      <h4>${icon} Lodging</h4>
      <div class="lodging-detail">
        <span class="lodging-name-main">${day.lodgingName}</span>
        <span class="lodging-cost">${day.lodgingCost}</span>
      </div>
      <p class="lodging-notes-text">${day.lodgingNotes}</p>
      ${day.lodgingBackup && day.lodgingBackup !== '—'
        ? `<p class="lodging-backup">📍 Backup: ${day.lodgingBackup}</p>` : ''}
    </div>` : '';

  const routeHTML = day.route ? `
    <div class="day-sec full-width">
      <h4>🗺 Route</h4>
      <span class="route-text">${day.route}</span>
      ${day.routeNotes ? `<p style="font-size:.8rem;color:var(--text-mid);margin-top:4px;">${day.routeNotes}</p>` : ''}
    </div>` : '';

  const card = document.createElement('div');
  card.className = `day-card zone-${day.zone}`;
  card.dataset.id = day.id;

  card.innerHTML = `
    <button class="day-header" aria-expanded="false">
      <div class="day-header-top">
        <span class="day-label">${day.label}</span>
        <span class="day-date">${day.date}</span>
        <span class="drive-badge ${driveClass}">${day.driveTime}</span>
      </div>
      <div class="day-header-bottom">
        <span class="day-route">${day.from} → ${day.to}</span>
        <span class="lodging-badge">${icon} ${day.lodgingName}</span>
      </div>
      <span class="day-chevron" aria-hidden="true">▾</span>
    </button>
    <div class="day-body" role="region">
      <div class="day-body-inner">
        <div class="day-content">
          <p class="day-desc">${day.description}</p>
          <div class="day-sections">
            ${routeHTML}
            ${lodgingHTML}
            ${secHTML('Stops', day.stops, '', '📍')}
            ${secHTML('Activities', day.activities, '', '🥾')}
            ${foodSecHTML(day.food)}
            ${secHTML("Kye's Notes", day.dogNotes, 'dog-sec', '🐾')}
            ${warningHTML}
          </div>
        </div>
      </div>
    </div>`;

  return card;
}

function renderDays() {
  const list = $('days-list');
  if (!list) return;
  TRIP_DATA.days.forEach(day => list.appendChild(buildDayCard(day)));

  list.addEventListener('click', e => {
    const header = e.target.closest('.day-header');
    if (!header) return;
    const card = header.closest('.day-card');
    const wasOpen = card.classList.contains('expanded');

    // Close all
    list.querySelectorAll('.day-card.expanded').forEach(c => {
      c.classList.remove('expanded');
      qs('.day-header', c).setAttribute('aria-expanded', 'false');
    });

    if (!wasOpen) {
      card.classList.add('expanded');
      header.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        const top = card.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top, behavior: 'smooth' });
      }, 100);
    }
  });
}

// ── Driving ──────────────────────────────────────────────────────

function renderDriving() {
  const summaryEl = $('drive-summary');
  if (summaryEl) {
    const drivingDays = TRIP_DATA.driving.filter(d => !['Rest', 'Walk/Uber', 'Minimal'].includes(d.time));
    const longDays = TRIP_DATA.driving.filter(d => d.long).length;
    const miles = TRIP_DATA.driving.reduce((sum, d) => {
      const n = parseInt((d.miles || '').replace(/[^0-9]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    summaryEl.innerHTML = [
      { v: `~${miles.toLocaleString()}`, l: 'total miles' },
      { v: drivingDays.length, l: 'driving days' },
      { v: longDays, l: 'long days (4h+)' },
      { v: '~53–60h', l: 'est. drive time' },
    ].map(s => `<div class="drive-stat"><span class="drive-stat-value">${s.v}</span><span class="drive-stat-label">${s.l}</span></div>`).join('');
  }

  const table = $('driving-table');
  if (!table) return;
  table.innerHTML = `
    <thead><tr>
      <th>Day</th><th>Date</th><th>From</th><th>To</th><th>Miles</th><th>Drive Time</th>
    </tr></thead>
    <tbody>${TRIP_DATA.driving.map(d => `
      <tr class="${d.long ? 'long-day' : ''}">
        <td style="font-weight:600;color:var(--text-light);font-size:.8rem;">Day ${d.day}</td>
        <td style="color:var(--text-mid);font-size:.82rem;white-space:nowrap">${d.date}</td>
        <td style="font-size:.85rem">${d.from}</td>
        <td style="font-size:.85rem">${d.to}</td>
        <td style="font-variant-numeric:tabular-nums;font-size:.85rem">${d.miles}</td>
        <td><span class="time-badge ${['Rest', 'Walk/Uber', 'Minimal'].includes(d.time) ? 'rest-badge' : ''}">${d.time}</span>
          ${d.flagNote ? `<span class="flag-note">⚑ ${d.flagNote}</span>` : ''}</td>
      </tr>`).join('')}
    </tbody>`;
}

// ── Budget ───────────────────────────────────────────────────────

function renderBudget() {
  const el = $('budget-content');
  if (!el) return;
  const cats = TRIP_DATA.budget.categories.map(c => ({
    ...c, total: c.items.reduce((s, i) => s + i.amount, 0)
  }));
  const grand = cats.reduce((s, c) => s + c.total, 0);

  const bars = cats.map(c => `
    <div class="budget-bar-row">
      <span class="budget-bar-label">${c.name}</span>
      <div class="budget-bar-track"><div class="budget-bar-fill" style="background:${c.color}" data-pct="${(c.total / grand * 100).toFixed(1)}"></div></div>
      <span class="budget-bar-amt">$${c.total.toLocaleString()}</span>
    </div>`).join('');

  const tableRows = cats.map(c => `
    <tr class="budget-cat-row"><td colspan="2" style="color:${c.color}">${c.name}</td><td class="amt-col">$${c.total.toLocaleString()}</td></tr>
    ${c.items.map(i => `<tr class="budget-item-row"><td colspan="2">${i.label}</td><td class="amt-col">$${i.amount.toLocaleString()}</td></tr>`).join('')}`).join('');

  el.innerHTML = `
    <p class="budget-total">Estimated total: <span>$${grand.toLocaleString()}</span></p>
    <div class="budget-bars">${bars}</div>
    <div class="table-scroll">
      <table class="data-table budget-table">
        <thead><tr><th colspan="2">Category / Item</th><th class="amt-col">Amount</th></tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot><tr class="budget-total-row">
          <td colspan="2">Grand Total</td>
          <td class="amt-col">$${grand.toLocaleString()}</td>
        </tr></tfoot>
      </table>
    </div>`;

  // Animate bars in
  requestAnimationFrame(() => {
    el.querySelectorAll('.budget-bar-fill').forEach(b => {
      b.style.width = b.dataset.pct + '%';
    });
  });
}

// ── Bookings ─────────────────────────────────────────────────────

function renderBookings() {
  const el = $('booking-content');
  if (!el) return;
  const saved = STORAGE.get('kye-bookings', {});

  const rows = TRIP_DATA.bookings.map(b => {
    const status = b.status === 'booked' ? 'booked' : (saved[b.p] || b.status);
    return `<tr>
      <td style="font-weight:700;color:var(--gold);font-size:.85rem;white-space:nowrap">#${b.p}</td>
      <td class="booking-what">
        <span class="booking-title">${b.what}</span>
        <span class="booking-note">${b.notes}</span>
      </td>
      <td class="booking-how">${b.how}</td>
      <td><span class="urg ${URG_CLASS[b.urgency]}">${URG_LABEL[b.urgency]}</span></td>
      <td>
        <select class="status-sel ${status === 'booked' ? 'status-booked' : ''}" data-p="${b.p}">
          <option value="pending" ${status === 'pending' ? 'selected' : ''}>⬜ Pending</option>
          <option value="booked" ${status === 'booked' ? 'selected' : ''}>✅ Booked</option>
          <option value="waitlist" ${status === 'waitlist' ? 'selected' : ''}>⏳ Waitlisted</option>
        </select>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>#</th><th>What to Book</th><th>How</th><th>Urgency</th><th>Status</th></tr></thead>
        <tbody id="bookings-body">${rows}</tbody>
      </table>
    </div>`;

  el.onchange = e => {
    if (!e.target.classList.contains('status-sel')) return;
    const saved = STORAGE.get('kye-bookings', {});
    saved[e.target.dataset.p] = e.target.value;
    STORAGE.set('kye-bookings', saved);
    e.target.className = `status-sel ${e.target.value === 'booked' ? 'status-booked' : ''}`;
  };
}

// ── Dog Rules ────────────────────────────────────────────────────

function renderDogRules() {
  const el = $('dog-rules-content');
  if (!el) return;
  el.innerHTML = TRIP_DATA.dogRules.map(r => `
    <div class="dog-rule-card">
      <div class="dog-rule-loc">📍 ${r.location}</div>
      <div class="dog-rule-cols">
        <div class="dog-rule-col col-yes">
          <h4>✅ Allowed</h4>
          <ul>${r.allowed.map(a => `<li>${a}</li>`).join('')}</ul>
        </div>
        <div class="dog-rule-col col-no">
          <h4>❌ Not Allowed</h4>
          <ul>${r.notAllowed.map(n => `<li>${n}</li>`).join('')}</ul>
        </div>
      </div>
      ${r.notes ? `<p class="dog-rule-note">${r.notes}</p>` : ''}
    </div>`).join('');
}

// ── Food ─────────────────────────────────────────────────────────

function renderFood() {
  const el = $('food-content');
  if (!el) return;
  const sorted = [...TRIP_DATA.food].sort((a, b) => a.day - b.day);
  el.innerHTML = `<div class="food-grid">${sorted.map(f => `
    <div class="food-card">
      <span class="food-icon">${FOOD_ICON[f.type] || '🍴'}</span>
      <div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
          <span class="food-name">${f.name}</span>
          ${f.dog ? '<span class="dog-friendly-pill">🐾 dog-friendly</span>' : ''}
        </div>
        <p class="food-loc">📍 ${f.loc} &nbsp;·&nbsp; Day ${f.day}</p>
        <p class="food-desc">${f.desc}</p>
      </div>
    </div>`).join('')}</div>`;
}

// ── Checklist (shared) ───────────────────────────────────────────

function renderChecklist(containerId, data, storageKey) {
  const el = $(containerId);
  if (!el) return;
  const saved = STORAGE.get(storageKey, {});

  function totalItems() {
    return data.reduce((s, c) => s + c.items.length, 0);
  }
  function checkedCount() {
    return Object.values(STORAGE.get(storageKey, {})).filter(Boolean).length;
  }

  function buildHTML() {
    const total = totalItems();
    const done = checkedCount();
    const pct = total ? Math.round(done / total * 100) : 0;
    return `
      <p class="checklist-progress">${done} of ${total} items complete</p>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="checklist-categories">
        ${data.map((cat, ci) => `
          <div>
            <h3 class="checklist-cat-title">${cat.cat || cat.category}</h3>
            <ul class="checklist">
              ${cat.items.map((item, ii) => {
                const key = `${ci}-${ii}`;
                const chk = (STORAGE.get(storageKey, {}))[key] || false;
                return `<li class="check-item ${chk ? 'checked' : ''}">
                  <input type="checkbox" data-key="${key}" ${chk ? 'checked' : ''}>
                  <span>${item}</span>
                </li>`;
              }).join('')}
            </ul>
          </div>`).join('')}
      </div>`;
  }

  el.innerHTML = buildHTML();

  el.onchange = e => {
    if (e.target.type !== 'checkbox') return;
    const st = STORAGE.get(storageKey, {});
    st[e.target.dataset.key] = e.target.checked;
    STORAGE.set(storageKey, st);
    const li = e.target.closest('.check-item');
    li.classList.toggle('checked', e.target.checked);
    // Update progress
    const total = totalItems();
    const done = checkedCount();
    const pct = total ? Math.round(done / total * 100) : 0;
    const prog = qs('.checklist-progress', el);
    const fill = qs('.progress-fill', el);
    if (prog) prog.textContent = `${done} of ${total} items complete`;
    if (fill) fill.style.width = pct + '%';
  };
}

// ── Nav ──────────────────────────────────────────────────────────

function initNav() {
  // Dark mode
  const toggle = $('dark-toggle');
  const isDark = STORAGE.get('kye-dark', false);
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    toggle.textContent = '☀️';
  }
  toggle.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    toggle.textContent = dark ? '🌙' : '☀️';
    STORAGE.set('kye-dark', !dark);
  });

  // Hamburger
  const ham = $('hamburger');
  const nav = $('nav');
  ham && ham.addEventListener('click', () => nav.toggleAttribute('data-open'));
  document.addEventListener('click', e => {
    if (!nav.contains(e.target)) nav.removeAttribute('data-open');
  });

  // Close nav on link click (mobile)
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', () => nav.removeAttribute('data-open'));
  });

  // Active nav on scroll
  const sections = ['overview','days','driving','budget','booking','dog-rules','food','packing','todo'];
  const navLinks = document.querySelectorAll('.nav-links a');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
        });
      }
    });
  }, { rootMargin: '-50% 0px -45% 0px' });

  sections.forEach(id => {
    const el = $(id);
    if (el) observer.observe(el);
  });
}

// ── Init ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  migrateOldStorageKeys();
  await STORAGE.init();
  renderHero();
  renderNightsGlance();
  renderDays();
  renderDriving();
  renderBudget();
  renderSharedState();
  renderDogRules();
  renderFood();
  initNav();
});
