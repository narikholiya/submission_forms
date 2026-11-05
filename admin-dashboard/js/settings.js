let adminData = null;

async function loadAdminSettings() {
  try {
    adminData = await API.request('/profile');
    renderProfile(adminData);
  } catch (err) {
    document.getElementById('pageError').textContent = err.message || 'Failed to load profile data.';
  }
}

function renderProfile(user) {
  document.getElementById('cardAdminName').textContent = user.name || 'Administrator';
  document.getElementById('cardAdminEmail').textContent = user.email || 'admin@example.com';
  document.getElementById('inputName').value = user.name || '';
  if (user.created_at) {
    document.getElementById('cardCreatedDate').textContent = new Date(user.created_at).toLocaleDateString();
  }

  const img = document.getElementById('avatarImg');
  const init = document.getElementById('avatarInitial');

  if (user.avatar_url) {
    img.src = user.avatar_url;
    img.style.display = 'block';
    init.style.display = 'none';
  } else {
    img.style.display = 'none';
    init.style.display = 'grid';
    init.textContent = (user.name || user.email || 'A')[0].toUpperCase();
  }
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

// Password toggle
document.querySelectorAll('.pwd-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

// Rename Profile Submission
document.getElementById('formRename')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btnSaveName');
  const newName = document.getElementById('inputName').value.trim();
  if (!newName) return;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  clearAlert('renameAlert');

  try {
    const res = await API.request('/profile', {
      method: 'PUT',
      body: JSON.stringify({ name: newName })
    });
    showAlert('renameAlert', 'Profile name updated successfully!', true);
    adminData.name = newName;
    renderProfile(adminData);
    if (typeof renderSidebarProfile === 'function') {
      renderSidebarProfile(adminData);
    }
  } catch (err) {
    showAlert('renameAlert', err.message || 'Failed to update name', false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save New Name';
  }
});

// Change Password Submission
document.getElementById('formPassword')?.addEventListener('submit', async e => {
  e.preventDefault();
  const curr = document.getElementById('inputCurrentPwd').value;
  const newP = document.getElementById('inputNewPwd').value;
  const conf = document.getElementById('inputConfirmPwd').value;

  if (newP !== conf) {
    showAlert('passwordAlert', 'New password and confirm password do not match.', false);
    return;
  }
  const btn = document.getElementById('btnSavePassword');
  btn.disabled = true;
  btn.textContent = 'Updating…';
  clearAlert('passwordAlert');

  try {
    await API.request('/profile/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: curr, new_password: newP })
    });
    showAlert('passwordAlert', 'Password updated successfully!', true);
    document.getElementById('formPassword').reset();
  } catch (err) {
    showAlert('passwordAlert', err.message || 'Failed to update password.', false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Password';
  }
});

// Upload Avatar Submission
document.getElementById('formAvatar')?.addEventListener('submit', async e => {
  e.preventDefault();
  const fileInput = document.getElementById('inputAvatarFile');
  if (!fileInput.files.length) return;

  const btn = document.getElementById('btnUploadAvatar');
  btn.disabled = true;
  btn.textContent = 'Uploading…';
  clearAlert('avatarAlert');

  try {
    const formData = new FormData();
    formData.append('avatar', fileInput.files[0]);

    const res = await fetch('/api/admin/profile/avatar', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to upload avatar.');

    showAlert('avatarAlert', 'Avatar uploaded and applied successfully!', true);
    adminData.avatar_url = data.avatar_url;
    renderProfile(adminData);
    if (typeof renderSidebarProfile === 'function') {
      renderSidebarProfile(adminData);
    }
    document.getElementById('formAvatar').reset();
  } catch (err) {
    showAlert('avatarAlert', err.message || 'Avatar upload failed.', false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload & Apply Avatar';
  }
});

// Logout handler inside Settings tab
document.getElementById('settingsLogoutBtn')?.addEventListener('click', async () => {
  try {
    await API.request('/logout', { method: 'POST' });
  } finally {
    location.href = '/login.html';
  }
});

// Initialize Settings
loadAdminSettings();

