let currentUserProfile = null;

// Real-time Clock for Live Sync in topbar
function updateLiveClock() {
  const timeStr = new Date().toLocaleTimeString();
  const clocks = document.querySelectorAll('#topLiveTime, .top-live-clock, #syncTimestampDisplay');
  clocks.forEach(el => {
    el.textContent = timeStr;
  });
}
updateLiveClock();
setInterval(updateLiveClock, 1000);

// Initialize Admin Profile in Sidebar
async function initAdminShell() {
  try {
    currentUserProfile = await API.request('/profile');
    renderSidebarProfile(currentUserProfile);
  } catch (err) {
    console.warn("Shell profile load error:", err.message);
  }
}

function renderSidebarProfile(user) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Remove .side-bottom completely
  sidebar.querySelectorAll('.side-bottom').forEach(el => el.remove());

  // Remove existing profile card if any
  const existing = document.getElementById('adminSideProfile');
  if (existing) existing.remove();

  const isSettingsPage = window.location.pathname.endsWith('settings.html');
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
    <div class="profile-actions" style="margin-top: 4px;">
      <a href="/settings.html" class="btn-settings-action ${isSettingsPage ? 'active' : ''}">
        ⚙️ Settings
      </a>
    </div>
  `;

  // Always append at the bottom of the sidebar
  sidebar.appendChild(profileCard);
}

// Background ping to keep database connection warm and verify connectivity
let isPinging = false;
async function pingSync() {
  if (isPinging) return;
  isPinging = true;
  try {
    await API.request('/overview');
  } catch (err) {
    // silent
  } finally {
    isPinging = false;
  }
}

pingSync();
setInterval(pingSync, 1000);

// Initialize Shell
initAdminShell();
