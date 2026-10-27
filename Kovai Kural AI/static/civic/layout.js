(() => {
  const base=location.pathname.split('/').pop()||'index.html';
  const home=base==='index.html';
  const page=(section)=>home?`#${section}`:`index.html#${section}`;
  const header=document.querySelector('.topbar');
  if(!header)return;
  header.innerHTML=`<a class="brand" href="index.html#home" aria-label="Kovai Kural home"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M25 5c-8 0-14 6-14 14 0 10 13 23 13 23s13-13 13-23c0-8-5-14-12-14Z" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="24" cy="19" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 18h3m32 0h3M3 25h5m32 0h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span><b><span data-i18n="brand">Kovai Kural</span> <i>AI</i></b><small>COIMBATORE · TAMIL NADU</small></span></a><button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false">☰</button><nav class="nav-links"><a href="index.html#home" data-i18n="home">Home</a><a href="${page('why')}" data-i18n="why">Why Kovai Kural?</a><div class="nav-dropdown"><button type="button" class="nav-drop-button" aria-expanded="false" data-i18n="categories">Categories</button><span class="drop-arrow">⌄</span><div class="dropdown-panel"><a href="categories.html" data-i18n="viewAll">View all categories</a><div class="drop-category-list"></div></div></div><a href="${home?'divisions.html':'divisions.html'}" data-i18n="constituencies">Constituencies</a><a href="resources.html" data-i18n="resources">Resources</a>${base==="workspace.html"?"<button type=\"button\" id=\"logout\" class=\"nav-login\" data-i18n=\"logout\">Sign out</button>":"<a href=\"login-options.html\" class=\"nav-login\" data-i18n=\"login\">Login</a>"}<label class="language-control"><span class="sr-only" data-i18n="language">Language</span><select data-language-select aria-label="Language"><option value="en">EN</option><option value="ta">தமிழ்</option></select></label></nav>`;
  const menu=header.querySelector('.menu-toggle');
  menu.addEventListener('click',()=>{const nav=header.querySelector('.nav-links');const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
  const dropdown=header.querySelector('.nav-dropdown');const dropButton=dropdown.querySelector('.nav-drop-button');
  dropButton.addEventListener('click',()=>{const open=dropdown.classList.toggle('open');dropButton.setAttribute('aria-expanded',String(open));});
  document.addEventListener('click',event=>{if(!dropdown.contains(event.target)){dropdown.classList.remove('open');dropButton.setAttribute('aria-expanded','false');}});
  const categoryList=header.querySelector('.drop-category-list');
  async function loadLinks(){try{const response=await fetch('/api/categories');if(!response.ok)throw new Error();const rows=await response.json();categoryList.innerHTML=rows.map(item=>`<a href="category.html?slug=${encodeURIComponent(item.slug)}" data-category="${item.slug}">${window.KK.t(`cat.${item.slug}`)}</a>`).join('');}catch{categoryList.innerHTML=window.KK.categories.map(slug=>`<a href="category.html?slug=${slug}">${window.KK.t(`cat.${slug}`)}</a>`).join('');}}
  loadLinks();
  document.addEventListener('kk:language',()=>{window.KK.translate(header);loadLinks();});
  fetch('/api/me').then(r=>r.json()).then(data=>{if(data.user&&base!=='workspace.html'){const link=header.querySelector('.nav-login');link.href=`workspace.html?dashboard=${data.user.role}`;link.dataset.i18n='dashboard';link.textContent=window.KK.t('dashboard');}}).catch(()=>{});
  window.KK.translate(header);
})();
