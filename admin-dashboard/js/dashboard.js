let currentEntries = [];
let currentRecentTableFilter = 'all';
let lastFilterTables = [];

let isOverviewLoading = false;
let hasInitialAnimated = false;
const latestStats = {
  totalTables: 0,
  totalRows: 0,
  totalSizeBytes: 0,
  version: '8.0.46'
};
const statCardAnimators = new Map();

function animateCounter(element, startVal, endVal, duration, formatter) {
  if (!element) return;
  if (statCardAnimators.has(element)) {
    cancelAnimationFrame(statCardAnimators.get(element));
    statCardAnimators.delete(element);
  }

  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (endVal - startVal) * ease;

    if (formatter) {
      element.textContent = formatter(current, ease, progress);
    } else {
      element.textContent = API.number(Math.round(current));
    }

    if (progress < 1) {
      const frameId = requestAnimationFrame(update);
      statCardAnimators.set(element, frameId);
    } else {
      if (formatter) {
        element.textContent = formatter(endVal, 1, 1);
      } else {
        element.textContent = API.number(Math.round(endVal));
      }
      statCardAnimators.delete(element);
    }
  }

  const frameId = requestAnimationFrame(update);
  statCardAnimators.set(element, frameId);
}

function triggerStatAnimation(type) {
  if (type === 'tables') {
    const el = document.getElementById('totalTables');
    animateCounter(el, 0, latestStats.totalTables, 600, (v) => API.number(Math.round(v)));
  } else if (type === 'records') {
    const el = document.getElementById('totalRows');
    animateCounter(el, 0, latestStats.totalRows, 700, (v) => API.number(Math.round(v)));
  } else if (type === 'size') {
    const el = document.getElementById('dbSize');
    animateCounter(el, 0, latestStats.totalSizeBytes, 750, (bytesVal) => API.bytes(Math.round(bytesVal)));
  } else if (type === 'version') {
    const el = document.getElementById('dbVersion');
    const verStr = String(latestStats.version || '8.0.46');
    const parts = verStr.split('.');
    if (parts.length >= 2) {
      const major = Number(parts[0]) || 8;
      const minor = Number(parts[1]) || 0;
      const patch = Number(parts[2]) || 0;
      const patchLen = parts[2] ? parts[2].length : 2;
      animateCounter(el, 0, 1, 700, (_, ease, progress) => {
        if (progress >= 1) return verStr;
        const curMaj = Math.round(major * ease);
        const curMin = Math.round(minor * ease);
        const curPatch = Math.round(patch * ease).toString().padStart(patchLen, '0');
        return `${curMaj}.${curMin}.${curPatch}`;
      });
    } else {
      el.textContent = verStr;
    }
  }
}

function initStatCardHoverAnimations() {
  const cards = document.querySelectorAll('#statCards .stat');
  cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      const type = card.getAttribute('data-stat');
      if (type) triggerStatAnimation(type);
    });
  });
}

