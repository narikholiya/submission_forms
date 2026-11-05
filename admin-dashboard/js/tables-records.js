let tables = [], selected = '', page = 1, total = 0, columns = [], currentRows = [];
const limit = 25;

async function init() {
  try {
    const d = await API.request('/tables');
    tables = d.tables || [];
    document.getElementById('tableChips').innerHTML = tables.map(t =>
      `<button class="chip" data-table="${API.escape(t.name)}">${API.escape(t.name)} <small>${API.number(t.rows)}</small></button>`
    ).join('') || 'No tables found';

    document.querySelectorAll('[data-table]').forEach(b =>
      b.addEventListener('click', () => selectTable(b.dataset.table))
    );

    const wanted = new URLSearchParams(location.search).get('table');
    if (wanted && tables.some(t => t.name === wanted)) {
      selectTable(wanted);
    } else if (tables.length > 0) {
      selectTable(tables[0].name);
    }
  } catch (e) {
    document.getElementById('pageError').textContent = e.message;
  }
}

async function selectTable(name) {
  selected = name;
  page = 1;
  document.querySelectorAll('[data-table]').forEach(b =>
    b.classList.toggle('active', b.dataset.table === name)
  );
  document.getElementById('selectedTable').textContent = name;
  document.getElementById('recordSearch').disabled = false;
  document.getElementById('exportBtn').disabled = false;
  await loadRecords();
}

async function loadRecords() {
  try {
    const q = new URLSearchParams({
      page,
      limit,
      search: document.getElementById('recordSearch').value
    });
    const d = await API.request(`/tables/${encodeURIComponent(selected)}/records?${q}`);
    columns = d.columns || [];
    currentRows = d.records || [];
    total = d.total || 0;

    document.getElementById('tableMeta').textContent = `${API.number(total)} matching records · ${columns.length} columns · Page ${page}`;
    
    // Header includes an Action column for Details
    document.getElementById('recordsHead').innerHTML = '<tr>' +
      columns.map(c => `<th>${API.escape(c)}</th>`).join('') +
      '<th>Action</th></tr>';

    if (!currentRows.length) {
      document.getElementById('recordsBody').innerHTML = `<tr><td colspan="${Math.max(1, columns.length + 1)}" class="muted">No records found.</td></tr>`;
    } else {
      document.getElementById('recordsBody').innerHTML = currentRows.map((row, idx) => {
        const cells = columns.map(c => {
          const val = row[c];
          let formatted;
          if (val === null || val === undefined) {
            formatted = '<span class="muted">NULL</span>';
          } else if (typeof val === 'object') {
            formatted = `<code>${API.escape(JSON.stringify(val))}</code>`;
          } else {
            const str = String(val);
            formatted = str.length > 50 ? `${API.escape(str.slice(0, 50))}…` : API.escape(str);
          }
          return `<td>${formatted}</td>`;
        }).join('');

        return `<tr>${cells}<td><button class="btn" style="padding:4px 9px; font-size:12px;" onclick="showRecordDetail(${idx})">🔍 Details</button></td></tr>`;
      }).join('');
    }

    document.getElementById('pageInfo').textContent = `Showing ${total ? ((page - 1) * limit + 1) : 0}–${Math.min(page * limit, total)} of ${API.number(total)}`;
    document.getElementById('prevPage').disabled = page <= 1;
    document.getElementById('nextPage').disabled = page * limit >= total;
  } catch (e) {
    document.getElementById('pageError').textContent = e.message;
  }
}

window.showRecordDetail = function(index) {
  const row = currentRows[index];
  if (!row) return;

  const modal = document.getElementById('detailModal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');

  title.textContent = `${selected} — Record #${row.id ?? (index + 1)}`;
  body.innerHTML = columns.map(col => {
    const val = row[col];
    let displayHtml = '';
    if (val === null || val === undefined) {
      displayHtml = '<span class="muted">NULL</span>';
    } else if (typeof val === 'object') {
      displayHtml = `<pre>${API.escape(JSON.stringify(val, null, 2))}</pre>`;
    } else {
      try {
        // Test if value is JSON string
        if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
          const parsed = JSON.parse(val);
          displayHtml = `<pre>${API.escape(JSON.stringify(parsed, null, 2))}</pre>`;
        } else {
          displayHtml = API.escape(String(val));
        }
      } catch {
        displayHtml = API.escape(String(val));
      }
    }

    return `
      <div class="field-row">
        <div class="field-label">${API.escape(col)}</div>
        <div class="field-val">${displayHtml}</div>
      </div>
    `;
  }).join('');

  modal.style.display = 'grid';
};

document.getElementById('closeModalBtn').addEventListener('click', () => {
  document.getElementById('detailModal').style.display = 'none';
});

document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target.id === 'detailModal') {
    document.getElementById('detailModal').style.display = 'none';
  }
});

let searchTimer;
document.getElementById('recordSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page = 1;
    loadRecords();
  }, 300);
});

document.getElementById('prevPage').addEventListener('click', () => {
  if (page > 1) {
    page--;
    loadRecords();
  }
});

document.getElementById('nextPage').addEventListener('click', () => {
  page++;
  loadRecords();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  if (!currentRows.length) return;
  const csv = [columns, ...currentRows.map(r => columns.map(c => r[c] ?? ''))]
    .map(row => row.map(v => '"' + String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/"/g, '""') + '"').join(','))
    .join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${selected}-page-${page}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

init();
