/**
 * ==============================================================================
 * Admin Authentication Controller (login.js)
 * ==============================================================================
 * Manages administrative sign-in, new admin account registration,
 * password reveal/conceal toggle buttons, and login-screen theme switching.
 * ==============================================================================
 */

// DOM Elements
const tabSignIn = document.getElementById('tabSignIn');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const pageTitle = document.getElementById('pageTitle');
const pageSub = document.getElementById('pageSub');

// ==============================================================================
// 1. Tab Switching (Sign In vs Register Account)
// ==============================================================================
tabSignIn.addEventListener('click', () => {
  tabSignIn.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.style.display = 'grid';
  registerForm.style.display = 'none';
  pageTitle.textContent = 'Admin Sign In';
  pageSub.textContent = 'Authenticate to access database console & records.';
  clearStatuses();
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabSignIn.classList.remove('active');
  loginForm.style.display = 'none';
  registerForm.style.display = 'grid';
  pageTitle.textContent = 'Create Admin Account';
  pageSub.textContent = 'Valid Admin Secret Key required to register.';
  clearStatuses();
});

/**
 * Clears any previous error or success feedback messages from both forms.
 */
function clearStatuses() {
  const l = document.getElementById('loginStatus');
  const r = document.getElementById('regStatus');
  if (l) { l.className = 'status-msg'; l.textContent = ''; }
  if (r) { r.className = 'status-msg'; r.textContent = ''; }
}

// ==============================================================================
// 2. Password Visibility Toggle (Show / Hide Password)
// ==============================================================================
document.querySelectorAll('.pwd-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;

    const eyeOpen = btn.querySelector('.eye-open');
    const eyeClosed = btn.querySelector('.eye-closed');

    if (input.type === 'password') {
      input.type = 'text';
      if (eyeOpen) eyeOpen.style.display = 'none';
      if (eyeClosed) eyeClosed.style.display = 'block';
    } else {
      input.type = 'password';
      if (eyeOpen) eyeOpen.style.display = 'block';
      if (eyeClosed) eyeClosed.style.display = 'none';
    }
  });
});

// ==============================================================================
// 3. Admin Login Submission
// ==============================================================================
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('loginBtn');
  const status = document.getElementById('loginStatus');

  status.className = 'status-msg';
  status.textContent = '';
  button.disabled = true;
  button.textContent = 'Signing in…';

  try {
    const body = Object.fromEntries(new FormData(form));
    // Send credentials to backend login endpoint
    await API.request('/login', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    // Redirect to main overview dashboard on successful authentication
    location.href = '/dashboard.html';
  } catch (e) {
    status.className = 'status-msg error';
    status.textContent = e.message || 'Invalid email or password.';
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});

// ==============================================================================
// 4. Admin Account Registration Submission (Requires ADMIN_SECRET_KEY)
// ==============================================================================
registerForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('regBtn');
  const status = document.getElementById('regStatus');

  status.className = 'status-msg';
  status.textContent = '';
  button.disabled = true;
  button.textContent = 'Verifying Secret Key & Creating…';

  try {
    const body = Object.fromEntries(new FormData(form));
    await API.request('/register', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    status.className = 'status-msg success';
    status.textContent = 'Account created successfully! Entering dashboard…';
    setTimeout(() => {
      location.href = '/dashboard.html';
    }, 600);
  } catch (e) {
    status.className = 'status-msg error';
    status.textContent = e.message || 'Failed to create account. Ensure Admin Secret Key is correct.';
  } finally {
    button.disabled = false;
    button.textContent = 'Create Account & Enter';
  }
});

// ==============================================================================
// 5. Standalone Theme Toggle for Login Screen
// ==============================================================================
const themeBtn = document.getElementById('loginThemeToggle');
const themeIcon = document.getElementById('themeToggleIcon');
const themeText = document.getElementById('themeToggleText');

function updateLoginThemeUI() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
  if (themeText) themeText.textContent = isDark ? 'Light' : 'Dark';
}

if (themeBtn) {
  updateLoginThemeUI();
  themeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('admin_theme', newTheme);
    updateLoginThemeUI();
  });
}
