const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api = async (url, options={}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json');
  if (options.method && !['GET','HEAD'].includes(options.method)) headers.set('X-CSRF-Token',csrfToken);
  const response = await fetch(url,{credentials:'same-origin',...options,headers});
  const data = response.status===204 ? {} : await response.json().catch(()=>({error:'Server returned an unreadable response.'}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  if (data.csrfToken) csrfToken=data.csrfToken;
  return data;
};
let csrfToken='';
let divisions=[];
const reportDialog=document.getElementById('reportDialog');
const reportForm=document.getElementById('reportForm');
const categorySelect=document.getElementById('reportCategory');
const areaInput=document.getElementById('reportArea');
const localityField=areaInput.closest('.form-field');
const formHint=reportForm.querySelector('.form-hint');
formHint.textContent='Your report is saved securely by this platform and is not automatically sent to a government authority. Do not enter phone numbers or exact home addresses.';
formHint.dataset.i18n='accountPrivate';
document.querySelector('.hero .tamil')?.setAttribute('data-i18n','tagline');
areaInput.placeholder='Neighbourhood, street or landmark (no house number)';
areaInput.dataset.i18nPlaceholder='ph.locality';
areaInput.closest('label').querySelector('span').innerHTML='Locality or area <b>*</b>';
areaInput.closest('label').querySelector('span').dataset.i18n='form.locality';
categorySelect.closest('label').querySelector('span').dataset.i18n='form.category';
document.getElementById('reportDescription').closest('label').querySelector('span').dataset.i18n='form.description';

function addField(id,title,element,after=reportForm.querySelector('[for="never"]')) {
  const label=document.createElement('label');label.className='form-field';label.htmlFor=id;
  label.innerHTML=`<span>${title}</span>`;element.id=id;label.append(element);
  if(after?.parentNode)after.parentNode.insertBefore(label,after.nextSibling);else reportForm.insertBefore(label,reportForm.querySelector('button[type="submit"]'));
  return element;
}
const categoryLabel=categorySelect.closest('.form-field');
function makeSelect(id,title,items,required=true) {
  const select=document.createElement('select');select.id=id;select.name=id;select.required=required;
  const prompt=document.createElement('option');prompt.value='';prompt.textContent='Choose an option';select.append(prompt);
  for(const [value,label] of items){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
  const wrap=document.createElement('label');wrap.className='form-field';const caption=Object.assign(document.createElement('span'),{textContent:title.replace(' *','')});const selectKey={constituency:'constituency',ageGroup:'age',severity:'severity'}[id];if(selectKey)caption.dataset.i18n=`form.${selectKey}`;wrap.append(caption);wrap.append(select);categoryLabel.after(wrap);return select;
}
function makeInput(id,title,type='text',required=true,placeholder='') {
  const input=document.createElement(type==='textarea'?'textarea': 'input');input.id=id;input.name=id;input.required=required;
  if(type!=='textarea')input.type=type;
  if(placeholder)input.placeholder=placeholder;
  if(id==='photo'){input.accept='image/jpeg,image/png,image/webp';input.setAttribute('aria-describedby','photoHelp');}
  const label=document.createElement('label');label.className='form-field';const caption=Object.assign(document.createElement('span'),{textContent:title.replace(' *','')});const inputKey={reporterName:'name',reportTitle:'title',duration:'duration',photo:'photo',suggestion:'suggestion'}[id];if(inputKey)caption.dataset.i18n=`form.${inputKey}`;label.append(caption);label.append(input);
  const placeholderKeys={reporterName:'ph.name',reportTitle:'ph.title',duration:'ph.duration',suggestion:'ph.suggestion'};if(placeholderKeys[id])input.dataset.i18nPlaceholder=placeholderKeys[id];
  if(id==='photo'){const help=document.createElement('small');help.id='photoHelp';help.textContent='JPG, PNG or WebP, maximum 5 MB.';label.append(help);}
  reportForm.insertBefore(label,reportForm.querySelector('button[type="submit"]'));return input;
}
const constituencySelect=makeSelect('constituency','Assembly constituency *',[]);
const ageSelect=makeSelect('ageGroup','Age group *',[['Under 18','Under 18'],['18–25','18–25'],['26–40','26–40'],['41–60','41–60'],['Over 60','Over 60'],['Prefer not to say','Prefer not to say']]);
const severitySelect=makeSelect('severity','Severity *',[['Low','Low'],['Medium','Medium'],['High','High'],['Urgent','Urgent']]);
makeInput('reporterName','Name (optional)','text',false,'Your name');
makeInput('reportTitle','Problem title *','text',true,'Briefly describe the issue');
makeInput('duration','How long has this existed? *','text',true,'For example, 2 weeks');
makeInput('photo','Supporting photograph (optional)','file',false);
makeInput('suggestion','Suggestion for improvement (optional)','textarea',false,'What change would help?');
const submitButton=reportForm.querySelector('button[type="submit"]');
submitButton.textContent='Submit report →';
submitButton.dataset.i18n='submit';

function loadCategories(items) {
  categorySelect.replaceChildren(new Option('Choose a problem category',''));
  categoryGrid.replaceChildren();
  categoryGrid.dataset.loaded='1';
  for(const item of items){
    const option=new Option(window.KK?.t(`cat.${item.slug}`)||item.name,item.slug);option.dataset.i18nKey=`cat.${item.slug}`;categorySelect.add(option);
    const card=document.createElement('article');card.className='category-card';
    card.innerHTML=`<div class="category-icon">${esc(item.icon)}</div><h3>${window.KK?.t(`cat.${item.slug}`)||esc(item.name)}</h3><p>${window.KK?.t(`desc.${item.slug}`)||esc(item.description)}</p><button class="category-report" type="button">${window.KK?.t('reportProblem')||'Report a problem'} <span>→</span></button>`;
    card.querySelector('button').addEventListener('click',()=>openReport(item.slug));categoryGrid.append(card);
  }
}
function loadDivisions(items) {
  divisions=items;
  const list=document.querySelector('.division-list');if(!list)return;
  if(!items.length){list.innerHTML='<div class="division-empty">No verified Assembly constituency records are available.</div>';return;}
  list.innerHTML=items.slice(0,8).map(c=>`<a href="constituency.html?slug=${encodeURIComponent(c.slug)}"><span class="division-dot">⌖</span><span><b>${esc(window.KK?.t(`con.${c.slug}`)||c.name)}</b><small>${c.complaint_count} · ${c.full_name?esc(c.full_name):window.KK?.t('infoPending')}</small></span><span class="arrow">↗</span></a>`).join('');
}
function openReport(category,slug) {
  if(category)categorySelect.value=category;
  if(slug)constituencySelect.value=slug;
  reportDialog.showModal();
}
document.querySelectorAll('[data-open-report]').forEach(button=>button.addEventListener('click',()=>openReport()));
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>reportDialog.close()));
reportDialog.addEventListener('click',event=>{if(event.target===reportDialog)reportDialog.close();});

async function refreshStats(){
  try{const stats=await api('/api/stats');const values={constituencyCount:stats.constituencies,citizenCount:stats.citizens,surveyCount:stats.surveyResponses,issueCount:stats.reportedIssues,representativeCount:stats.activeRepresentatives};for(const [id,value] of Object.entries(values)){const node=document.getElementById(id);if(node)node.textContent=value??0;}}
  catch{for(const id of ['citizenCount','surveyCount','issueCount','representativeCount']){const node=document.getElementById(id);if(node)node.textContent='—';}}
}
async function loadParties(items){
  const target=document.querySelector('.insight-row .party-card');if(!target)return;
  const counts={};for(const c of items)if(c.party)counts[c.party]=(counts[c.party]||0)+1;
  const parties=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  target.innerHTML=`<div class="card-top"><div><span>VERIFIED REPRESENTATIVES</span><h3>Party representation</h3></div><span class="spark">✳</span></div>${parties.length?parties.map(([party,count])=>`<div class="party-row"><span>${esc(party)}</span><b>${count}</b></div>`).join(''):'<div class="empty-state compact">No verified MLA party records yet.</div>'}<small class="verification-note">Counts include only active profiles with party information. They are not inferred.</small>`;
}
async function loadMine(){
  const list=document.getElementById('reportList');if(!list)return;
  try{const reports=await api('/api/reports/mine');list.innerHTML=reports.length?reports.map(r=>`<a class="report-row" href="track.html?reference=${encodeURIComponent(r.reference)}"><div><small>${esc(r.reference)} · ${esc(r.created_at)}</small><h3>${esc(r.category)} · ${esc(r.constituency)} · ${esc(r.title)}</h3><p>${esc(r.description)}</p></div><span class="status status-review">${esc(r.status)}</span></a>`).join(''):'<div class="empty-state">Sign in to see your reports. Public submissions are not tied to an account.</div>';}
  catch{list.innerHTML='<div class="empty-state">Sign in to view reports linked to your account.</div>';}
}
reportForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const data=new FormData();
  data.set('category',categorySelect.value);data.set('constituency',constituencySelect.value);data.set('ageGroup',ageSelect.value);data.set('severity',severitySelect.value);
  data.set('name',document.getElementById('reporterName').value.trim());data.set('title',document.getElementById('reportTitle').value.trim());data.set('locality',areaInput.value.trim());data.set('description',document.getElementById('reportDescription').value.trim());data.set('duration',document.getElementById('duration').value.trim());data.set('suggestion',document.getElementById('suggestion').value.trim());
  const photo=document.getElementById('photo').files[0];if(photo)data.set('photo',photo);
  submitButton.disabled=true;submitButton.textContent='Saving…';
  try{const result=await api('/api/reports',{method:'POST',body:data});reportForm.reset();reportDialog.close();const alert=document.createElement('div');alert.className='success-banner';alert.innerHTML=`Report saved. Your reference number is <b>${esc(result.reference)}</b>. Keep it to track this report.`;document.querySelector('main').prepend(alert);await refreshStats();await loadMine();alert.scrollIntoView({behavior:'smooth'});}
  catch(error){let err=document.getElementById('formError');if(!err){err=document.createElement('p');err.id='formError';err.className='form-errors';reportForm.prepend(err);}err.textContent=error.message;}
  finally{submitButton.disabled=false;submitButton.textContent='Submit report →';}
});