async function loadOverview() {
  if (isOverviewLoading) return;
  isOverviewLoading = true;
  const err = document.getElementById('pageError');
  err.textContent = '';
  try {
    // Fetch database overview
    const d = await API.request('/overview');
    if (document.getElementById('dbName')) document.getElementById('dbName').textContent = d.database;
    const sideDb = document.getElementById('sideDbName');
    if (sideDb) sideDb.textContent = d.database;

    latestStats.totalTables = Number(d.totalTables) || 0;
    latestStats.totalRows = Number(d.totalRows) || 0;
    latestStats.totalSizeBytes = Number(d.totalSizeBytes) || 0;
    latestStats.version = String(d.version || '8.0.46');

    const ttEl = document.getElementById('totalTables');
    const trEl = document.getElementById('totalRows');
    const dsEl = document.getElementById('dbSize');
    const dvEl = document.getElementById('dbVersion');

    if (!hasInitialAnimated) {
      hasInitialAnimated = true;
      triggerStatAnimation('tables');
      triggerStatAnimation('records');
      triggerStatAnimation('size');
      triggerStatAnimation('version');
    } else {
      if (ttEl && !statCardAnimators.has(ttEl)) ttEl.textContent = API.number(d.totalTables);
      if (trEl && !statCardAnimators.has(trEl)) trEl.textContent = API.number(d.totalRows);
      if (dsEl && !statCardAnimators.has(dsEl)) dsEl.textContent = API.bytes(d.totalSizeBytes);
      if (dvEl && !statCardAnimators.has(dvEl)) dvEl.textContent = d.version;
    }

    document.getElementById('dbEngine').textContent = 'Default engine: ' + (d.defaultEngine || '—');
    document.getElementById('healthBadge').textContent = 'Connected';
    document.getElementById('healthBadge').className = 'status ok';
    document.getElementById('healthText').textContent = 'MySQL connection is healthy';
    document.getElementById('healthSub').textContent = 'Live response from backend';
    
    document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
    renderHealthDonut(d);

    const rows = d.tables || [];
    const maxRows = Math.max(1, ...rows.map(t => Number(t.rows || 0)));
    const totalRowsSum = rows.reduce((acc, cur) => acc + Number(cur.rows || 0), 0) || 1;

    const tableColorPalettes = [
      { gradient: 'linear-gradient(90deg, #2563eb, #38bdf8)', text: '#1d4ed8' }, // Blue
      { gradient: 'linear-gradient(90deg, #7c3aed, #c084fc)', text: '#6d28d9' }, // Purple
      { gradient: 'linear-gradient(90deg, #059669, #34d399)', text: '#047857' }, // Emerald
      { gradient: 'linear-gradient(90deg, #ea580c, #fb923c)', text: '#c2410c' }, // Orange
      { gradient: 'linear-gradient(90deg, #db2777, #f472b6)', text: '#be185d' }, // Pink
      { gradient: 'linear-gradient(90deg, #0284c7, #38bdf8)', text: '#0369a1' }, // Sky
      { gradient: 'linear-gradient(90deg, #4f46e5, #818cf8)', text: '#4338ca' }, // Indigo
      { gradient: 'linear-gradient(90deg, #d97706, #fbbf24)', text: '#b45309' }, // Amber
    ];

    document.getElementById('tablesBody').innerHTML = rows.map((t, idx) => {
      const r = Number(t.rows || 0);
      const palette = tableColorPalettes[idx % tableColorPalettes.length];
      const barWidth = Math.max(r > 0 ? 6 : 0, Math.round((r / maxRows) * 100));
      const pctOfTotal = totalRowsSum > 0 ? Math.round((r / totalRowsSum) * 100) : 0;

      let graphHtml = '';
      if (r === 0) {
        graphHtml = `
          <div style="display:flex; align-items:center; gap:10px; width:100%; max-width:280px;" title="Table is empty (0 records)">
            <div style="flex:1; height:8px; background:#f1f5f9; border-radius:99px; overflow:hidden;">
              <div style="width:0%; height:100%;"></div>
            </div>
            <span class="muted" style="font-size:11px; font-weight:600; min-width:64px; text-align:right;">0 rows (0%)</span>
          </div>
        `;
      } else {
        graphHtml = `
          <div style="display:flex; align-items:center; gap:10px; width:100%; max-width:280px;" title="${API.number(r)} rows (${pctOfTotal}% of total database records)">
            <div style="flex:1; height:8px; background:#f1f5f9; border-radius:99px; overflow:hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.04);">
              <div style="width:${barWidth}%; height:100%; background:${palette.gradient}; border-radius:99px; transition: width 0.7s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,0.1);"></div>
            </div>
            <span style="font-size:11px; font-weight:700; color:${palette.text}; min-width:68px; text-align:right;">
              ${API.number(r)} <small style="font-size:10px; font-weight:600; opacity:0.8;">(${pctOfTotal}%)</small>
            </span>
          </div>
        `;
      }

      return `
        <tr>
          <td><b>${API.escape(t.name)}</b></td>
          <td>${API.escape(t.engine || '—')}</td>
          <td><span class="pill" style="font-weight:bold;">${API.number(t.rows)}</span></td>
          <td>${API.bytes(t.dataBytes)}</td>
          <td>${API.bytes(t.indexBytes)}</td>
          <td>${graphHtml}</td>
          <td style="text-align: right; white-space: nowrap;">
            <a class="btn" style="padding:5px 10px; font-size:12px; margin-right:4px;" href="/tables-records.html?table=${encodeURIComponent(t.name)}">View Records</a>
            <a class="btn" style="padding:5px 10px; font-size:12px;" href="/table-details.html?table=${encodeURIComponent(t.name)}">Schema →</a>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7">No tables found.</td></tr>';

    renderTableDistribution(rows);

    // 3. Load all new entries
    await loadRecentEntries();
  } catch (e) {
    err.textContent = e.message;
    document.getElementById('healthBadge').textContent = 'Unavailable';
    document.getElementById('healthBadge').className = 'status bad';
  } finally {
    isOverviewLoading = false;
  }
}

async function loadRecentEntries() {
  const container = document.getElementById('recentSubmissionsBody');
  const countBadge = document.getElementById('entriesCountBadge');
  if (!container) return;

  try {
    const searchVal = document.getElementById('entrySearch') ? document.getElementById('entrySearch').value.trim() : '';
    const q = new URLSearchParams({
      table: currentRecentTableFilter,
      search: searchVal,
      limit: 50
    });

    const data = await API.request(`/recent-entries?${q}`);
    currentEntries = data.entries || [];

    if (countBadge) {
      countBadge.textContent = `${currentEntries.length} entries`;
    }

    // Dynamically update table select dropdown from all tables in the database
    if (data.tables && JSON.stringify(data.tables) !== JSON.stringify(lastFilterTables)) {
      lastFilterTables = data.tables;
      renderTableSelectDropdown(data.tables);
    }

    const browseBtn = document.getElementById('browseDataTableBtn');
    if (browseBtn) {
      browseBtn.href = currentRecentTableFilter !== 'all'
        ? `/tables-records.html?table=${encodeURIComponent(currentRecentTableFilter)}`
        : '/tables-records.html';
    }

    if (!currentEntries.length) {
      const targetMsg = currentRecentTableFilter !== 'all' ? `in table "<b>${API.escape(currentRecentTableFilter)}</b>"` : 'across database tables';
      container.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center; padding:25px;">No recent entries found ${targetMsg}.</td></tr>`;
      return;
    }

    container.innerHTML = currentEntries.map((e, idx) => {
      const tableBadge = `<span class="pill" style="background:#eef4ff; color:#2563eb; font-weight:700;">${API.escape(e.table_name || 'table')}</span>`;

      const statusBadge = e.isNew
        ? `<span class="new-badge"><span class="new-dot"></span> NEW</span>`
        : `<span class="muted" style="font-size:11px;">archived</span>`;

      const summaryText = e.message || e.subject || '—';

      return `
        <tr>
          <td>${statusBadge}</td>
          <td>${tableBadge}</td>
          <td><b>${API.escape(e.name || '—')}</b></td>
          <td>${API.escape(e.email || '—')}</td>
          <td>${API.escape(e.company || '—')}</td>
          <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${API.escape(summaryText)}">
            ${API.escape(summaryText)}
          </td>
          <td>${e.created_at ? new Date(e.created_at).toLocaleString() : '—'}</td>
          <td>
            <button class="btn" style="padding:4px 8px; font-size:12px;" onclick="showEntryDetail(${idx})">🔍 Details</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="8" class="error">Could not load recent entries: ${API.escape(err.message)}</td></tr>`;
  }
}

function renderTableSelectDropdown(tables) {
  const select = document.getElementById('recentTableSelect');
  if (!select) return;

  const currentVal = currentRecentTableFilter;
  const tableList = ['all', ...(tables || [])];

  select.innerHTML = tableList.map(t => {
    const isAll = t === 'all';
    const label = isAll ? '📂 All Tables' : `📄 ${API.escape(t)}`;
    const selected = t === currentVal ? 'selected' : '';
    return `<option value="${API.escape(t)}" ${selected}>${label}</option>`;
  }).join('');

  select.value = currentVal;
}

// Show Detail Modal for any Entry
window.showEntryDetail = function(index) {
  const item = currentEntries[index];
  if (!item) return;

  const modal = document.getElementById('entryDetailModal');
  const title = document.getElementById('entryModalTitle');
  const body = document.getElementById('entryModalBody');

  const row = item.raw_data || item;
  title.textContent = `Record #${item.id || ''} — Table: ${item.table_name || item.entry_type}`;

  const fields = Object.keys(row).map(key => {
    let val = row[key];
    if (val === null || val === undefined) val = '—';
    else if (typeof val === 'object') val = JSON.stringify(val, null, 2);
    else val = String(val);

    return { label: key, val };
  });

  body.innerHTML = fields.map(f => {
    let displayVal = API.escape(f.val);
    if (f.val.includes('\n') || f.val.startsWith('{') || f.val.startsWith('[')) {
      displayVal = `<pre>${API.escape(f.val)}</pre>`;
    }
    return `
      <div class="field-row">
        <div class="field-label">${API.escape(f.label)}</div>
        <div class="field-val">${displayVal}</div>
      </div>
    `;
  }).join('');

  modal.style.display = 'grid';
};

// Close modal handlers
document.getElementById('closeEntryModalBtn')?.addEventListener('click', () => {
  document.getElementById('entryDetailModal').style.display = 'none';
});

document.getElementById('entryDetailModal')?.addEventListener('click', e => {
  if (e.target.id === 'entryDetailModal') {
    document.getElementById('entryDetailModal').style.display = 'none';
  }
});

// Table select dropdown
document.getElementById('recentTableSelect')?.addEventListener('change', (e) => {
  currentRecentTableFilter = e.target.value;
  const browseBtn = document.getElementById('browseDataTableBtn');
  if (browseBtn) {
    browseBtn.href = currentRecentTableFilter !== 'all'
      ? `/tables-records.html?table=${encodeURIComponent(currentRecentTableFilter)}`
      : '/tables-records.html';
  }
  loadRecentEntries();
});

// Search input
let searchTimer;
document.getElementById('entrySearch')?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadRecentEntries, 250);
});

