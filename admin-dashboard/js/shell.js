let currentUserProfile = null;
let currentDatabaseName = 'form_management';

// Initialize Admin Profile in Sidebar and Settings Modal
async function initAdminShell() {
  try {
    currentUserProfile = await API.request('/profile');
    
    // Also fetch database name if available
    API.request('/overview').then(d => {
      if (d && d.database) {
        currentDatabaseName = d.database;
        const sideDb = document.getElementById('sideDbName');
        if (sideDb) sideDb.textContent = d.database;
      }
    }).catch(() => {});

    renderSidebarProfile(currentUserProfile);
    injectSettingsModal();
  } catch (err) {
    console.warn("Shell profile load error:", err.message);
  }
}

function renderSidebarProfile(user) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Remove .side-bottom ("Connected workspace") completely
  sidebar.querySelectorAll('.side-bottom').forEach(el => el.remove());

  // Remove existing profile card if any
  const existing = document.getElementById('adminSideProfile');
  if (existing) existing.remove();

  const avatarContent = user.avatar_url
    ? `<img src="${API.escape(user.avatar_url)}" alt="Avatar" class="admin-avatar">`
    : `<div class="admin-avatar">${API.escape((user.name || user.email || 'A')[0].toUpperCase())}</div>`;

  const profileCard = document.createElement('div');
  profileCard.id = 'adminSideProfile';
  profileCard.className = 'admin-profile-card';
  profileCard.innerHTML = `
    <div class="profile-meta">
      ${avatarContent}
      <div class="admin-user-details">
        <b id="sideAdminName" title="${API.escape(user.name || 'Admin')}">${API.escape(user.name || 'Administrator')}</b>
        <small id="sideAdminEmail" title="${API.escape(user.email)}">${API.escape(user.email)}</small>
      </div>
    </div>
    <div class="profile-actions">
      <button type="button" id="openSettingsBtn">⚙️ Settings</button>
      <button type="button" id="sideLogoutBtn">Sign Out</button>
    </div>
    <div class="sync-badge-box">
      <span class="sync-pulse-dot"></span>
      <b id="sideDbName">${API.escape(currentDatabaseName)}</b>
    </div>
  `;

  // Append at the bottom of the sidebar
  sidebar.appendChild(profileCard);

  // Hook up buttons
  document.getElementById('openSettingsBtn')?.addEventListener('click', openSettingsModal);
  document.getElementById('sideLogoutBtn')?.addEventListener('click', handleLogout);
}

// Background sync every 1 second (1000ms)
let isPinging = false;
async function pingSync() {
  if (isPinging) return;
  isPinging = true;
  try {
    const d = await API.request('/overview');
    if (d && d.database) {
      currentDatabaseName = d.database;
      const sideDb = document.getElementById('sideDbName');
      if (sideDb) sideDb.textContent = d.database;
    }
  } catch (err) {
    // silent
  } finally {
    isPinging = false;
  }
}

pingSync();
setInterval(pingSync, 1000);

