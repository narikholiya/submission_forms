let currentEntries = [];
let currentFilter = 'all';

let isOverviewLoading = false;

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

    document.getElementById('totalTables').textContent = API.number(d.totalTables);
    document.getElementById('totalRows').textContent = API.number(d.totalRows);
    document.getElementById('dbSize').textContent = API.bytes(d.totalSizeBytes);
    document.getElementById('dbVersion').textContent = d.version;
    document.getElementById('dbEngine').textContent = 'Default engine: ' + (d.defaultEngine || '—');
    document.getElementById('healthBadge').textContent = 'Connected';
    document.getElementById('healthBadge').className = 'status ok';
    document.getElementById('healthText').textContent = 'MySQL connection is healthy';
    document.getElementById('healthSub').textContent = 'Live response from backend';
    
    document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
    renderHealthDonut(d);

    const rows = d.tables || [];
    document.getElementById('tablesBody').innerHTML = rows.map(t => `
      <tr>
        <td><b>${API.escape(t.name)}</b></td>
        <td>${API.escape(t.engine || '—')}</td>
        <td><span class="pill" style="font-weight:bold;">${API.number(t.rows)}</span></td>
        <td>${API.bytes(t.dataBytes)}</td>
        <td>${API.bytes(t.indexBytes)}</td>
        <td>
          <a class="btn" style="padding:4px 8px; font-size:12px; margin-right:4px;" href="/tables-records.html?table=${encodeURIComponent(t.name)}">View Records</a>
          <a class="btn" style="padding:4px 8px; font-size:12px;" href="/table-details.html?table=${encodeURIComponent(t.name)}">Schema →</a>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6">No tables found.</td></tr>';

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
    const searchVal = document.getElementById('entrySearch') ? document.getElementById('entrySearch').value : '';
    const q = new URLSearchParams({
      type: currentFilter,
      search: searchVal,
      limit: 50
    });

    const data = await API.request(`/recent-entries?${q}`);
    currentEntries = data.entries || [];

    if (countBadge) {
      countBadge.textContent = `${currentEntries.length} entries`;
    }

    if (!currentEntries.length) {
      container.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center; padding:20px;">No entries found. Submit a form at <a href="http://localhost:5000" target="_blank" style="color:#245ff4; font-weight:600;">the Public Forms page</a> to test real-time synchronization!</td></tr>';
      return;
    }

    container.innerHTML = currentEntries.map((e, idx) => {
      const isSub = e.entry_type === 'submission';
      const typeBadge = isSub
        ? `<span class="pill" style="background:#eef4ff; color:#2563eb;">Form: ${API.escape(e.form_type || 'general')}</span>`
        : `<span class="pill" style="background:#fdf4ff; color:#c026d3;">Career: ${API.escape(e.form_type || 'App')}</span>`;

      const statusBadge = e.isNew
        ? `<span class="new-badge"><span class="new-dot"></span> NEW</span>`
        : `<span class="muted" style="font-size:11px;">archived</span>`;

      const summaryText = e.subject || e.message || e.plan || '—';

      return `
        <tr>
          <td>${statusBadge}</td>
          <td>${typeBadge}</td>
          <td><b>${API.escape(e.name || '—')}</b></td>
          <td>${API.escape(e.email)}</td>
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

// Show Detail Modal for any Entry
window.showEntryDetail = function(index) {
  const item = currentEntries[index];
  if (!item) return;

  const modal = document.getElementById('entryDetailModal');
  const title = document.getElementById('entryModalTitle');
  const body = document.getElementById('entryModalBody');

  const typeLabel = item.entry_type === 'career' ? 'Career Application' : 'Form Submission';
  title.textContent = `${typeLabel} #${item.id} — ${item.name || item.email}`;

  const fields = [
    { label: "Record ID", val: `#${item.id}` },
    { label: "Entry Type", val: typeLabel },
    { label: "Category / Form Type", val: item.form_type },
    { label: "Full Name", val: item.name },
    { label: "Email Address", val: item.email },
    { label: "Phone", val: item.phone },
    { label: "Company / Role", val: item.company },
    { label: "Location / Experience", val: item.location },
    { label: "Subject / Position", val: item.subject },
    { label: "Message / Notes", val: item.message },
    { label: "Plan / Resume Name", val: item.plan },
    { label: "Product / Cover Letter", val: item.product },
    { label: "Currency", val: item.currency },
    { label: "Extra Data (JSON)", val: item.extra },
    { label: "Addons (JSON)", val: item.addons },
    { label: "Submitted Timestamp", val: item.created_at ? new Date(item.created_at).toLocaleString() : null }
  ];

  body.innerHTML = fields.map(f => {
    let displayVal = '<span class="muted">None</span>';
    if (f.val !== null && f.val !== undefined && f.val !== '') {
      if (typeof f.val === 'object') {
        displayVal = `<pre>${API.escape(JSON.stringify(f.val, null, 2))}</pre>`;
      } else {
        try {
          if (typeof f.val === 'string' && (f.val.startsWith('{') || f.val.startsWith('['))) {
            const parsed = JSON.parse(f.val);
            displayVal = `<pre>${API.escape(JSON.stringify(parsed, null, 2))}</pre>`;
          } else {
            displayVal = API.escape(String(f.val));
          }
        } catch {
          displayVal = API.escape(String(f.val));
        }
      }
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

// Filter pills
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    loadRecentEntries();
  });
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

// Initial load and live 1-second polling from database
loadOverview();
setInterval(() => {
  loadOverview();
}, 1000);
