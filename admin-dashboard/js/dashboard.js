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

    const max = Math.max(1, ...rows.map(t => Number(t.rows || 0)));
    document.getElementById('distribution').innerHTML = rows.map(t => `
      <div class="dist-row">
        <span class="dist-name"><b>${API.escape(t.name)}</b></span>
        <div class="bar"><i style="width:${Math.max(2, Number(t.rows || 0) / max * 100)}%"></i></div>
        <span class="dist-count">${API.number(t.rows)}</span>
      </div>
    `).join('') || '<p class="muted">No tables found.</p>';

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

// Initial load and live 1-second polling from database
loadOverview();
setInterval(() => {
  loadOverview();
}, 1000);
