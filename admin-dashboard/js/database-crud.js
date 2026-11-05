let allTablesList = [];
let currentSelectedTable = '';
let currentTableSchema = null;
let confirmCallback = null;

// Initialize Page
async function initDatabaseCrud() {
  setupTabs();
  setupColumnBuilder();
  await loadTablesList();

  // Check URL param if table passed
  const params = new URLSearchParams(window.location.search);
  const requestedTable = params.get('table');
  if (requestedTable && allTablesList.some(t => t.name === requestedTable)) {
    selectTable(requestedTable);
  } else if (allTablesList.length > 0) {
    selectTable(allTablesList[0].name);
  }
}

// Tab Switching
function setupTabs() {
  const tabs = document.querySelectorAll('.crud-tab-btn');
  const sections = document.querySelectorAll('.crud-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      tab.classList.add('active');
      const targetSection = document.getElementById(tab.getAttribute('data-tab'));
      if (targetSection) targetSection.classList.add('active');

      if (tab.id === 'tabBtnRecords') {
        loadRecordsTab();
      }
    });
  });
}

// Load Tables List from Backend
async function loadTablesList() {
  try {
    const data = await API.request('/tables');
    allTablesList = data.tables || [];

    const manageSelect = document.getElementById('manageTableSelect');
    const recordsSelect = document.getElementById('recordsTableSelect');

    const optionsHtml = allTablesList.length
      ? allTablesList.map(t => `<option value="${API.escape(t.name)}">${API.escape(t.name)} (${API.number(t.rows)} rows)</option>`).join('')
      : '<option value="">No tables available</option>';

    if (manageSelect) {
      manageSelect.innerHTML = optionsHtml;
      manageSelect.value = currentSelectedTable || (allTablesList[0] ? allTablesList[0].name : '');
    }
    if (recordsSelect) {
      recordsSelect.innerHTML = optionsHtml;
      recordsSelect.value = currentSelectedTable || (allTablesList[0] ? allTablesList[0].name : '');
    }
  } catch (err) {
    showCrudAlert(err.message || 'Failed to load tables', false);
  }
}

// Select a Table to Inspect / Manage
document.getElementById('manageTableSelect')?.addEventListener('change', e => {
  selectTable(e.target.value);
});

async function selectTable(tableName) {
  if (!tableName) return;
  currentSelectedTable = tableName;
  const manageSelect = document.getElementById('manageTableSelect');
  if (manageSelect) manageSelect.value = tableName;

  const recordsSelect = document.getElementById('recordsTableSelect');
  if (recordsSelect) recordsSelect.value = tableName;

  const tableMeta = allTablesList.find(t => t.name === tableName);
  const metaCard = document.getElementById('tableMetaCard');
  if (metaCard && tableMeta) {
    metaCard.style.display = 'block';
    document.getElementById('metaTableName').textContent = tableMeta.name;
    document.getElementById('metaTableEngine').textContent = tableMeta.engine || 'InnoDB';
    document.getElementById('metaTableRowCount').textContent = API.number(tableMeta.rows);
    document.getElementById('metaTableDataSize').textContent = API.bytes(tableMeta.dataBytes);
  }

  // Load Columns Schema
  await loadTableSchema(tableName);
}

