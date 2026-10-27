const express = require('express');
const session = require('express-session');
const SQLiteStore = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || !process.env.ADMIN_SETUP_KEY)) throw new Error('SESSION_SECRET and ADMIN_SETUP_KEY must be set in production.');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new SQLiteStore(path.join(DATA_DIR, 'kovai-kural.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, email TEXT UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'citizen' CHECK(role IN ('admin','citizen','representative')), constituency_id INTEGER, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(constituency_id) REFERENCES constituencies(id));
CREATE TABLE IF NOT EXISTS constituencies (id INTEGER PRIMARY KEY, ac_number INTEGER NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE, verified_source TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL, icon TEXT NOT NULL, display_order INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS mla_profiles (id INTEGER PRIMARY KEY, constituency_id INTEGER NOT NULL UNIQUE, full_name TEXT NOT NULL, photo_path TEXT, party TEXT, biography TEXT, public_contact TEXT, verification_source TEXT NOT NULL, last_verified TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(constituency_id) REFERENCES constituencies(id));
CREATE TABLE IF NOT EXISTS resources (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, url TEXT NOT NULL, verification_source TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS complaints (id INTEGER PRIMARY KEY, reference TEXT NOT NULL UNIQUE, citizen_id INTEGER, reporter_name TEXT, age_group TEXT, constituency_id INTEGER NOT NULL, category_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, locality TEXT NOT NULL, severity TEXT NOT NULL CHECK(severity IN ('Low','Medium','High','Urgent')), duration TEXT NOT NULL, image_path TEXT, suggestion TEXT, status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted','Under Review','In Progress','Resolved','Rejected')), assigned_representative_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT, FOREIGN KEY(citizen_id) REFERENCES users(id), FOREIGN KEY(constituency_id) REFERENCES constituencies(id), FOREIGN KEY(category_id) REFERENCES categories(id), FOREIGN KEY(assigned_representative_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS status_history (id INTEGER PRIMARY KEY, complaint_id INTEGER NOT NULL, actor_id INTEGER, status TEXT NOT NULL, action_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(complaint_id) REFERENCES complaints(id) ON DELETE CASCADE, FOREIGN KEY(actor_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, actor_id INTEGER, action TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(actor_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS web_sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS web_sessions_expires_idx ON web_sessions(expires);
CREATE INDEX IF NOT EXISTS complaints_constituency_idx ON complaints(constituency_id, status);
CREATE INDEX IF NOT EXISTS complaints_category_idx ON complaints(category_id);
CREATE INDEX IF NOT EXISTS complaints_citizen_idx ON complaints(citizen_id);
`);

const constituencies = [
  [111,'Mettupalayam','mettupalayam'],[116,'Sulur','sulur'],[117,'Kavundampalayam','kavundampalayam'],
  [118,'Coimbatore (North)','coimbatore-north'],[119,'Thondamuthur','thondamuthur'],
  [120,'Coimbatore (South)','coimbatore-south'],[121,'Singanallur','singanallur'],
  [122,'Kinathukadavu','kinathukadavu'],[123,'Pollachi','pollachi'],[124,'Valparai','valparai']
];
const source = 'https://coimbatore.nic.in/departments/election/';
const upsertConstituency = db.prepare('INSERT OR IGNORE INTO constituencies(ac_number,name,slug,verified_source) VALUES(?,?,?,?)');
const insertCategories = db.prepare('INSERT OR IGNORE INTO categories(name,slug,description,icon,display_order) VALUES(?,?,?,?,?)');
db.transaction(() => {
  for (const [number,name,slug] of constituencies) upsertConstituency.run(number,name,slug.replace(' ', '-'),source);
  [
    ['Water and Drinking Water','water-drinking-water','Water quality, access and supply issues.','◉'],
    ['Roads and Transportation','roads-transportation','Road conditions, safety and local transport issues.','↗'],
    ['Garbage and Waste Management','garbage-waste-management','Waste collection, litter and disposal issues.','♲'],
    ['Drainage and Sewage','drainage-sewage','Drainage, flooding and sewage concerns.','≋'],
    ['Electricity and Street Lights','electricity-street-lights','Public lighting and electrical infrastructure concerns.','✳'],
    ['Healthcare and Public Health','healthcare-public-health','Public health and local health facility concerns.','+'],
    ['Education and Public Facilities','education-public-facilities','Schools and shared public facility concerns.','⌂'],
    ['Agriculture and Environment','agriculture-environment','Environmental and agricultural concerns.','❋']
  ].forEach((c,i) => insertCategories.run(...c.slice(0,2),c[2],c[3],i+1));
})();
db.transaction(()=>{
  db.prepare("UPDATE categories SET name='Roads and Infrastructure',slug='roads-infrastructure',description='Road conditions and essential infrastructure concerns.',display_order=2,active=1 WHERE slug='roads-transportation'").run();
  db.prepare("UPDATE categories SET name='Education',slug='education',description='Education access and public learning facilities.',display_order=5,active=1 WHERE slug='education-public-facilities'").run();
  db.prepare("UPDATE categories SET name='Waste Management and Sanitation',slug='waste-management-sanitation',description='Waste collection, sanitation and cleanliness concerns.',display_order=7,active=1 WHERE slug='garbage-waste-management'").run();
  db.prepare("UPDATE categories SET active=0 WHERE slug IN ('electricity-street-lights','agriculture-environment')").run();
  db.prepare("INSERT OR IGNORE INTO categories(name,slug,description,icon,display_order) VALUES(?,?,?,?,?)").run('Employment','employment','Employment access and local livelihood concerns.','E',6);
  db.prepare("INSERT OR IGNORE INTO categories(name,slug,description,icon,display_order) VALUES(?,?,?,?,?)").run('Public Transport','public-transport','Public transport access and service concerns.','T',8);
})();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { "default-src": ["'self'"], "script-src": ["'self'"], "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], "font-src": ["'self'", 'https://fonts.gstatic.com'], "img-src": ["'self'", 'data:'], "connect-src": ["'self'"] } } }));
app.use(express.json({ limit: '40kb' }));
app.use(express.urlencoded({ extended: false, limit: '40kb' }));
class SqliteSessionStore extends session.Store {
  get(sid,callback){try{const row=db.prepare('SELECT sess,expires FROM web_sessions WHERE sid=?').get(sid);if(!row)return callback(null,null);if(row.expires<=Date.now()){db.prepare('DELETE FROM web_sessions WHERE sid=?').run(sid);return callback(null,null);}callback(null,JSON.parse(row.sess));}catch(error){callback(error);}}
  set(sid,sess,callback=()=>{}){try{const expires=sess.cookie?.expires?new Date(sess.cookie.expires).getTime():Date.now()+Number(sess.cookie?.maxAge||28800000);db.prepare('INSERT INTO web_sessions(sid,sess,expires) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expires=excluded.expires').run(sid,JSON.stringify(sess),expires);callback(null);}catch(error){callback(error);}}
  destroy(sid,callback=()=>{}){try{db.prepare('DELETE FROM web_sessions WHERE sid=?').run(sid);callback(null);}catch(error){callback(error);}}
  touch(sid,sess,callback=()=>{}){try{const expires=sess.cookie?.expires?new Date(sess.cookie.expires).getTime():Date.now()+Number(sess.cookie?.maxAge||28800000);db.prepare('UPDATE web_sessions SET expires=? WHERE sid=?').run(expires,sid);callback(null);}catch(error){callback(error);}}
}
app.use(session({ name: 'kk.sid', store:new SqliteSessionStore(), secret: process.env.SESSION_SECRET || 'local-development-secret-change-me-before-deploying', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 8 } }));
app.use((req,res,next)=>{
  if(!req.session.user)return next();
  const current=db.prepare('SELECT id,username,email,role,constituency_id,active FROM users WHERE id=?').get(req.session.user.id);
  if(!current||!current.active)return req.session.regenerate(error=>error?next(error):next());
  req.session.user=current;next();
});
app.use((req,res,next)=>req.path.startsWith('/data/')||req.path.startsWith('/uploads/')?res.sendStatus(404):next());
app.use((req,res,next)=>{
  const page=/^\/(?:index|divisions|constituency|resources|categories|category|login-options|account|workspace|setup-admin)\.html$/.test(req.path);
  if(req.path==='/'||page||req.path.startsWith('/static/'))return next();
  return res.sendStatus(404);
});
app.use(express.static(__dirname, { index: 'index.html', dotfiles: 'ignore' }));
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
const csrf = (req,res,next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  if (['POST','PUT','PATCH','DELETE'].includes(req.method) && req.path !== '/setup/admin') {
    const sent = req.get('x-csrf-token') || '';
    const expected = req.session.csrfToken;
    if (sent.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sent),Buffer.from(expected))) return res.status(403).json({error:'Security token expired. Reload the page and try again.'});
  }
  next();
};
app.use('/api', csrf);
const requireUser = (req,res,next) => req.session.user ? next() : res.status(401).json({error:'Sign in is required.'});
const requireRole = (...roles) => (req,res,next) => req.session.user && roles.includes(req.session.user.role) ? next() : res.status(req.session.user ? 403 : 401).json({error:'You are not authorised to do that.'});
const logAudit = db.prepare('INSERT INTO audit_logs(actor_id,action,object_type,object_id) VALUES(?,?,?,?)');
const userView = user => user && ({id:user.id,username:user.username,role:user.role,constituencyId:user.constituency_id});
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req,file,cb) => cb(null,crypto.randomBytes(18).toString('hex') + ({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[file.mimetype]||'.bin')) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req,file,cb) => ['image/jpeg','image/png','image/webp'].includes(file.mimetype) ? cb(null,true) : cb(new Error('Photo must be JPG, PNG or WebP.'))
});
function removeUpload(file) { if (file?.path) fs.promises.unlink(file.path).catch(()=>{}); }
function validText(value,max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function validImageSignature(file) {
  if (!file) return true;
  const fd=fs.openSync(file.path,'r');const bytes=Buffer.alloc(12);const read=fs.readSync(fd,bytes,0,12,0);fs.closeSync(fd);
  const b=bytes.subarray(0,read);
  return (b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)||(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP');
}
function complaintCounts() { return db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status IN ('Submitted','Under Review','In Progress') THEN 1 ELSE 0 END) pending, SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) resolved FROM complaints").get(); }
function profileSummary() { return db.prepare(`SELECT c.id,c.ac_number,c.name,c.slug,COUNT(x.id) complaint_count,
  SUM(CASE WHEN x.status IN ('Submitted','Under Review','In Progress') THEN 1 ELSE 0 END) pending_count,
  SUM(CASE WHEN x.status='Resolved' THEN 1 ELSE 0 END) resolved_count,
  m.full_name,m.party,m.biography,m.public_contact,m.photo_path,m.verification_source,m.last_verified
  FROM constituencies c LEFT JOIN complaints x ON x.constituency_id=c.id LEFT JOIN mla_profiles m ON m.constituency_id=c.id AND m.active=1
  WHERE c.active=1 GROUP BY c.id ORDER BY c.ac_number`).all(); }

app.get('/api/csrf', (req,res) => res.json({token:req.session.csrfToken}));
app.get('/api/me', (req,res) => res.json({user:userView(req.session.user),csrfToken:req.session.csrfToken}));
app.get('/api/profile', requireUser, (req,res)=>{const user=db.prepare('SELECT id,username,email,role,constituency_id FROM users WHERE id=?').get(req.session.user.id);res.json({...user,constituencyId:user.constituency_id});});
app.patch('/api/profile', requireUser, (req,res)=>{if(req.session.user.role!=='citizen')return res.status(403).json({error:'Only citizen profile fields can be changed here.'});const {username,constituencyId}=req.body||{};if(!validText(username,50)||!username.trim())return res.status(400).json({error:'Enter a valid username.'});if(constituencyId!==null&&constituencyId!==undefined&&!db.prepare('SELECT id FROM constituencies WHERE id=? AND active=1').get(Number(constituencyId)))return res.status(400).json({error:'Choose a valid constituency.'});try{db.prepare('UPDATE users SET username=?,constituency_id=? WHERE id=?').run(username.trim(),constituencyId?Number(constituencyId):null,req.session.user.id);logAudit.run(req.session.user.id,'updated citizen profile','user',req.session.user.id);res.json({ok:true});}catch{res.status(409).json({error:'That username is already in use.'});}});
app.post('/api/auth/register', async (req,res) => {
  const {username,email,password} = req.body || {};
  if (!validText(username,50) || !username.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password)>72) return res.status(400).json({error:'Enter a username, valid email, and password of at least 10 characters.'});
  try {
    const hash = await bcrypt.hash(password,12);
    const result = db.prepare('INSERT INTO users(username,email,password_hash,role) VALUES(?,?,?,?)').run(username.trim(),email.trim().toLowerCase(),hash,'citizen');
    const user = db.prepare('SELECT id,username,role,constituency_id FROM users WHERE id=?').get(result.lastInsertRowid);
    req.session.regenerate(error=>{if(error)return res.status(500).json({error:'Could not start a session.'});req.session.user=user;req.session.csrfToken=crypto.randomBytes(32).toString('hex');res.status(201).json({user:userView(user),csrfToken:req.session.csrfToken});});
  } catch (err) { res.status(409).json({error:'That username or email is already registered.'}); }
});
app.post('/api/auth/login', async (req,res) => {
  const {email,password} = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(String(email||'').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(String(password||''),user.password_hash))) return res.status(400).json({error:'Email or password is incorrect.'});
  const safeUser={id:user.id,username:user.username,role:user.role,constituency_id:user.constituency_id};
  req.session.regenerate(error => { if (error) return res.status(500).json({error:'Could not start a session.'}); req.session.user = safeUser; req.session.csrfToken = crypto.randomBytes(32).toString('hex'); res.json({user:userView(safeUser),csrfToken:req.session.csrfToken}); });
});
app.post('/api/auth/logout', requireUser, (req,res) => { req.session.destroy(()=>res.json({ok:true})); });
app.get('/api/categories', (req,res) => res.json(db.prepare('SELECT id,name,slug,description,icon FROM categories WHERE active=1 ORDER BY display_order').all()));
app.get('/api/categories/:slug', (req,res) => {const category=db.prepare('SELECT id,name,slug,description,icon FROM categories WHERE slug=? AND active=1').get(req.params.slug);if(!category)return res.status(404).json({error:'Category not found.'});const count=db.prepare('SELECT COUNT(*) count FROM complaints WHERE category_id=?').get(category.id).count;res.json({...category,count});});
app.get('/api/constituencies', (req,res) => res.json(profileSummary()));
app.get('/api/constituencies/:slug', (req,res) => {
  const record = profileSummary().find(item => item.slug === req.params.slug);
  if (!record) return res.status(404).json({error:'Constituency not found.'});
  const categoryCounts = db.prepare('SELECT c.name category,COUNT(x.id) count FROM categories c LEFT JOIN complaints x ON x.category_id=c.id AND x.constituency_id=? WHERE c.active=1 GROUP BY c.id ORDER BY c.display_order').all(record.id);
  res.json({...record,source,categoryCounts});
});
app.get('/api/resources', (req,res) => res.json(db.prepare('SELECT id,title,description,category,url FROM resources WHERE active=1 ORDER BY id DESC').all()));
app.get('/api/stats', (req,res) => {const counts=complaintCounts();const citizens=db.prepare("SELECT COUNT(*) count FROM users WHERE role='citizen' AND active=1").get().count;const representatives=db.prepare("SELECT COUNT(*) count FROM users WHERE role='representative' AND active=1").get().count;res.json({...counts,constituencies:db.prepare('SELECT COUNT(*) count FROM constituencies WHERE active=1').get().count,citizens,surveyResponses:counts.total,reportedIssues:counts.total,activeRepresentatives:representatives});});
app.get('/api/analytics', requireUser, requireRole('admin'), (req,res) => {
  res.json({stats:complaintCounts(),categories:db.prepare('SELECT c.name,COUNT(x.id) count FROM categories c LEFT JOIN complaints x ON x.category_id=c.id GROUP BY c.id ORDER BY c.display_order').all(),constituencies:profileSummary(),parties:db.prepare('SELECT party,COUNT(*) count,MAX(last_verified) last_verified FROM mla_profiles WHERE active=1 AND party IS NOT NULL AND party<>\'\' GROUP BY party ORDER BY count DESC').all(),trends:db.prepare("SELECT strftime('%Y-%m',created_at) month,COUNT(*) count FROM complaints GROUP BY month ORDER BY month DESC LIMIT 12").all()});
});
app.get('/api/representative/analytics', requireUser, requireRole('representative'), (req,res)=>{const cid=req.session.user.constituency_id;if(!cid)return res.status(403).json({error:'No authorised constituency is assigned.'});const stats=db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status IN ('Submitted','Under Review','In Progress') THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) resolved FROM complaints WHERE constituency_id=?").get(cid);const categories=db.prepare('SELECT c.name,c.slug,COUNT(x.id) count FROM categories c LEFT JOIN complaints x ON x.category_id=c.id AND x.constituency_id=? WHERE c.active=1 GROUP BY c.id ORDER BY c.display_order').all(cid);res.json({stats,categories});});
app.get('/api/reports/mine', requireUser, (req,res) => res.json(db.prepare('SELECT x.reference,x.title,x.description,x.locality,x.severity,x.status,x.created_at,c.name category,d.name constituency FROM complaints x JOIN categories c ON c.id=x.category_id JOIN constituencies d ON d.id=x.constituency_id WHERE x.citizen_id=? ORDER BY x.created_at DESC').all(req.session.user.id)));
app.get('/api/reports/workspace', requireUser, requireRole('admin','representative'), (req,res) => {
  const {id,role,constituency_id} = req.session.user;
  const rows = role === 'admin' ? db.prepare('SELECT x.reference,x.title,x.description,x.locality,x.severity,x.status,x.created_at,c.name category,d.name constituency FROM complaints x JOIN categories c ON c.id=x.category_id JOIN constituencies d ON d.id=x.constituency_id ORDER BY x.created_at DESC').all() : db.prepare('SELECT x.reference,x.title,x.description,x.locality,x.severity,x.status,x.created_at,c.name category,d.name constituency FROM complaints x JOIN categories c ON c.id=x.category_id JOIN constituencies d ON d.id=x.constituency_id WHERE x.constituency_id=? ORDER BY x.created_at DESC').all(constituency_id);
  res.json(rows);
});
app.post('/api/reports', upload.single('photo'), (req,res) => {
  const b=req.body||{}; const ageGroups=['Under 18','18–25','26–40','41–60','Over 60','Prefer not to say']; const severities=['Low','Medium','High','Urgent'];
  const constituency=db.prepare('SELECT id FROM constituencies WHERE slug=? AND active=1').get(b.constituency);
  const category=db.prepare('SELECT id FROM categories WHERE slug=? AND active=1').get(b.category);
  if (!validText(b.title,160)||!validText(b.description,4000)||!validText(b.locality,160)||!validText(b.duration,120)||typeof (b.suggestion||'')!=='string'||(b.suggestion||'').length>1500||!constituency||!category||!ageGroups.includes(b.ageGroup)||!severities.includes(b.severity)||!validImageSignature(req.file)) { removeUpload(req.file); return res.status(400).json({error:'Please complete all required fields, choose valid options and upload a valid image.'}); }
  const reference='KK-'+crypto.randomBytes(5).toString('hex').toUpperCase();
  try {
    const result=db.prepare(`INSERT INTO complaints(reference,citizen_id,reporter_name,age_group,constituency_id,category_id,title,description,locality,severity,duration,image_path,suggestion) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(reference,req.session.user?.id||null,validText(b.name||'',100)?b.name.trim():null,b.ageGroup,constituency.id,category.id,b.title.trim(),b.description.trim(),b.locality.trim(),b.severity,b.duration.trim(),req.file?.filename||null,(b.suggestion||'').trim());
    db.prepare("INSERT INTO status_history(complaint_id,actor_id,status,action_note) VALUES(?,?,?,?)").run(result.lastInsertRowid,req.session.user?.id||null,'Submitted','Report received by the platform.');
    res.status(201).json({ok:true,reference});
  } catch (error) { removeUpload(req.file); res.status(500).json({error:'The report could not be saved. Please try again.'}); }
});
app.patch('/api/reports/:reference/status', requireUser, requireRole('admin','representative'), (req,res) => {
  const {status,note=''}=req.body||{}; const allowed=['Submitted','Under Review','In Progress','Resolved','Rejected'];
  const complaint=db.prepare('SELECT * FROM complaints WHERE reference=?').get(req.params.reference);
  if (!complaint) return res.status(404).json({error:'Report not found.'});
  const actor=req.session.user;
  if (actor.role==='representative' && (!actor.constituency_id || actor.constituency_id!==complaint.constituency_id)) return res.status(403).json({error:'This report is outside your authorised constituency.'});
  if (!allowed.includes(status)||typeof note!=='string'||note.length>2000) return res.status(400).json({error:'Choose a valid status and keep the progress note under 2,000 characters.'});
  db.transaction(()=>{db.prepare('UPDATE complaints SET status=?,resolved_at=? WHERE id=?').run(status,status==='Resolved'?new Date().toISOString():null,complaint.id);db.prepare('INSERT INTO status_history(complaint_id,actor_id,status,action_note) VALUES(?,?,?,?)').run(complaint.id,actor.id,status,note.trim());logAudit.run(actor.id,'updated complaint status','complaint',complaint.reference);})();
  res.json({ok:true});
});
app.get('/api/reports/:reference', requireUser, (req,res) => {
  const c=db.prepare('SELECT x.*,d.name constituency,c.name category FROM complaints x JOIN constituencies d ON d.id=x.constituency_id JOIN categories c ON c.id=x.category_id WHERE x.reference=?').get(req.params.reference);
  if (!c) return res.status(404).json({error:'Report not found.'});
  const user=req.session.user;
  if(user.role!=='admin'&&c.citizen_id!==user.id&&!(user.role==='representative'&&user.constituency_id===c.constituency_id)) return res.status(403).json({error:'You are not authorised to view this report.'});
  const history=db.prepare('SELECT status,action_note,created_at FROM status_history WHERE complaint_id=? ORDER BY created_at').all(c.id);
  delete c.citizen_id; delete c.image_path;
  res.json({...c,history});
});
app.get('/api/reports/:reference/photo', requireUser, (req,res) => {
  const c=db.prepare('SELECT id,citizen_id,constituency_id,image_path FROM complaints WHERE reference=?').get(req.params.reference);
  if (!c||!c.image_path) return res.sendStatus(404);
  const user=req.session.user;
  if(user.role!=='admin'&&c.citizen_id!==user.id&&!(user.role==='representative'&&user.constituency_id===c.constituency_id)) return res.sendStatus(403);
  res.setHeader('Cache-Control','private, no-store'); res.sendFile(path.join(UPLOAD_DIR,path.basename(c.image_path)));
});
app.get('/api/admin/audit', requireUser, requireRole('admin'), (req,res)=>res.json(db.prepare('SELECT a.action,a.object_type,a.object_id,a.created_at,u.username actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 300').all()));
app.get('/api/admin/users', requireUser, requireRole('admin'), (req,res)=>res.json(db.prepare('SELECT id,username,email,role,constituency_id,active,created_at FROM users ORDER BY id DESC').all()));
app.patch('/api/admin/users/:id', requireUser, requireRole('admin'), (req,res)=>{
  const {role,constituencyId,active}=req.body||{};const roles=['admin','citizen','representative'];
  if(!roles.includes(role)||!(constituencyId===null||Number.isInteger(constituencyId))||typeof active!=='boolean')return res.status(400).json({error:'Invalid account update.'});
  if(role==='representative'&&!constituencyId)return res.status(400).json({error:'Representatives must have an assigned constituency.'});
  db.prepare('UPDATE users SET role=?,constituency_id=?,active=? WHERE id=?').run(role,constituencyId,active?1:0,req.params.id);
  logAudit.run(req.session.user.id,'updated user access','user',req.params.id);res.json({ok:true});
});
app.post('/api/admin/mla', requireUser, requireRole('admin'), (req,res)=>{
  const b=req.body||{};const d=db.prepare('SELECT id FROM constituencies WHERE id=?').get(Number(b.constituencyId));
  if(!d||!validText(b.name,160)||!validText(b.source,500)||!/^https:\/\//.test(b.source)||!/^\d{4}-\d{2}-\d{2}$/.test(b.lastVerified))return res.status(400).json({error:'A name, constituency, HTTPS source and verification date are required.'});
  db.prepare(`INSERT INTO mla_profiles(constituency_id,full_name,party,biography,public_contact,verification_source,last_verified,active) VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(constituency_id) DO UPDATE SET full_name=excluded.full_name,party=excluded.party,biography=excluded.biography,public_contact=excluded.public_contact,verification_source=excluded.verification_source,last_verified=excluded.last_verified,active=1`).run(d.id,b.name.trim(),validText(b.party||'',100)?b.party.trim():null,typeof b.biography==='string'?b.biography.slice(0,2000):'',typeof b.publicContact==='string'?b.publicContact.slice(0,240):'',b.source,b.lastVerified);
  logAudit.run(req.session.user.id,'created or updated MLA profile','mla_profile',d.id);res.status(201).json({ok:true});
});
app.post('/api/admin/resources', requireUser, requireRole('admin'), (req,res)=>{
  const b=req.body||{};try{const url=new URL(b.url);const sourceUrl=new URL(b.source);if(!['http:','https:'].includes(url.protocol)||sourceUrl.protocol!=='https:')throw new Error();if(!validText(b.title,180)||!validText(b.description,1000)||!validText(b.category,80)||!validText(b.source,500))throw new Error();const r=db.prepare('INSERT INTO resources(title,description,category,url,verification_source) VALUES(?,?,?,?,?)').run(b.title.trim(),b.description.trim(),b.category.trim(),url.toString(),sourceUrl.toString());logAudit.run(req.session.user.id,'created public resource','resource',r.lastInsertRowid);res.status(201).json({ok:true,id:r.lastInsertRowid});}catch{res.status(400).json({error:'Enter resource details and HTTPS verification source.'});}
});
app.get('/api/admin/resources', requireUser, requireRole('admin'), (req,res)=>res.json(db.prepare('SELECT * FROM resources ORDER BY id DESC').all()));
app.patch('/api/admin/resources/:id', requireUser, requireRole('admin'), (req,res)=>{if(typeof req.body?.active!=='boolean')return res.status(400).json({error:'Choose an active state.'});const r=db.prepare('UPDATE resources SET active=? WHERE id=?').run(req.body.active?1:0,req.params.id);if(!r.changes)return res.status(404).json({error:'Resource not found.'});logAudit.run(req.session.user.id,req.body.active?'activated resource':'deactivated resource','resource',req.params.id);res.json({ok:true});});
app.patch('/api/admin/mla/:id', requireUser, requireRole('admin'), (req,res)=>{if(typeof req.body?.active!=='boolean')return res.status(400).json({error:'Choose an active state.'});const r=db.prepare('UPDATE mla_profiles SET active=? WHERE id=?').run(req.body.active?1:0,req.params.id);if(!r.changes)return res.status(404).json({error:'MLA profile not found.'});logAudit.run(req.session.user.id,req.body.active?'activated MLA profile':'deactivated MLA profile','mla_profile',req.params.id);res.json({ok:true});});
app.post('/api/admin/categories', requireUser, requireRole('admin'), (req,res)=>{const b=req.body||{};if(!validText(b.name,100)||!validText(b.description,500)||!validText(b.icon||'◇',12)||!Number.isInteger(Number(b.displayOrder))||Number(b.displayOrder)<0||Number(b.displayOrder)>100)return res.status(400).json({error:'Enter a category name, description and order.'});const slug=b.name.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!slug)return res.status(400).json({error:'Category name must include English letters or numbers for its URL.'});try{const result=db.prepare('INSERT INTO categories(name,slug,description,icon,display_order) VALUES(?,?,?,?,?)').run(b.name.trim(),slug,b.description.trim(),b.icon||'◇',Number(b.displayOrder));logAudit.run(req.session.user.id,'created category','category',result.lastInsertRowid);res.status(201).json({ok:true});}catch{res.status(409).json({error:'A category with that name already exists.'});}});
app.patch('/api/admin/categories/:id', requireUser, requireRole('admin'), (req,res,next)=>{
  const b=req.body||{};
  const current=db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if(!current)return res.status(404).json({error:'Category not found.'});
  const name=b.name===undefined?current.name:b.name;
  const description=b.description===undefined?current.description:b.description;
  const icon=b.icon===undefined?current.icon:b.icon;
  if(typeof b.active!=='boolean'||!Number.isInteger(Number(b.displayOrder))||Number(b.displayOrder)<0||Number(b.displayOrder)>100||!validText(name,100)||!validText(description,500)||!validText(icon,12))return res.status(400).json({error:'Enter valid category details and display order.'});
  const slug=name.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(!slug)return res.status(400).json({error:'Category name must include English letters or numbers for its URL.'});
  try{db.prepare('UPDATE categories SET name=?,slug=?,description=?,icon=?,active=?,display_order=? WHERE id=?').run(name.trim(),slug,description.trim(),icon,b.active?1:0,Number(b.displayOrder),req.params.id);logAudit.run(req.session.user.id,'updated category','category',req.params.id);res.json({ok:true});}catch{res.status(409).json({error:'Category name or URL is already in use.'});}
});
app.get('/api/admin/categories', requireUser, requireRole('admin'), (req,res)=>res.json(db.prepare('SELECT * FROM categories ORDER BY display_order').all()));
app.get('/api/admin/mlas', requireUser, requireRole('admin'), (req,res)=>res.json(db.prepare('SELECT m.id,m.full_name,m.party,m.last_verified,m.active,c.name constituency FROM mla_profiles m JOIN constituencies c ON c.id=m.constituency_id ORDER BY c.ac_number').all()));
app.get('/api/setup/status', (req,res)=>res.json({adminExists:!!db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get()}));
app.post('/api/setup/admin', rateLimit({windowMs:60*60*1000,limit:5}), async (req,res)=>{
  if(db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get())return res.status(403).json({error:'An administrator account already exists.'});
  const {username,email,password,setupKey}=req.body||{};
  if(!process.env.ADMIN_SETUP_KEY||setupKey!==process.env.ADMIN_SETUP_KEY)return res.status(403).json({error:'Administrator setup key is not valid.'});
  if(!validText(username,50)||!username.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')||typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)return res.status(400).json({error:'Use a username, valid email and a password with at least 12 characters.'});
  try{const hash=await bcrypt.hash(password,12);if(db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get())return res.status(403).json({error:'An administrator account already exists.'});const result=db.prepare('INSERT INTO users(username,email,password_hash,role) VALUES(?,?,?,?)').run(username.trim(),email.trim().toLowerCase(),hash,'admin');logAudit.run(result.lastInsertRowid,'created first administrator','user',result.lastInsertRowid);res.status(201).json({ok:true});}catch{res.status(409).json({error:'Username or email is already in use.'});}
});

app.use((err,req,res,next)=>{
  if (req.file) removeUpload(req.file);
  if (err instanceof multer.MulterError) return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'Photo must be 5 MB or smaller.':'Could not accept the photo upload.'});
  if (err.message==='Photo must be JPG, PNG or WebP.') return res.status(400).json({error:err.message});
  console.error(err);res.status(500).json({error:'Something went wrong on the server.'});
});
app.listen(PORT,()=>console.log(`Kovai Kural AI is listening on http://localhost:${PORT}`));