// Injects the Admin Settings Modal (Rename, Password, Avatar)
function injectSettingsModal() {
  if (document.getElementById('adminSettingsModal')) return;

  const modal = document.createElement('div');
  modal.id = 'adminSettingsModal';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-card" style="max-width: 520px;">
      <div class="modal-head">
        <h3 style="margin:0; font-size: 17px;">⚙️ Admin Profile Settings</h3>
        <button class="btn" id="closeSettingsModalBtn" style="padding: 4px 10px; font-weight: bold;">✕</button>
      </div>
      <div class="modal-body">
        <!-- Settings Tabs -->
        <div class="filter-pills" style="margin-bottom: 12px; gap: 6px;">
          <button type="button" class="filter-pill active" id="tabSettingsRename">👤 Rename Profile</button>
          <button type="button" class="filter-pill" id="tabSettingsPassword">🔑 Change Password</button>
          <button type="button" class="filter-pill" id="tabSettingsAvatar">🖼️ Profile Avatar</button>
        </div>

        <div id="settingsAlert" class="status-msg" style="margin: 0 0 14px 0;"></div>

        <!-- Section 1: Rename -->
        <form id="renameForm" style="display: grid; gap: 14px;">
          <label>Display Name
            <input type="text" id="renameInput" placeholder="Enter new display name" required style="width:100%; border:1px solid #dfe5ee; border-radius:10px; padding:10px; margin-top:4px;">
          </label>
          <label>Admin Email
            <input type="text" id="renameEmailInput" disabled style="width:100%; border:1px solid #dfe5ee; background:#f8fafc; border-radius:10px; padding:10px; margin-top:4px; color:#64748b;">
          </label>
          <button class="btn primary full" type="submit" id="saveRenameBtn">Save Changes</button>
        </form>

        <!-- Section 2: Change Password -->
        <form id="passwordForm" style="display: none; gap: 14px;">
          <label>Current Password
            <div class="pwd-wrapper" style="margin-top:4px;">
              <input type="password" id="currPwdInput" placeholder="Current password" required style="width:100%; border:1px solid #dfe5ee; border-radius:10px; padding:10px;">
              <button type="button" class="pwd-toggle" data-target="currPwdInput">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </label>
          <label>New Password (min 6 characters)
            <div class="pwd-wrapper" style="margin-top:4px;">
              <input type="password" id="newPwdInput" placeholder="New password" minlength="6" required style="width:100%; border:1px solid #dfe5ee; border-radius:10px; padding:10px;">
              <button type="button" class="pwd-toggle" data-target="newPwdInput">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </label>
          <label>Confirm New Password
            <div class="pwd-wrapper" style="margin-top:4px;">
              <input type="password" id="confirmPwdInput" placeholder="Confirm new password" minlength="6" required style="width:100%; border:1px solid #dfe5ee; border-radius:10px; padding:10px;">
              <button type="button" class="pwd-toggle" data-target="confirmPwdInput">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </label>
          <button class="btn primary full" type="submit" id="savePasswordBtn">Update Password</button>
        </form>

        <!-- Section 3: Profile Avatar -->
        <form id="avatarForm" style="display: none; gap: 14px;">
          <div style="display:flex; align-items:center; gap:16px;">
            <div id="avatarPreviewBox" style="width:64px; height:64px; border-radius:50%; background:#e2e8f0; display:grid; place-items:center; overflow:hidden; border:2px solid #cbd5e1; flex-shrink:0;">
              <span id="avatarPreviewInitials" style="font-weight:bold; font-size:20px; color:#475569;">A</span>
              <img id="avatarPreviewImg" style="display:none; width:100%; height:100%; object-fit:cover;">
            </div>
            <div>
              <p style="margin:0 0 4px; font-size:13px; font-weight:700;">Profile Picture</p>
              <small class="muted">PNG, JPG, WEBP, or GIF up to 3MB</small>
            </div>
          </div>
          <label>Choose Image File
            <input type="file" id="avatarFileInput" accept="image/*" required style="width:100%; border:1px solid #dfe5ee; border-radius:10px; padding:10px; margin-top:4px;">
          </label>
          <button class="btn primary full" type="submit" id="saveAvatarBtn">Upload Avatar</button>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close handlers
  document.getElementById('closeSettingsModalBtn')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', e => {
    if (e.target.id === 'adminSettingsModal') modal.style.display = 'none';
  });

  // Tab switching inside modal
  const tabRename = document.getElementById('tabSettingsRename');
  const tabPassword = document.getElementById('tabSettingsPassword');
  const tabAvatar = document.getElementById('tabSettingsAvatar');
  const fRename = document.getElementById('renameForm');
  const fPassword = document.getElementById('passwordForm');
  const fAvatar = document.getElementById('avatarForm');

  function selectSettingsTab(activeTab, activeForm) {
    [tabRename, tabPassword, tabAvatar].forEach(t => t.classList.remove('active'));
    [fRename, fPassword, fAvatar].forEach(f => f.style.display = 'none');
    activeTab.classList.add('active');
    activeForm.style.display = 'grid';
    clearSettingsAlert();
  }

  tabRename.addEventListener('click', () => selectSettingsTab(tabRename, fRename));
  tabPassword.addEventListener('click', () => selectSettingsTab(tabPassword, fPassword));
  tabAvatar.addEventListener('click', () => selectSettingsTab(tabAvatar, fAvatar));

  // Password toggle buttons inside modal
  modal.querySelectorAll('.pwd-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // Image preview handler
  document.getElementById('avatarFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = document.getElementById('avatarPreviewImg');
        const init = document.getElementById('avatarPreviewInitials');
        img.src = ev.target.result;
        img.style.display = 'block';
        init.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }
  });

  // Submit Rename Form
  fRename.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('saveRenameBtn');
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName) return;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    clearSettingsAlert();

    try {
      await API.request('/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: newName })
      });
      showSettingsAlert('Profile name updated successfully!', true);
      currentUserProfile.name = newName;
      renderSidebarProfile(currentUserProfile);
    } catch (err) {
      showSettingsAlert(err.message || 'Failed to update name', false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });

  // Submit Password Form
  fPassword.addEventListener('submit', async e => {
    e.preventDefault();
    const curr = document.getElementById('currPwdInput').value;
    const newP = document.getElementById('newPwdInput').value;
    const conf = document.getElementById('confirmPwdInput').value;
    if (newP !== conf) {
      showSettingsAlert('New password and confirmation do not match.', false);
      return;
    }
    const btn = document.getElementById('savePasswordBtn');
    btn.disabled = true;
    btn.textContent = 'Updating…';
    clearSettingsAlert();

    try {
      await API.request('/profile/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: curr, new_password: newP })
      });
      showSettingsAlert('Password changed successfully!', true);
      fPassword.reset();
    } catch (err) {
      showSettingsAlert(err.message || 'Failed to change password.', false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  });

  // Submit Avatar Upload Form
  fAvatar.addEventListener('submit', async e => {
    e.preventDefault();
    const fileInput = document.getElementById('avatarFileInput');
    if (!fileInput.files.length) return;

    const btn = document.getElementById('saveAvatarBtn');
    btn.disabled = true;
    btn.textContent = 'Uploading…';
    clearSettingsAlert();

    try {
      const formData = new FormData();
      formData.append('avatar', fileInput.files[0]);

      const response = await fetch('/api/admin/profile/avatar', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Upload failed');

      showSettingsAlert('Avatar uploaded successfully!', true);
      currentUserProfile.avatar_url = data.avatar_url;
      renderSidebarProfile(currentUserProfile);
    } catch (err) {
      showSettingsAlert(err.message || 'Failed to upload avatar', false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Upload Avatar';
    }
  });
}

function openSettingsModal() {
  if (!currentUserProfile) return;
  injectSettingsModal();
  const modal = document.getElementById('adminSettingsModal');
  if (!modal) return;
  document.getElementById('renameInput').value = currentUserProfile.name || '';
  document.getElementById('renameEmailInput').value = currentUserProfile.email || '';

  const img = document.getElementById('avatarPreviewImg');
  const init = document.getElementById('avatarPreviewInitials');
  if (currentUserProfile.avatar_url) {
    img.src = currentUserProfile.avatar_url;
    img.style.display = 'block';
    init.style.display = 'none';
  } else {
    img.style.display = 'none';
    init.style.display = 'block';
    init.textContent = (currentUserProfile.name || currentUserProfile.email || 'A')[0].toUpperCase();
  }

  clearSettingsAlert();
  modal.style.display = 'grid';
}

function showSettingsAlert(msg, isSuccess = true) {
  const el = document.getElementById('settingsAlert');
  if (!el) return;
  el.className = `status-msg ${isSuccess ? 'success' : 'error'}`;
  el.textContent = msg;
}

function clearSettingsAlert() {
  const el = document.getElementById('settingsAlert');
  if (el) { el.className = 'status-msg'; el.textContent = ''; }
}

async function handleLogout() {
  try {
    await API.request('/logout', { method: 'POST' });
  } finally {
    location.href = '/login.html';
  }
}

// Initialize Shell
initAdminShell();
