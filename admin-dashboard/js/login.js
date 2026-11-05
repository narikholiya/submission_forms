document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); const form=event.currentTarget; const button=form.querySelector('button'); const error=document.getElementById('loginError'); error.textContent=''; button.disabled=true; button.textContent='Signing in…';
  try { const body=Object.fromEntries(new FormData(form)); await API.request('/login',{method:'POST',body:JSON.stringify(body)}); location.href='/dashboard.html'; }
  catch(e){error.textContent=e.message;} finally {button.disabled=false;button.textContent='Sign in';}
});
