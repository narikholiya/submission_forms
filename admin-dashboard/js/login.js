// Tab switching
const tabSignIn = document.getElementById('tabSignIn');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const pageTitle = document.getElementById('pageTitle');
const pageSub = document.getElementById('pageSub');

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

function clearStatuses() {
  const l = document.getElementById('loginStatus');
  const r = document.getElementById('regStatus');
  if (l) { l.className = 'status-msg'; l.textContent = ''; }
  if (r) { r.className = 'status-msg'; r.textContent = ''; }
}

// Password show / hide toggle icon handler
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

// Handle Login Form Submission
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
    await API.request('/login', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    location.href = '/dashboard.html';
  } catch (e) {
    status.className = 'status-msg error';
    status.textContent = e.message || 'Invalid email or password.';
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});

// Handle Create Account Form Submission
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
    const res = await API.request('/register', {
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