// Fetch Columns Schema
async function loadTableSchema(tableName) {
  const tbody = document.getElementById('manageColumnsTbody');
  tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading column schema…</td></tr>';

  try {
    const data = await API.request(`/tables/${encodeURIComponent(tableName)}/schema`);
    currentTableSchema = data;
    const columns = data.columns || [];

    document.getElementById('columnCountBadge').textContent = `${columns.length} columns`;

    if (columns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No columns found.</td></tr>';
      return;
    }

    tbody.innerHTML = columns.map(col => {
      const isPk = col.key === 'PRI';
      const isSystemTable = tableName === 'admin_users';
      const canDrop = !isPk && !(isSystemTable && ['email', 'password_hash'].includes(col.name));

      const dropBtn = canDrop
        ? `<button type="button" class="btn" style="padding:4px 8px; font-size:11px; color:#ef4444; border-color:#fca5a5;" onclick="confirmDropColumn('${API.escape(col.name)}')">🗑️ Drop</button>`
        : `<span class="muted" style="font-size:11px;">Protected</span>`;

      return `
        <tr>
          <td><b style="color:#0f172a;">${API.escape(col.name)}</b></td>
          <td><code>${API.escape(col.type)}</code></td>
          <td>${isPk ? '<span class="pill" style="background:#e0e7ff; color:#3730a3; font-weight:800;">PRIMARY</span>' : (col.key ? `<span class="pill">${API.escape(col.key)}</span>` : '—')}</td>
          <td>${col.nullable ? '<span style="color:#10b981;">YES</span>' : '<span style="color:#f59e0b; font-weight:600;">NO</span>'}</td>
          <td>${col.default !== null && col.default !== undefined ? API.escape(col.default) : '<span class="muted">None</span>'}</td>
          <td>${dropBtn}</td>
        </tr>
      `;
    }).join('');

    // Update Position Dropdown in "Add Column" form
    const posSelect = document.getElementById('addColPosition');
    if (posSelect) {
      posSelect.innerHTML = '<option value="">At the end</option><option value="FIRST">FIRST (at beginning)</option>' +
        columns.map(c => `<option value="${API.escape(c.name)}">AFTER ${API.escape(c.name)}</option>`).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="error">${API.escape(err.message || 'Failed to load schema')}</td></tr>`;
  }
}

// Add Column Form Submission
document.getElementById('formAddColumn')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentSelectedTable) {
    showCrudAlert('Please select a table first.', false);
    return;
  }

  const name = document.getElementById('addColName').value.trim();
  const type = document.getElementById('addColType').value;
  const nullable = document.getElementById('addColNullable').value === 'yes';
  const defVal = document.getElementById('addColDefault').value.trim();
  const pos = document.getElementById('addColPosition').value;

  const btn = document.getElementById('btnAddColumnBtn');
  btn.disabled = true;
  btn.textContent = 'Adding…';
  clearCrudAlert();

  try {
    await API.request('/schema/add-column', {
      method: 'POST',
      body: JSON.stringify({
        tableName: currentSelectedTable,
        columnName: name,
        columnType: type,
        nullable: nullable,
        defaultValue: defVal || undefined,
        afterColumn: pos && pos !== 'FIRST' ? pos : undefined
      })
    });

    showCrudAlert(`Column "${name}" added to "${currentSelectedTable}" successfully!`, true);
    document.getElementById('addColName').value = '';
    document.getElementById('addColDefault').value = '';
    await loadTableSchema(currentSelectedTable);
  } catch (err) {
    showCrudAlert(err.message || 'Failed to add column.', false);
  } finally {
    btn.disabled = false;
    btn.textContent = '➕ Add Column';
  }
});

// Drop Column Handler
window.confirmDropColumn = function(colName) {
  openConfirmModal(
    'Confirm Column Deletion',
    `Are you sure you want to drop column <b>"${API.escape(colName)}"</b> from table <b>"${API.escape(currentSelectedTable)}"</b>? All data in this column will be permanently removed.`,
    async () => {
      try {
        await API.request('/schema/drop-column', {
          method: 'DELETE',
          body: JSON.stringify({ tableName: currentSelectedTable, columnName: colName })
        });
        showCrudAlert(`Column "${colName}" removed successfully!`, true);
        await loadTableSchema(currentSelectedTable);
      } catch (err) {
        showCrudAlert(err.message || 'Failed to drop column.', false);
      }
    }
  );
};

// Drop Table Handler
document.getElementById('btnDropTable')?.addEventListener('click', () => {
  if (!currentSelectedTable) return;
  if (currentSelectedTable === 'admin_users') {
    showCrudAlert("Cannot drop the 'admin_users' table as it holds admin credentials.", false);
    return;
  }

  openConfirmModal(
    '🚨 DROP TABLE PERMANENTLY',
    `Are you absolutely sure you want to drop table <b>"${API.escape(currentSelectedTable)}"</b>? All rows, data, and schema definitions will be permanently erased!`,
    async () => {
      try {
        await API.request(`/schema/drop-table/${encodeURIComponent(currentSelectedTable)}`, {
          method: 'DELETE'
        });
        showCrudAlert(`Table "${currentSelectedTable}" has been dropped!`, true);
        currentSelectedTable = '';
        await loadTablesList();
        if (allTablesList.length > 0) {
          selectTable(allTablesList[0].name);
        }
      } catch (err) {
        showCrudAlert(err.message || 'Failed to drop table.', false);
      }
    }
  );
});

// ==========================================
// SECTION 2: CREATE NEW TABLE LOGIC
// ==========================================
let builderRows = [];

function setupColumnBuilder() {
  builderRows = [
    { name: 'id', type: 'INT', nullable: false, isPrimary: true, autoIncrement: true, defaultValue: '' },
    { name: 'name', type: 'VARCHAR(255)', nullable: false, isPrimary: false, autoIncrement: false, defaultValue: '' },
    { name: 'created_at', type: 'TIMESTAMP', nullable: false, isPrimary: false, autoIncrement: false, defaultValue: 'CURRENT_TIMESTAMP' }
  ];
  renderBuilderRows();

  document.getElementById('btnAddBuilderRow')?.addEventListener('click', () => {
    builderRows.push({
      name: '',
      type: 'VARCHAR(255)',
      nullable: true,
      isPrimary: false,
      autoIncrement: false,
      defaultValue: ''
    });
    renderBuilderRows();
  });

  document.getElementById('inputNewTableName')?.addEventListener('input', updateSqlPreview);
}

function renderBuilderRows() {
  const container = document.getElementById('colBuilderContainer');
  if (!container) return;

  container.innerHTML = builderRows.map((row, idx) => `
    <div class="col-builder-row">
      <input type="text" placeholder="column_name" value="${API.escape(row.name)}" oninput="updateBuilderField(${idx}, 'name', this.value)" style="width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:7px;" required>
      
      <select onchange="updateBuilderField(${idx}, 'type', this.value)" style="width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:7px;">
        <option value="INT" ${row.type === 'INT' ? 'selected' : ''}>INT</option>
        <option value="BIGINT" ${row.type === 'BIGINT' ? 'selected' : ''}>BIGINT</option>
        <option value="VARCHAR(255)" ${row.type === 'VARCHAR(255)' ? 'selected' : ''}>VARCHAR(255)</option>
        <option value="VARCHAR(100)" ${row.type === 'VARCHAR(100)' ? 'selected' : ''}>VARCHAR(100)</option>
        <option value="TEXT" ${row.type === 'TEXT' ? 'selected' : ''}>TEXT</option>
        <option value="BOOLEAN" ${row.type === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
        <option value="DECIMAL(10,2)" ${row.type === 'DECIMAL(10,2)' ? 'selected' : ''}>DECIMAL(10,2)</option>
        <option value="DATETIME" ${row.type === 'DATETIME' ? 'selected' : ''}>DATETIME</option>
        <option value="TIMESTAMP" ${row.type === 'TIMESTAMP' ? 'selected' : ''}>TIMESTAMP</option>
        <option value="JSON" ${row.type === 'JSON' ? 'selected' : ''}>JSON</option>
      </select>

      <label style="font-size:12px; display:flex; align-items:center; gap:4px; cursor:pointer;">
        <input type="checkbox" ${row.nullable ? 'checked' : ''} onchange="updateBuilderField(${idx}, 'nullable', this.checked)"> NULL
      </label>

      <label style="font-size:12px; display:flex; align-items:center; gap:4px; cursor:pointer;">
        <input type="checkbox" ${row.isPrimary ? 'checked' : ''} onchange="updateBuilderField(${idx}, 'isPrimary', this.checked)"> PK
      </label>

      <label style="font-size:12px; display:flex; align-items:center; gap:4px; cursor:pointer;">
        <input type="checkbox" ${row.autoIncrement ? 'checked' : ''} onchange="updateBuilderField(${idx}, 'autoIncrement', this.checked)"> Auto
      </label>

      <input type="text" placeholder="Default" value="${API.escape(row.defaultValue)}" oninput="updateBuilderField(${idx}, 'defaultValue', this.value)" style="width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:7px;">

      <button type="button" class="btn" style="padding:4px 8px; color:#ef4444; border-color:#fecaca;" onclick="removeBuilderRow(${idx})" title="Remove column">✕</button>
    </div>
  `).join('');

  updateSqlPreview();
}

window.updateBuilderField = function(idx, field, val) {
  if (builderRows[idx]) {
    builderRows[idx][field] = val;
    updateSqlPreview();
  }
};

window.removeBuilderRow = function(idx) {
  if (builderRows.length <= 1) {
    showCrudAlert('At least one column is required in a table.', false);
    return;
  }
  builderRows.splice(idx, 1);
  renderBuilderRows();
};

function updateSqlPreview() {
  const preview = document.getElementById('sqlPreviewBox');
  const tName = document.getElementById('inputNewTableName')?.value.trim() || 'table_name';

  const colSqls = [];
  const pks = [];

  builderRows.forEach(r => {
    const cName = r.name.trim() || 'col';
    let s = `  \`${cName}\` ${r.type}`;
    if (r.autoIncrement) s += ' AUTO_INCREMENT';
    if (!r.nullable) s += ' NOT NULL';
    if (r.defaultValue) s += ` DEFAULT '${r.defaultValue}'`;
    if (r.isPrimary) pks.push(`\`${cName}\``);
    colSqls.push(s);
  });

  if (pks.length) {
    colSqls.push(`  PRIMARY KEY (${pks.join(', ')})`);
  }

  preview.textContent = `CREATE TABLE \`${tName}\` (\n${colSqls.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
}

// Submit Create Table Form
document.getElementById('formCreateTable')?.addEventListener('submit', async e => {
  e.preventDefault();
  const tName = document.getElementById('inputNewTableName').value.trim();
  if (!tName) return;

  const validColumns = builderRows.filter(r => r.name.trim().length > 0);
  if (validColumns.length === 0) {
    showCrudAlert('Please specify valid column names.', false);
    return;
  }

  const btn = document.getElementById('btnSubmitCreateTable');
  btn.disabled = true;
  btn.textContent = 'Creating Table…';
  clearCrudAlert();

  try {
    const res = await API.request('/schema/create-table', {
      method: 'POST',
      body: JSON.stringify({
        tableName: tName,
        columns: validColumns
      })
    });

    showCrudAlert(res.message || `Table "${tName}" created successfully!`, true);
    document.getElementById('inputNewTableName').value = '';

    await loadTablesList();
    selectTable(tName);

    // Switch to Manage tab
    document.getElementById('tabBtnManage').click();
  } catch (err) {
    showCrudAlert(err.message || 'Failed to create table.', false);
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Create Table';
  }
});

// ==========================================
// SECTION 3: RECORD CRUD LOGIC
// ==========================================
document.getElementById('recordsTableSelect')?.addEventListener('change', e => {
  currentSelectedTable = e.target.value;
  loadRecordsTab();
});

async function loadRecordsTab() {
  const tName = currentSelectedTable || (allTablesList[0] ? allTablesList[0].name : '');
  if (!tName) return;

  const thead = document.getElementById('recordsThead');
  const tbody = document.getElementById('recordsTbody');
  tbody.innerHTML = '<tr><td colspan="3" class="muted">Loading records…</td></tr>';

  try {
    const data = await API.request(`/tables/${encodeURIComponent(tName)}/records?limit=25`);
    const cols = data.columns || [];
    const rows = data.records || [];

    if (cols.length === 0) {
      thead.innerHTML = '<tr><th>No Columns</th></tr>';
      tbody.innerHTML = '<tr><td class="muted">Table has no columns.</td></tr>';
      return;
    }

    thead.innerHTML = `<tr>${cols.map(c => `<th>${API.escape(c)}</th>`).join('')}<th>Action</th></tr>`;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" class="muted" style="text-align:center; padding:30px;">No records found in table "${API.escape(tName)}". Click "+ Insert New Record" to add one!</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const recordId = r.id || r[cols[0]];
      const cells = cols.map(c => {
        const val = r[c];
        if (val === null || val === undefined) return '<span class="muted">NULL</span>';
        const str = String(val);
        return `<td>${API.escape(str.length > 60 ? str.slice(0, 60) + '…' : str)}</td>`;
      }).join('');

      return `
        <tr>
          ${cells}
          <td>
            <button type="button" class="btn" style="padding:4px 8px; font-size:11px; color:#ef4444; border-color:#fca5a5;" onclick="confirmDeleteRecord('${API.escape(recordId)}')">
              🗑️ Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="error">${API.escape(err.message || 'Failed to load records')}</td></tr>`;
  }
}

// Delete Record
window.confirmDeleteRecord = function(recordId) {
  openConfirmModal(
    'Delete Record',
    `Are you sure you want to delete record with identifier <b>#${API.escape(recordId)}</b> from table <b>"${API.escape(currentSelectedTable)}"</b>?`,
    async () => {
      try {
        await API.request(`/tables/${encodeURIComponent(currentSelectedTable)}/records/${encodeURIComponent(recordId)}`, {
          method: 'DELETE'
        });
        showCrudAlert(`Record #${recordId} deleted successfully!`, true);
        await loadRecordsTab();
        await loadTablesList();
      } catch (err) {
        showCrudAlert(err.message || 'Failed to delete record.', false);
      }
    }
  );
};

