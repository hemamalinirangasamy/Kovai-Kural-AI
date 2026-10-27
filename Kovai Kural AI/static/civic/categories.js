let categoryRows=[];
const escapeCategory=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderCategories(){const grid=document.getElementById('allCategories');grid.innerHTML=categoryRows.map(category=>`<article class="category-card"><div class="category-icon">${escapeCategory(category.icon)}</div><h3>${window.KK.t(`cat.${category.slug}`)}</h3><p>${window.KK.t(`desc.${category.slug}`)}</p><a href="category.html?slug=${encodeURIComponent(category.slug)}" class="text-link">${window.KK.t('viewDetails')} →</a></article>`).join('')||`<div class="empty-state">${window.KK.t('noData')}</div>`;}
fetch('/api/categories').then(r=>r.json()).then(rows=>{categoryRows=rows;renderCategories();}).catch(()=>document.getElementById('allCategories').innerHTML='<div class="empty-state">Could not load categories.</div>');
document.addEventListener('kk:language',renderCategories);