async function boot(){
  try{const me=await api('/api/me');csrfToken=me.csrfToken||'';}catch{}
  try{const categories=await api('/api/categories');loadCategories(categories);}catch{categoryGrid.innerHTML='<div class="empty-state">Connect to the server to load categories.</div>';}
  try{const items=await api('/api/constituencies');loadDivisions(items);for(const c of items){const option=new Option(window.KK?.t(`con.${c.slug}`)||c.name,c.slug);option.dataset.i18nKey=`con.${c.slug}`;const options=constituencySelect;options.add(option);}const count=document.querySelector('.stats>div:nth-child(4) b');if(count)count.textContent=items.length;await loadParties(items);const query=new URLSearchParams(location.search);const requested=query.get('constituency');if(requested){constituencySelect.value=requested;openReport(query.get('category')||'',requested);}else if(query.has('category'))openReport(query.get('category'));}catch{}
  await Promise.all([refreshStats(),loadMine()]);
}
boot();
const whyGrid=document.querySelector('#why .why-grid');
if(whyGrid){for(const [number,key,copy] of [[4,'why.card4','whyConnectText'],[5,'why.card5','whyDataText']]){const article=document.createElement('article');article.innerHTML=`<span>0${number}</span><h2 data-i18n="${key}">${window.KK.t(key)}</h2><p data-i18n="${copy}">${window.KK.t(copy)}</p>`;whyGrid.append(article);}}
document.addEventListener('kk:language',()=>{if(categoryGrid.dataset.loaded==='1')renderCategoriesFromApi();if(divisions.length)loadDivisions(divisions);});
document.getElementById('language')?.addEventListener('change',event=>{
  const lead=document.querySelector('.hero .lead');const note=document.querySelector('.hero-note');
  if(event.target.value==='ta'){lead.textContent='உள்ளூர் பிரச்சினைகளைப் பதிவு செய்து, உங்கள் பதிவுகளைப் பின்தொடருங்கள்.';note.innerHTML='<span>◉</span> உங்கள் குரல். கோவையின் வளர்ச்சி.';document.documentElement.lang='ta';}
  else{lead.textContent='A shared civic space to report local issues, follow progress and understand the needs of our district.';note.innerHTML='<span>◉</span> Transparent reporting. Community-led insight.';document.documentElement.lang='en';}
});
async function renderCategoriesFromApi(){try{loadCategories(await api('/api/categories'));}catch{}}
