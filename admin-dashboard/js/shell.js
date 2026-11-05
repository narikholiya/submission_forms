(async()=>{try{await API.request('/me');}catch(e){return;}})();
document.getElementById('logoutBtn')?.addEventListener('click',async()=>{try{await API.request('/logout',{method:'POST'});}finally{location.href='/login.html';}});