document.getElementById('refreshBtn')?.addEventListener('click', loadOverview);
document.getElementById('liveSyncBtn')?.addEventListener('click', loadOverview);

// Interactive Health Donut Chart
let prevDonutState = { tables: -1, rows: -1, sizeBytes: -1 };
let currentHoveredMetricId = null;

function renderHealthDonut(d) {
  const container = document.getElementById('donutSlicesGroup');
  const tooltip = document.getElementById('donutTooltip');
  const center = document.getElementById('donutCenterInfo');
  if (!container) return;

  const tables = Number(d.totalTables) || 0;
  const rows = Number(d.totalRows) || 0;
  const sizeBytes = Number(d.totalSizeBytes) || 0;
  const sizeKb = Math.max(1, Math.round(sizeBytes / 1024));

  // Update Legend Values
  const legT = document.getElementById('legendTablesVal');
  const legR = document.getElementById('legendRecordsVal');
  const legS = document.getElementById('legendSizeVal');
  if (legT) legT.textContent = API.number(tables);
  if (legR) legR.textContent = API.number(rows);
  if (legS) legS.textContent = API.bytes(sizeBytes);

  // If values haven't changed and slices exist, no need to redraw SVG
  if (
    prevDonutState.tables === tables &&
    prevDonutState.rows === rows &&
    prevDonutState.sizeBytes === sizeBytes &&
    container.children.length > 0
  ) {
    return;
  }

  prevDonutState = { tables, rows, sizeBytes };

  const metrics = [
    {
      id: 'tables',
      name: 'Total Tables',
      valueStr: `${API.number(tables)} Tables`,
      val: tables,
      centerVal: `${tables}`,
      centerLabel: 'Tables',
      color: '#3b82f6',
      desc: 'Database schemas & tables count'
    },
    {
      id: 'records',
      name: 'Total Records',
      valueStr: `${API.number(rows)} Rows`,
      val: rows,
      centerVal: `${rows}`,
      centerLabel: 'Records',
      color: '#10b981',
      desc: 'Live row entries across tables'
    },
    {
      id: 'size',
      name: 'Database Size',
      valueStr: API.bytes(sizeBytes),
      val: sizeKb,
      centerVal: `${sizeKb}KB`,
      centerLabel: 'Allocated',
      color: '#8b5cf6',
      desc: 'Data + index storage allocation'
    }
  ];

  // Proportional weight calculation:
  // Whichever is bigger takes a larger arc, with a minimum 14% arc so small items are clearly visible and hoverable
  const totalRaw = metrics.reduce((acc, m) => acc + Math.max(0.1, m.val), 0);
  const minPercent = 14;
  const remainPercent = 100 - (minPercent * metrics.length); // 58%

  metrics.forEach(m => {
    const rawRatio = Math.max(0.1, m.val) / totalRaw;
    m.percent = minPercent + (rawRatio * remainPercent);
  });

  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76104

  let accumulatedPercent = 0;
  container.innerHTML = '';

  metrics.forEach(m => {
    const dashLength = (m.percent / 100) * circumference;
    const strokeOffset = -(accumulatedPercent / 100) * circumference;
    accumulatedPercent += m.percent;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', `donut-slice slice-${m.id}`);
    circle.setAttribute('cx', '50');
    circle.setAttribute('cy', '50');
    circle.setAttribute('r', `${radius}`);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', m.color);
    circle.setAttribute('stroke-width', '12');
    circle.setAttribute('stroke-dasharray', `${dashLength.toFixed(2)} ${circumference.toFixed(2)}`);
    circle.setAttribute('stroke-dashoffset', `${strokeOffset.toFixed(2)}`);
    circle.setAttribute('data-metric', m.id);

    circle.addEventListener('mouseenter', () => highlightMetric(m.id));
    circle.addEventListener('mouseleave', resetHighlight);

    container.appendChild(circle);
  });

  ['tables', 'records', 'size'].forEach(id => {
    const chip = document.getElementById(`legend${id.charAt(0).toUpperCase() + id.slice(1)}Chip`);
    if (chip) {
      chip.onmouseenter = () => highlightMetric(id);
      chip.onmouseleave = resetHighlight;
    }
  });

  function highlightMetric(id) {
    currentHoveredMetricId = id;
    const m = metrics.find(x => x.id === id);
    if (!m) return;

    container.querySelectorAll('.donut-slice').forEach(s => {
      if (s.getAttribute('data-metric') === id) {
        s.classList.add('active-slice');
        s.classList.remove('dimmed');
      } else {
        s.classList.add('dimmed');
        s.classList.remove('active-slice');
      }
    });

    document.querySelectorAll('.legend-chip').forEach(c => {
      c.classList.toggle('active-chip', c.getAttribute('data-metric') === id);
    });

    if (center) {
      center.innerHTML = `
        <span class="donut-center-val" style="color:${m.color}">${m.centerVal}</span>
        <span class="donut-center-label">${m.centerLabel}</span>
      `;
    }

    if (tooltip) {
      document.getElementById('tooltipTitle').innerHTML = `<span style="color:${m.color}; font-size:14px;">●</span> ${m.name}`;
      document.getElementById('tooltipVal').textContent = m.valueStr;
      document.getElementById('tooltipDesc').textContent = m.desc;
      tooltip.classList.add('visible');
    }
  }

  function resetHighlight() {
    currentHoveredMetricId = null;
    container.querySelectorAll('.donut-slice').forEach(s => {
      s.classList.remove('active-slice', 'dimmed');
    });
    document.querySelectorAll('.legend-chip').forEach(c => {
      c.classList.remove('active-chip');
    });
    if (center) {
      center.innerHTML = `<span class="sync-pulse-dot" style="width:10px; height:10px;"></span>`;
    }
    if (tooltip) {
      tooltip.classList.remove('visible');
    }
  }

  // Restore active highlight if hovered when update occurred
  if (currentHoveredMetricId) {
    highlightMetric(currentHoveredMetricId);
  }
}

