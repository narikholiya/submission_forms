/**
 * ==============================================================================
 * Global Application Shell & Layout Controller (shell.js)
 * ==============================================================================
 * Included across all administrative pages. Responsibilities include:
 * 1. Synchronizing the real-time clock in top navigation bars.
 * 2. Fetching and rendering the administrator profile card in the sidebar.
 * 3. Driving the global Theme Engine (Light, Dark, System scheme listener).
 * 4. Background connectivity ping to keep sessions and database connection warm.
 * ==============================================================================
 */

let currentUserProfile = null;

// ==============================================================================
// 1. Real-time Live Clock
// ==============================================================================
function updateLiveClock() {
  const timeStr = new Date().toLocaleTimeString();
  const clocks = document.querySelectorAll('#topLiveTime, .top-live-clock, #syncTimestampDisplay');
  clocks.forEach(el => {
    el.textContent = timeStr;
  });
}
updateLiveClock();
setInterval(updateLiveClock, 1000);

// ==============================================================================
// 2. Administrator Sidebar Profile Card
// ==============================================================================
/**
 * Loads current admin credentials from the backend session endpoint.
 */
async function initAdminShell() {
  try {
    currentUserProfile = await API.request('/profile');
    renderSidebarProfile(currentUserProfile);
  } catch (err) {
    console.warn("Shell profile load error:", err.message);
  }
}

/**
 * Injects the admin profile pill and quick-link to settings at the base of the sidebar.
 * Handles fallback avatar initials if no avatar image is configured or if it fails to load.
 *
 * @param {Object} user - Profile object { name, email, avatar_url, ... }
 */
function renderSidebarProfile(user) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Clean up legacy navigation footers if present
  sidebar.querySelectorAll('.side-bottom').forEach(el => el.remove());

  // Remove previous profile card instance to prevent duplication
  const existing = document.getElementById('adminSideProfile');
  if (existing) existing.remove();

  const isSettingsPage = window.location.pathname.endsWith('settings.html');
  const initial = API.escape((user.name || user.email || 'A')[0].toUpperCase());

  // Construct avatar markup with graceful error fallback to initial letter badge
  const avatarContent = user.avatar_url
    ? `<img src="${API.escape(user.avatar_url)}" alt="Avatar" class="admin-avatar" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='grid';"><div class="admin-avatar" style="display:none;">${initial}</div>`
    : `<div class="admin-avatar">${initial}</div>`;

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

  // Append profile card at the bottom of the sidebar
  sidebar.appendChild(profileCard);
}
window.renderSidebarProfile = renderSidebarProfile;

// ==============================================================================
// 3. Theme Engine (Light / Dark / System Mode)
// ==============================================================================
/**
 * Retrieves the stored theme preference from localStorage (defaults to 'system').
 * @returns {'light'|'dark'|'system'}
 */
function getSavedTheme() {
  return localStorage.getItem('admin_theme') || 'system';
}

/**
 * Applies the given theme mode by setting the `data-theme` attribute on <html>.
 * Updates UI active button states across the page.
 *
 * @param {'light'|'dark'|'system'} theme
 */
function applyTheme(theme) {
  // If 'system' is chosen, query the operating system's prefers-color-scheme media query
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  // Update visual active state of theme toggle buttons
  document.querySelectorAll('.theme-choice-btn').forEach(btn => {
    const val = btn.getAttribute('data-theme-value');
    if (val === theme) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Persists user's theme selection to browser storage and re-renders styles.
 * @param {'light'|'dark'|'system'} theme
 */
function setTheme(theme) {
  localStorage.setItem('admin_theme', theme);
  applyTheme(theme);
}

// Listen for OS dark/light mode switching when 'system' theme is selected
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getSavedTheme() === 'system') {
      applyTheme('system');
    }
  });
} catch (e) {
  // Browser fallback for legacy environments
}

/**
 * Binds click events to any theme selection buttons rendered on the page.
 */
function initThemeButtons() {
  applyTheme(getSavedTheme());
  document.querySelectorAll('.theme-choice-btn').forEach(btn => {
    btn.onclick = () => {
      const val = btn.getAttribute('data-theme-value');
      if (val) setTheme(val);
    };
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeButtons);
} else {
  initThemeButtons();
}

// ==============================================================================
// 4. Background Connectivity & Keep-Alive Ping
// ==============================================================================
let isPinging = false;
async function pingSync() {
  if (isPinging) return;
  isPinging = true;
  try {
    await API.request('/overview');
  } catch (err) {
    // Fail silently without interrupting UI interactions
  } finally {
    isPinging = false;
  }
}

// Initial warm-up ping and recurring periodic sync
pingSync();
setInterval(pingSync, 1000);

// Initialize Shell layout on script execution
initAdminShell();