// Insert Record Modal
document.getElementById('btnOpenInsertModal')?.addEventListener('click', async () => {
  if (!currentSelectedTable) return;
  const modal = document.getElementById('insertRecordModal');
  const container = document.getElementById('insertFieldsContainer');
  document.getElementById('insertModalTitle').textContent = `➕ Insert Record into "${currentSelectedTable}"`;
  clearAlert('insertModalAlert');

  try {
    const data = await API.request(`/tables/${encodeURIComponent(currentSelectedTable)}/schema`);
    const cols = data.columns || [];

    // Filter out auto increment columns from manual insert
    const insertableCols = cols.filter(c => c.extra !== 'auto_increment');

    container.innerHTML = insertableCols.map(c => `
      <label style="font-size:13px; font-weight:700; color:#334155;">
        ${API.escape(c.name)} <small class="muted">(${API.escape(c.type)})</small>
        <input type="text" name="${API.escape(c.name)}" placeholder="${c.nullable ? 'Optional (NULL)' : 'Required'}" ${c.nullable ? '' : 'required'} style="width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:9px; margin-top:4px;">
      </label>
    `).join('');

    modal.style.display = 'grid';
  } catch (err) {
    showCrudAlert(err.message || 'Failed to inspect table columns', false);
  }
});

document.getElementById('closeInsertModalBtn')?.addEventListener('click', () => {
  document.getElementById('insertRecordModal').style.display = 'none';
});

