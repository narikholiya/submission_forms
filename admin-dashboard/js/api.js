const API = {
  async request(path, options = {}) {
    const response = await fetch(`/api/admin${path}`, {
      credentials: 'same-origin',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { if (!location.pathname.endsWith('/login.html')) location.href = '/login.html'; throw new Error(data.message || 'Please sign in again.'); }
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
    return data;
  },
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  number(value) { return new Intl.NumberFormat().format(Number(value || 0)); },
  bytes(value) { const n=Number(value||0); if(!n)return '0 B'; const u=['B','KB','MB','GB','TB']; const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),4); return `${(n/Math.pow(1024,i)).toFixed(i?2:0)} ${u[i]}`; }
};