// Table Distribution: Responsive Expand / Collapse
let isDistributionExpanded = false;
let lastLoadedTables = [];
const DIST_COLLAPSED_LIMIT = 4;

function renderTableDistribution(rows) {
  const container = document.getElementById('distribution');
  const toggleBox = document.getElementById('distToggleBox');
  const toggleBtn = document.getElementById('btnToggleDist');
  if (!container) return;

  lastLoadedTables = rows || [];

  if (!rows || rows.length === 0) {
    container.innerHTML = '<p class="muted">No tables found.</p>';
    if (toggleBox) toggleBox.style.display = 'none';
    return;
  }

  const max = Math.max(1, ...rows.map(t => Number(t.rows || 0)));
  const shouldLimit = rows.length > DIST_COLLAPSED_LIMIT;
  const visibleRows = (shouldLimit && !isDistributionExpanded)
    ? rows.slice(0, DIST_COLLAPSED_LIMIT)
    : rows;

  container.innerHTML = visibleRows.map(t => `
    <div class="dist-row" title="Click to view records for ${API.escape(t.name)}" onclick="location.href='/tables-records.html?table=${encodeURIComponent(t.name)}'">
      <span class="dist-name"><b>${API.escape(t.name)}</b></span>
      <div class="bar"><i style="width:${Math.max(2, (Number(t.rows || 0) / max) * 100)}%"></i></div>
      <span class="dist-count">${API.number(t.rows)}</span>
    </div>
  `).join('');

  if (toggleBox && toggleBtn) {
    if (shouldLimit) {
      toggleBox.style.display = 'block';
      const hiddenCount = rows.length - DIST_COLLAPSED_LIMIT;
      toggleBtn.innerHTML = isDistributionExpanded
        ? `Show less tables ↑`
        : `Show more tables (+${hiddenCount} more) ↓`;
    } else {
      toggleBox.style.display = 'none';
    }
  }
}

document.getElementById('btnToggleDist')?.addEventListener('click', () => {
  isDistributionExpanded = !isDistributionExpanded;
  renderTableDistribution(lastLoadedTables);
});

// Initialize stat card hover animations
initStatCardHoverAnimations();

// Initial load and live 1-second polling from database
loadOverview();
setInterval(() => {
  loadOverview();
}, 1000);