document.getElementById('formInsertRecord')?.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = {};
  formData.forEach((val, key) => {
    data[key] = val.trim();
  });

  const btn = document.getElementById('btnSubmitInsertRecord');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await API.request(`/tables/${encodeURIComponent(currentSelectedTable)}/records`, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    document.getElementById('insertRecordModal').style.display = 'none';
    showCrudAlert('Record inserted successfully!', true);
    await loadRecordsTab();
    await loadTablesList();
  } catch (err) {
    showAlert('insertModalAlert', err.message || 'Failed to insert record', false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Record';
  }
});

// Confirmation Modal Helper
function openConfirmModal(title, text, onConfirm) {
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').innerHTML = title;
  document.getElementById('confirmModalText').innerHTML = text;
  confirmCallback = onConfirm;
  modal.style.display = 'grid';
}

document.getElementById('closeConfirmModalBtn')?.addEventListener('click', () => {
  document.getElementById('confirmModal').style.display = 'none';
  confirmCallback = null;
});
document.getElementById('cancelConfirmBtn')?.addEventListener('click', () => {
  document.getElementById('confirmModal').style.display = 'none';
  confirmCallback = null;
});
document.getElementById('proceedConfirmBtn')?.addEventListener('click', async () => {
  document.getElementById('confirmModal').style.display = 'none';
  if (typeof confirmCallback === 'function') {
    await confirmCallback();
    confirmCallback = null;
  }
});

// Alerts
function showCrudAlert(msg, isSuccess = true) {
  const el = document.getElementById('crudAlert');
  if (!el) return;
  el.className = `status-msg ${isSuccess ? 'success' : 'error'}`;
  el.textContent = msg;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearCrudAlert() {
  const el = document.getElementById('crudAlert');
  if (el) { el.className = 'status-msg'; el.textContent = ''; }
}

function showAlert(elId, msg, isSuccess = true) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = `status-msg ${isSuccess ? 'success' : 'error'}`;
  el.textContent = msg;
}

function clearAlert(elId) {
  const el = document.getElementById(elId);
  if (el) { el.className = 'status-msg'; el.textContent = ''; }
}

// Run
initDatabaseCrud();

