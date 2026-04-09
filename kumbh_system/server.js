const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOtp, OTP_MODE } = require('./otpProvider');

const app = express();
const PORT = process.env.PORT || 8082;
const JWT_SECRET = process.env.JWT_SECRET || 'kumbh-2028-enterprise-secret';

const dbPath = path.join(__dirname, 'data', 'kumbh.db');
const db = new Database(dbPath);

// ============ DATABASE SCHEMA ============
db.exec(`
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  head_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  relative_phone TEXT NOT NULL,
  language TEXT NOT NULL,
  face_photo TEXT,
  status TEXT NOT NULL,
  otp TEXT,
  family_size INTEGER DEFAULT 1,
  aadhar_verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dependents (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  action_category TEXT,
  phone TEXT NOT NULL,
  description TEXT,
  media_data TEXT,
  media_type TEXT,
  media_duration_sec INTEGER,
  language TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution_note TEXT,
  resolution_action TEXT,
  linked_registration_id TEXT,
  face_match_score REAL,
  assigned_to TEXT,
  assigned_unit TEXT,
  escalated INTEGER DEFAULT 0,
  escalation_level INTEGER DEFAULT 0,
  escalated_at TEXT,
  escalated_to TEXT,
  sla_due_at TEXT,
  sla_breached INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  display_name TEXT,
  department TEXT,
  phone TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queue_assignment (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  pickup_time TEXT,
  resolved_time TEXT,
  resolution TEXT,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS sla_tracking (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  priority TEXT,
  sla_minutes INTEGER,
  sla_due_at TEXT,
  sla_breached INTEGER DEFAULT 0,
  breach_time_sec INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);
`);

// ============ ENSURE ALL COLUMNS ============
function ensureColumn(tableName, columnName, columnDef) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const hasColumn = cols.some((c) => c.name === columnName);
    if (!hasColumn) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    }
  } catch (err) {
    console.log(`Column ${columnName} already exists in ${tableName}`);
  }
}

ensureColumn('registrations', 'family_size', 'INTEGER DEFAULT 1');
ensureColumn('registrations', 'aadhar_verified', 'INTEGER DEFAULT 0');
ensureColumn('registrations', 'updated_at', 'TEXT');
ensureColumn('dependents', 'gender', 'TEXT');
ensureColumn('dependents', 'created_at', 'TEXT');
ensureColumn('tickets', 'media_duration_sec', 'INTEGER');
ensureColumn('tickets', 'resolution_action', 'TEXT');
ensureColumn('tickets', 'assigned_unit', 'TEXT');
ensureColumn('tickets', 'escalated_at', 'TEXT');
ensureColumn('tickets', 'escalated_to', 'TEXT');
ensureColumn('tickets', 'sla_breached', 'INTEGER DEFAULT 0');
ensureColumn('tickets', 'updated_at', 'TEXT');
ensureColumn('users', 'department', 'TEXT');
ensureColumn('users', 'phone', 'TEXT');
ensureColumn('audit_logs', 'ip_address', 'TEXT');

// ============ PREPARED STATEMENTS ============
const stmts = {
  // Registrations
  findRegistrationByPhone: db.prepare('SELECT * FROM registrations WHERE phone = ?'),
  createRegistration: db.prepare(`
    INSERT INTO registrations (id, head_name, phone, relative_phone, language, face_photo, status, otp, family_size, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getRegistrationById: db.prepare('SELECT * FROM registrations WHERE id = ?'),
  updateRegistrationStatus: db.prepare('UPDATE registrations SET status = ?, otp = NULL, updated_at = ? WHERE id = ?'),
  getAllRegistrations: db.prepare('SELECT * FROM registrations ORDER BY created_at DESC LIMIT ?'),
  countRegistrations: db.prepare('SELECT COUNT(*) AS total FROM registrations'),
  
  // Dependents
  addDependent: db.prepare(`
    INSERT INTO dependents (id, registration_id, name, relation, age, gender, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getDependents: db.prepare('SELECT * FROM dependents WHERE registration_id = ? ORDER BY created_at ASC'),
  
  // Tickets
  createTicket: db.prepare(`
    INSERT INTO tickets (id, action_type, action_category, phone, description, media_data, media_type, media_duration_sec, language, priority, status, assigned_to, assigned_unit, escalated, escalation_level, sla_due_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getTicketById: db.prepare('SELECT * FROM tickets WHERE id = ?'),
  getTicketsByStatus: db.prepare('SELECT * FROM tickets WHERE status = ? ORDER BY priority DESC, created_at ASC LIMIT ?'),
  getAllTickets: db.prepare('SELECT * FROM tickets ORDER BY priority DESC, created_at DESC LIMIT ?'),
  countTickets: db.prepare('SELECT COUNT(*) AS total FROM tickets'),
  countOpenTickets: db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE status = 'OPEN'"),
  countTicketsByStatus: db.prepare('SELECT status, COUNT(*) AS total FROM tickets GROUP BY status'),
  assignTicket: db.prepare('UPDATE tickets SET assigned_to = ?, assigned_unit = ?, status = ?, updated_at = ? WHERE id = ?'),
  resolveTicket: db.prepare(`
    UPDATE tickets SET status = ?, resolved_at = ?, resolved_by = ?, resolution_note = ?, 
    resolution_action = ?, linked_registration_id = ?, face_match_score = ?, updated_at = ? WHERE id = ?
  `),
  escalateTicket: db.prepare('UPDATE tickets SET escalated = 1, escalation_level = ?, escalated_at = ?, escalated_to = ?, sla_breached = 1, updated_at = ? WHERE id = ?'),
  updateTicketStatus: db.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?'),
  getEscalationCandidates: db.prepare("SELECT id, escalation_level FROM tickets WHERE status != 'CLOSED' AND sla_due_at IS NOT NULL AND datetime(sla_due_at) < datetime('now')"),
  getTicketsByPhone: db.prepare('SELECT * FROM tickets WHERE phone = ? ORDER BY created_at DESC LIMIT ?'),
  
  // Users
  createUser: db.prepare(`
    INSERT INTO users (id, username, password_hash, role, display_name, department, phone, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getAllUsers: db.prepare('SELECT id, username, role, display_name, department, active, created_at FROM users WHERE active = 1'),
  updateUserRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
  
  // Queue Assignments
  createQueueAssignment: db.prepare(`
    INSERT INTO queue_assignment (id, ticket_id, assigned_to, assigned_by, assigned_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  getQueueAssignmentByTicket: db.prepare('SELECT * FROM queue_assignment WHERE ticket_id = ?'),
  
  // SLA Tracking
  createSLATracking: db.prepare(`
    INSERT INTO sla_tracking (id, ticket_id, priority, sla_minutes, sla_due_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  checkSLABreached: db.prepare("SELECT COUNT(*) AS breached FROM sla_tracking WHERE ticket_id = ? AND sla_breached = 1"),
  
  // Audit
  createAudit: db.prepare(`
    INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, detail, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getRecentAudit: db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?'),
};

function audit(actor, action, entityType, entityId, detail, ipAddress) {
  stmts.createAudit.run(uuidv4(), actor || null, action, entityType, entityId || null, detail || null, ipAddress || null, new Date().toISOString());
}

function seedUsersIfMissing() {
  const admin = stmts.getUserByUsername.get('admin');
  if (!admin) {
    stmts.createUser.run(
      uuidv4(), 'admin', bcrypt.hashSync('Admin@123', 10), 'ADMIN',
      'System Administrator', 'IT', '+919999999999', 1, new Date().toISOString()
    );
  }

  const control = stmts.getUserByUsername.get('control');
  if (!control) {
    stmts.createUser.run(
      uuidv4(), 'control', bcrypt.hashSync('Control@123', 10), 'CONTROL_ROOM',
      'Control Room Officer', 'Command Center', '+919888888888', 1, new Date().toISOString()
    );
  }

  const police = stmts.getUserByUsername.get('police');
  if (!police) {
    stmts.createUser.run(
      uuidv4(), 'police', bcrypt.hashSync('Police@123', 10), 'POLICE_OFFICER',
      'Police Officer', 'Field Operations', '+919777777777', 1, new Date().toISOString()
    );
  }

  const queue = stmts.getUserByUsername.get('queue');
  if (!queue) {
    stmts.createUser.run(
      uuidv4(), 'queue', bcrypt.hashSync('Queue@123', 10), 'QUEUE_MANAGER',
      'Queue Manager', 'Queue Management', '+919666666666', 1, new Date().toISOString()
    );
  }
}

seedUsersIfMissing();

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getClientIp(req) {
  return req.ip || req.connection.remoteAddress || 'unknown';
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: 'Authorization token missing' });
  }
  const token = auth.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: 'Invalid or expired token' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions for this operation' });
    }
    return next();
  };
}

function computeSlaDueIso(priority) {
  const base = new Date();
  const minutes = priority === 'HIGH' ? 15 : (priority === 'URGENT' ? 5 : 60);
  base.setMinutes(base.getMinutes() + minutes);
  return base.toISOString();
}

function calculateFaceMatchScore(data1, data2) {
  if (!data1 || !data2) return 0;
  const hash1 = crypto.createHash('sha256').update(String(data1)).digest();
  const hash2 = crypto.createHash('sha256').update(String(data2)).digest();
  let matches = 0;
  const len = Math.min(hash1.length, hash2.length);
  for (let i = 0; i < len; i++) {
    if (hash1[i] === hash2[i]) matches++;
  }
  return Math.round((matches / len) * 100);
}

function computeTicketUrgencyScore(ticket) {
  const now = Date.now();
  const createdAt = ticket.created_at ? new Date(ticket.created_at).getTime() : now;
  const waitMins = Math.max(0, Math.round((now - createdAt) / 60000));
  const priorityScore = ticket.priority === 'HIGH' ? 40 : 20;
  const statusScore = ticket.status === 'OPEN' ? 25 : (ticket.status === 'IN_PROGRESS' ? 10 : 0);
  const escalationScore = Number(ticket.escalated || 0) ? 30 : 0;
  const breachScore = Number(ticket.sla_breached || 0) ? 35 : 0;
  const waitScore = Math.min(35, Math.floor(waitMins / 3));
  return priorityScore + statusScore + escalationScore + breachScore + waitScore;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ============ PUBLIC ENDPOINTS ============
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'ujjain-kumbh-2028-enterprise',
    version: '2.0',
    timestamp: new Date().toISOString(),
    otpMode: OTP_MODE
  });
});

app.get('/api/insights/kumbh-2025-analysis', (req, res) => {
  const response = {
    ok: true,
    title: 'Kumbh 2025 Operational Learnings for 2028',
    lessons: [
      {
        area: 'Crowd Surge Management',
        finding: 'Bottleneck points around entry gates and major ghats caused intermittent surge risk.',
        featureFor2028: 'AI queue heat alerts, dynamic route diversion, officer auto-assignment by sector.'
      },
      {
        area: 'Lost and Reunification',
        finding: 'Lost person and document cases peaked during peak aarti windows.',
        featureFor2028: 'Face-match assisted reunification, family QR identity card, dedicated reunification workflow.'
      },
      {
        area: 'Response Time Consistency',
        finding: 'Manual prioritization delayed field dispatch for non-obvious critical tickets.',
        featureFor2028: 'Urgency scoring engine, SLA breach predictor, one-click quick resolve templates.'
      },
      {
        area: 'Citizen Usability',
        finding: 'Multi-lingual and low-literacy user groups needed simpler complaint flow.',
        featureFor2028: 'Voice-assisted forms, icon-first UI, offline kiosk fallback + OTP retry.'
      },
      {
        area: 'Control Room Workload',
        finding: 'Peak load created operator fatigue and repetitive manual actions.',
        featureFor2028: 'Bulk auto-assign, shift-ready queue presets, live command checklist and escalation guardrails.'
      }
    ],
    priorities2028: [
      'Zero-lost pilgrim mission',
      'Sub-15 minute high-priority response',
      'Sector-level live intelligence and command actions',
      'Unified Mahakal-theme citizen-first digital experience'
    ]
  };
  return res.json(response);
});

// ============ AUTH ENDPOINTS ============
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: 'username and password required' });
  }

  const user = stmts.getUserByUsername.get(String(username).trim());
  if (!user || !user.active) {
    audit(String(username).trim(), 'AUTH_LOGIN_FAILED', 'USER', null, 'Invalid credentials', getClientIp(req));
    return res.status(401).json({ ok: false, message: 'Invalid credentials' });
  }

  if (!bcrypt.compareSync(String(password), user.password_hash)) {
    audit(String(username).trim(), 'AUTH_LOGIN_FAILED', 'USER', user.id, 'Wrong password', getClientIp(req));
    return res.status(401).json({ ok: false, message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  audit(user.username, 'AUTH_LOGIN_SUCCESS', 'USER', user.id, `role=${user.role}`, getClientIp(req));

  return res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      department: user.department
    }
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  audit(req.user.username, 'AUTH_LOGOUT', 'USER', req.user.userId, '', getClientIp(req));
  res.json({ ok: true, message: 'Logout successful' });
});

// ============ REGISTRATION ENDPOINTS ============
app.post('/api/register/start', (req, res) => {
  const { headName, phone, relativePhone, language, facePhoto } = req.body;

  if (!headName || !phone || !relativePhone || !language || !facePhoto) {
    return res.status(400).json({
      ok: false,
      message: 'Required fields: headName, phone, relativePhone, language, facePhoto'
    });
  }

  const existing = stmts.findRegistrationByPhone.get(phone.trim());
  if (existing) {
    return res.status(409).json({
      ok: false,
      message: 'Phone number already registered',
      blocked: true,
      existingRegistration: existing.id
    });
  }

  const id = uuidv4();
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const now = new Date().toISOString();

  stmts.createRegistration.run(id, headName.trim(), phone.trim(), relativePhone.trim(), language.trim(), facePhoto || null, 'PENDING_OTP', otp, 1, now, now);

  sendOtp(phone.trim(), otp).then((otpResult) => {
    if (!otpResult.ok) {
      return res.status(502).json({ ok: false, message: `OTP send failed: ${otpResult.error}` });
    }

    const payload = {
      ok: true,
      message: 'Registration started. Please verify OTP.',
      registrationId: id,
      otpProvider: otpResult.provider,
      otpMode: OTP_MODE
    };

    if (OTP_MODE !== 'VENDOR') {
      payload.otpForTesting = otp;
    }

    return res.json(payload);
  }).catch((err) => {
    return res.status(500).json({ ok: false, message: 'OTP service error', error: err.message });
  });
});

app.post('/api/register/dependent', (req, res) => {
  const { registrationId, name, relation, age, gender } = req.body;
  if (!registrationId || !name || !relation) {
    return res.status(400).json({ ok: false, message: 'registrationId, name, relation required' });
  }

  const reg = stmts.getRegistrationById.get(registrationId);
  if (!reg) {
    return res.status(404).json({ ok: false, message: 'Registration not found' });
  }

  stmts.addDependent.run(uuidv4(), registrationId, name.trim(), relation.trim(), age || null, gender || null, new Date().toISOString());

  const dependents = stmts.getDependents.all(registrationId);
  return res.json({ ok: true, dependentCount: dependents.length, dependents });
});

app.post('/api/register/verify-otp', (req, res) => {
  const { registrationId, otp } = req.body;
  if (!registrationId || !otp) {
    return res.status(400).json({ ok: false, message: 'registrationId and otp required' });
  }

  const reg = stmts.getRegistrationById.get(registrationId);
  if (!reg) {
    return res.status(404).json({ ok: false, message: 'Registration not found' });
  }

  if (reg.otp !== otp) {
    return res.status(401).json({ ok: false, message: 'Invalid OTP' });
  }

  stmts.updateRegistrationStatus.run('COMPLETE', new Date().toISOString(), registrationId);
  audit('citizen', 'REGISTRATION_COMPLETE', 'REGISTRATION', registrationId, `phone=${reg.phone}`, getClientIp(req));

  return res.json({
    ok: true,
    message: 'Registration verified successfully',
    registration: stmts.getRegistrationById.get(registrationId)
  });
});

app.get('/api/register/:id', (req, res) => {
  const reg = stmts.getRegistrationById.get(req.params.id);
  if (!reg) {
    return res.status(404).json({ ok: false, message: 'Registration not found' });
  }
  const dependents = stmts.getDependents.all(req.params.id);
  return res.json({ ok: true, registration: reg, dependents, familySize: dependents.length + 1 });
});

app.get('/api/pro/registration/by-phone/:phone', (req, res) => {
  const reg = stmts.findRegistrationByPhone.get(String(req.params.phone || '').trim());
  if (!reg) {
    return res.status(404).json({ ok: false, message: 'Registration not found for this phone' });
  }
  return res.json({ ok: true, registration: reg });
});

app.get('/api/pro/registration/:id/qr', async (req, res) => {
  const reg = stmts.getRegistrationById.get(req.params.id);
  if (!reg) {
    return res.status(404).json({ ok: false, message: 'Registration not found' });
  }

  const dependents = stmts.getDependents.all(req.params.id);
  const payload = {
    registrationId: reg.id,
    headName: reg.head_name,
    phone: reg.phone,
    language: reg.language,
    familySize: dependents.length + 1,
    issuedAt: new Date().toISOString(),
    zone: 'Ujjain Kumbh 2028'
  };

  try {
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), { width: 360, margin: 2 });
    return res.json({ ok: true, payload, qrDataUrl });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'QR generation failed', error: err.message });
  }
});

// ============ TICKET/ACTION ENDPOINTS ============
app.post('/api/action/report', (req, res) => {
  const { actionType, actionCategory, phone, description, mediaData, mediaType, mediaDurationSec, language } = req.body;

  if (!actionType || !language) {
    return res.status(400).json({ ok: false, message: 'actionType and language required' });
  }

  const actionTypes = ['HELP', 'COMPLAINT', 'LOST', 'FOUND'];
  if (!actionTypes.includes(actionType)) {
    return res.status(400).json({ ok: false, message: `Invalid actionType. Allowed: ${actionTypes.join(', ')}` });
  }

  const categories = {
    HELP: ['Medical Emergency', 'Police Assistance', 'Women Safety', 'Senior Citizen', 'Child Assistance', 'Missing Person', 'Navigation', 'Transport', 'Other'],
    COMPLAINT: ['Crowd Management', 'Security Misconduct', 'Harassment', 'Theft', 'Sanitation', 'Toilet Issue', 'Food Quality', 'Overpricing', 'Staff Behavior', 'Other'],
    LOST: ['Document', 'Phone', 'Money', 'Jewelry', 'Clothes', 'Other'],
    FOUND: ['Document', 'Phone', 'Money', 'Jewelry', 'Clothes', 'Aadhar', 'Other']
  };

  if (!actionCategory || !categories[actionType] || !categories[actionType].includes(actionCategory)) {
    return res.status(400).json({ ok: false, message: `Invalid actionCategory for ${actionType}` });
  }

  if (mediaType && String(mediaType).startsWith('video/')) {
    const duration = Number(mediaDurationSec || 0);
    if (!Number.isFinite(duration) || duration > 20) {
      return res.status(400).json({ ok: false, message: 'Video must be 20 seconds or less' });
    }
  }

  const priority = actionType === 'HELP' ? 'HIGH' : 'NORMAL';
  const id = `TK-${Date.now().toString().slice(-7)}`;
  const now = new Date().toISOString();

  const reporterPhone = String(phone || '').trim() || `ANON-${Date.now().toString().slice(-8)}`;

  stmts.createTicket.run(
    id, actionType, actionCategory, reporterPhone,
    `${actionCategory}${description ? ` | ${description}` : ''}`,
    mediaData || null, mediaType || null, mediaDurationSec || null,
    language, priority, 'OPEN', null, null, 0, 0, computeSlaDueIso(priority), now, now
  );

  // Create SLA Tracking
  const slaMins = priority === 'HIGH' ? 15 : 60;
  stmts.createSLATracking.run(uuidv4(), id, priority, slaMins, computeSlaDueIso(priority), new Date().toISOString());

  audit('citizen', 'TICKET_CREATED', 'TICKET', id, `type=${actionType}|category=${actionCategory}`, getClientIp(req));

  const ticket = stmts.getTicketById.get(id);
  return res.json({ ok: true, ticket, message: 'Ticket created successfully' });
});

app.get('/api/ticket/:id', (req, res) => {
  const ticket = stmts.getTicketById.get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ ok: false, message: 'Ticket not found' });
  }
  return res.json({ ok: true, ticket });
});

// ============ CONTROL ROOM ENDPOINTS ============
app.get('/api/control-room/queue', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM', 'POLICE_OFFICER', 'QUEUE_MANAGER']), (req, res) => {
  const status = String(req.query.status || 'OPEN').toUpperCase();
  const allowed = ['OPEN', 'IN_PROGRESS', 'CLOSED', 'ALL'];

  if (!allowed.includes(status)) {
    return res.status(400).json({ ok: false, message: 'Invalid status filter' });
  }

  const items = status === 'ALL'
    ? stmts.getAllTickets.all(500)
    : stmts.getTicketsByStatus.all(status, 500);

  audit(req.user.username, 'VIEW_QUEUE', 'QUEUE', null, `status=${status}|count=${items.length}`, getClientIp(req));

  return res.json({ ok: true, status, count: items.length, items });
});

app.get('/api/control-room/dashboard', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM', 'POLICE_OFFICER']), (req, res) => {
  const totalRegistrations = stmts.countRegistrations.get().total;
  const totalTickets = stmts.countTickets.get().total;
  const openTickets = stmts.countOpenTickets.get().total;
  const statusBreakdown = stmts.countTicketsByStatus.all();

  const recentTickets = stmts.getAllTickets.all(10);
  const recentRegistrations = stmts.getAllRegistrations.all(5);

  const escalatedTickets = db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE escalated = 1 AND status != 'CLOSED'").get().total;
  const slaBreachedTickets = db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE sla_breached = 1").get().total;

  const avgResolutionTime = db.prepare(`
    SELECT AVG(CAST((julianday(resolved_at) - julianday(created_at)) * 24 * 60 AS INTEGER)) AS avg_minutes
    FROM tickets WHERE resolved_at IS NOT NULL AND status = 'CLOSED'
  `).get().avg_minutes || 0;

  audit(req.user.username, 'VIEW_DASHBOARD', 'DASHBOARD', null, '', getClientIp(req));

  return res.json({
    ok: true,
    totals: {
      registrations: totalRegistrations,
      totalTickets,
      openTickets,
      escalatedTickets,
      slaBreachedTickets,
      avgResolutionTimeMins: Math.round(avgResolutionTime)
    },
    statusBreakdown,
    recentTickets,
    recentRegistrations
  });
});

app.get('/api/control-room/analytics', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM']), (req, res) => {
  const hourly = db.prepare(`
    SELECT CAST(strftime('%Y-%m-%d %H:00', created_at) AS TEXT) AS hour, COUNT(*) AS count
    FROM tickets
    GROUP BY hour
    ORDER BY hour DESC
    LIMIT 24
  `).all();

  const byType = db.prepare(`
    SELECT action_type, COUNT(*) AS count
    FROM tickets
    GROUP BY action_type
  `).all();

  const byCategory = db.prepare(`
    SELECT action_category, COUNT(*) AS count
    FROM tickets
    GROUP BY action_category
    ORDER BY count DESC
    LIMIT 10
  `).all();

  const byPriority = db.prepare(`
    SELECT priority, COUNT(*) AS count
    FROM tickets
    GROUP BY priority
  `).all();

  const resolutionStats = db.prepare(`
    SELECT
      COUNT(*) AS total_resolved,
      AVG(CAST((julianday(resolved_at) - julianday(created_at)) * 24 * 60 AS REAL)) AS avg_resolution_mins,
      MIN(CAST((julianday(resolved_at) - julianday(created_at)) * 24 * 60 AS INTEGER)) AS min_resolution_mins,
      MAX(CAST((julianday(resolved_at) - julianday(created_at)) * 24 * 60 AS INTEGER)) AS max_resolution_mins
    FROM tickets
    WHERE status = 'CLOSED' AND resolved_at IS NOT NULL
  `).get();

  return res.json({
    ok: true,
    hourlyTrend: hourly,
    byType,
    byCategory,
    byPriority,
    resolutionStats
  });
});

app.get('/api/control-room/sector-heatmap', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM', 'POLICE_OFFICER']), (req, res) => {
  const rows = db.prepare(`
    SELECT
      CASE
        WHEN assigned_unit IS NOT NULL AND assigned_unit != '' THEN assigned_unit
        WHEN action_category IN ('Medical Emergency', 'Senior Citizen') THEN 'Medical Camp'
        WHEN action_category IN ('Crowd Management', 'Security') THEN 'Ghat Security'
        WHEN action_type IN ('LOST', 'FOUND') THEN 'Lost & Found Zone'
        ELSE 'Central Control'
      END AS sector,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN priority = 'HIGH' THEN 1 ELSE 0 END) AS high_count,
      SUM(CASE WHEN escalated = 1 THEN 1 ELSE 0 END) AS escalated_count
    FROM tickets
    GROUP BY sector
    ORDER BY open_count DESC, high_count DESC
  `).all();

  const mapped = rows.map((r) => ({
    ...r,
    heatScore: (Number(r.open_count || 0) * 3) + (Number(r.high_count || 0) * 2) + (Number(r.escalated_count || 0) * 4)
  })).sort((a, b) => b.heatScore - a.heatScore);

  return res.json({ ok: true, sectors: mapped, updatedAt: new Date().toISOString() });
});

app.get('/api/control-room/face-matches/:ticketId', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM']), (req, res) => {
  const ticket = stmts.getTicketById.get(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ ok: false, message: 'Ticket not found' });
  }

  if (!ticket.media_data || String(ticket.media_type || '').startsWith('video/')) {
    return res.status(400).json({ ok: false, message: 'Face matching requires image data' });
  }

  const registrations = db.prepare('SELECT id, head_name, phone, relative_phone, face_photo FROM registrations WHERE face_photo IS NOT NULL LIMIT 100').all();

  const matches = registrations
    .map((r) => ({
      registrationId: r.id,
      name: r.head_name,
      phone: r.phone,
      relativePhone: r.relative_phone,
      matchScore: calculateFaceMatchScore(ticket.media_data, r.face_photo)
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  audit(req.user.username, 'FACE_MATCH', 'TICKET', ticket.id, `matches=${matches.length}`, getClientIp(req));

  return res.json({ ok: true, ticketId: ticket.id, matches });
});

app.post('/api/control-room/assign/:ticketId', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM', 'QUEUE_MANAGER']), (req, res) => {
  const { assignedTo, assignedUnit, resolutionAction } = req.body;
  if (!assignedTo) {
    return res.status(400).json({ ok: false, message: 'assignedTo required' });
  }

  const ticket = stmts.getTicketById.get(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ ok: false, message: 'Ticket not found' });
  }

  const now = new Date().toISOString();
  stmts.assignTicket.run(String(assignedTo).trim(), assignedUnit || 'Field', 'IN_PROGRESS', now, req.params.ticketId);

  // Create queue assignment record
  stmts.createQueueAssignment.run(uuidv4(), req.params.ticketId, String(assignedTo).trim(), req.user.username, now);

  audit(req.user.username, 'ASSIGN_TICKET', 'TICKET', req.params.ticketId, `assignedTo=${assignedTo}|unit=${assignedUnit}`, getClientIp(req));

  return res.json({
    ok: true,
    message: 'Ticket assigned successfully',
    ticket: stmts.getTicketById.get(req.params.ticketId)
  });
});

app.post('/api/control-room/resolve/:ticketId', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM', 'POLICE_OFFICER']), (req, res) => {
  const { resolvedBy, resolutionNote, resolutionAction, linkedRegistrationId, faceMatchScore } = req.body;

  if (!resolvedBy || !resolutionNote) {
    return res.status(400).json({ ok: false, message: 'resolvedBy and resolutionNote required' });
  }

  const ticket = stmts.getTicketById.get(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ ok: false, message: 'Ticket not found' });
  }

  const now = new Date().toISOString();
  const score = faceMatchScore == null ? null : Number(faceMatchScore);

  stmts.resolveTicket.run(
    'CLOSED', now, String(resolvedBy).trim(), String(resolutionNote).trim(),
    resolutionAction || null, linkedRegistrationId || null,
    Number.isFinite(score) ? score : null, now,
    req.params.ticketId
  );

  audit(req.user.username, 'RESOLVE_TICKET', 'TICKET', req.params.ticketId, `resolvedBy=${resolvedBy}`, getClientIp(req));

  return res.json({
    ok: true,
    message: 'Ticket resolved and closed',
    ticket: stmts.getTicketById.get(req.params.ticketId)
  });
});

app.post('/api/control-room/escalate/:ticketId', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM']), (req, res) => {
  const { escalatedTo } = req.body;

  const ticket = stmts.getTicketById.get(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ ok: false, message: 'Ticket not found' });
  }

  const nextLevel = Number(ticket.escalation_level || 0) + 1;
  const now = new Date().toISOString();

  stmts.escalateTicket.run(nextLevel, now, escalatedTo || 'Senior Officer', now, req.params.ticketId);

  audit(req.user.username, 'ESCALATE_TICKET', 'TICKET', req.params.ticketId, `level=${nextLevel}`, getClientIp(req));

  return res.json({
    ok: true,
    message: `Ticket escalated to level ${nextLevel}`,
    ticket: stmts.getTicketById.get(req.params.ticketId)
  });
});

app.post('/api/control-room/escalations/auto-run', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM']), (req, res) => {
  const due = stmts.getEscalationCandidates.all();
  let escalatedCount = 0;

  due.forEach((t) => {
    const nextLevel = Number(t.escalation_level || 0) + 1;
    const now = new Date().toISOString();
    stmts.escalateTicket.run(nextLevel, now, 'Auto-escalation', now, t.id);
    escalatedCount++;
  });

  audit(req.user.username, 'AUTO_ESCALATE', 'SYSTEM', null, `count=${escalatedCount}`, getClientIp(req));

  return res.json({ ok: true, escalatedCount, message: `${escalatedCount} tickets auto-escalated` });
});

app.get('/api/control-room/priority-feed', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM', 'POLICE_OFFICER', 'QUEUE_MANAGER']), (req, res) => {
  const limitRaw = Number(req.query.limit || 25);
  const limit = Math.max(5, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 25));

  const source = stmts.getAllTickets.all(500).filter((t) => t.status !== 'CLOSED');
  const ranked = source
    .map((t) => ({ ...t, urgencyScore: computeTicketUrgencyScore(t) }))
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, limit);

  return res.json({ ok: true, count: ranked.length, items: ranked });
});

app.post('/api/control-room/auto-assign-open', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM', 'QUEUE_MANAGER']), (req, res) => {
  const officers = ['Sector-A Officer', 'Sector-B Officer', 'Sector-C Officer', 'River Patrol', 'Medical Unit'];
  const units = ['Field', 'Ghat Security', 'Medical Camp', 'Central Control', 'Riverfront Unit'];
  const openUnassigned = db.prepare("SELECT id FROM tickets WHERE status = 'OPEN' AND (assigned_to IS NULL OR assigned_to = '') ORDER BY created_at ASC").all();

  if (!openUnassigned.length) {
    return res.json({ ok: true, assignedCount: 0, message: 'No unassigned open tickets found' });
  }

  const now = new Date().toISOString();
  openUnassigned.forEach((t, idx) => {
    const assignedTo = officers[idx % officers.length];
    const unit = units[idx % units.length];
    stmts.assignTicket.run(assignedTo, unit, 'IN_PROGRESS', now, t.id);
    stmts.createQueueAssignment.run(uuidv4(), t.id, assignedTo, req.user.username, now);
  });

  audit(req.user.username, 'AUTO_ASSIGN_OPEN', 'QUEUE', null, `count=${openUnassigned.length}`, getClientIp(req));
  return res.json({ ok: true, assignedCount: openUnassigned.length, message: `${openUnassigned.length} tickets auto-assigned` });
});

app.post('/api/control-room/resolve-quick/:ticketId', requireAuth, requireRole(['ADMIN', 'CONTROL_ROOM', 'POLICE_OFFICER']), (req, res) => {
  const ticket = stmts.getTicketById.get(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ ok: false, message: 'Ticket not found' });
  }

  const now = new Date().toISOString();
  const resolvedBy = req.user.displayName || req.user.username;
  const resolutionNote = req.body?.resolutionNote || 'Resolved by rapid response quick action';
  const resolutionAction = req.body?.resolutionAction || 'Quick-Resolved';

  stmts.resolveTicket.run('CLOSED', now, resolvedBy, resolutionNote, resolutionAction, null, null, now, req.params.ticketId);
  audit(req.user.username, 'RESOLVE_QUICK', 'TICKET', req.params.ticketId, resolutionAction, getClientIp(req));

  return res.json({ ok: true, message: 'Ticket quick-resolved', ticket: stmts.getTicketById.get(req.params.ticketId) });
});

// ============ ADMIN ENDPOINTS ============
app.get('/api/admin/users', requireAuth, requireRole(['ADMIN']), (req, res) => {
  const users = stmts.getAllUsers.all();
  return res.json({ ok: true, users });
});

app.post('/api/admin/user/create', requireAuth, requireRole(['ADMIN']), (req, res) => {
  const { username, password, role, displayName, department } = req.body;

  if (!username || !password || !role || !displayName) {
    return res.status(400).json({ ok: false, message: 'username, password, role, displayName required' });
  }

  const existing = stmts.getUserByUsername.get(username.trim());
  if (existing) {
    return res.status(409).json({ ok: false, message: 'Username already exists' });
  }

  const roles = ['ADMIN', 'CONTROL_ROOM', 'POLICE_OFFICER', 'QUEUE_MANAGER'];
  if (!roles.includes(role)) {
    return res.status(400).json({ ok: false, message: `Invalid role. Allowed: ${roles.join(', ')}` });
  }

  const userId = uuidv4();
  stmts.createUser.run(
    userId, username.trim(), bcrypt.hashSync(String(password), 10), role,
    displayName.trim(), department || 'General', null, 1, new Date().toISOString()
  );

  audit(req.user.username, 'CREATE_USER', 'USER', userId, `username=${username}|role=${role}`, getClientIp(req));

  return res.json({ ok: true, message: 'User created successfully', userId });
});

app.post('/api/admin/demo-seed', requireAuth, requireRole(['ADMIN']), (req, res) => {
  const now = Date.now();
  const registrations = [
    { headName: 'राम शर्मा', phone: `91${String(9000000000 + Math.random() * 999999999).substring(0, 10)}`, relativePhone: `91${String(9000000000 + Math.random() * 999999999).substring(0, 10)}`, language: 'Hindi' },
    { headName: 'सीमा पटेल', phone: `91${String(9000000000 + Math.random() * 999999999).substring(0, 10)}`, relativePhone: `91${String(9000000000 + Math.random() * 999999999).substring(0, 10)}`, language: 'Marathi' },
    { headName: 'अमित गुप्ता', phone: `91${String(9000000000 + Math.random() * 999999999).substring(0, 10)}`, relativePhone: `91${String(9000000000 + Math.random() * 999999999).substring(0, 10)}`, language: 'Hindi' }
  ];

  const seededRegIds = [];
  registrations.forEach((r, idx) => {
    const regId = uuidv4();
    seededRegIds.push(regId);
    const createdAt = new Date(now - idx * 3600000).toISOString();
    stmts.createRegistration.run(regId, r.headName, r.phone, r.relativePhone, r.language, 'data:image/jpeg;base64,dGVzdA==', 'COMPLETE', null, Math.floor(Math.random() * 5) + 1, createdAt, createdAt);
    stmts.addDependent.run(uuidv4(), regId, 'Family Member', 'Relative', 25, 'M', createdAt);
  });

  const tickets = [
    { type: 'HELP', category: 'Medical Emergency', description: 'Medical Emergency | Elderly person needs assistance', priority: 'HIGH', status: 'OPEN', phone: registrations[0].phone },
    { type: 'COMPLAINT', category: 'Crowd Management', description: 'Crowd Management | Bottleneck near gate', priority: 'NORMAL', status: 'IN_PROGRESS', phone: registrations[1].phone },
    { type: 'LOST', category: 'Document', description: 'Lost Document | Aadhar card lost', priority: 'HIGH', status: 'OPEN', phone: registrations[2].phone }
  ];

  tickets.forEach((t, idx) => {
    const ticketId = `TK-${(now + 1000 + idx).toString().slice(-7)}`;
    const createdAt = new Date(now - idx * 1800000).toISOString();
    stmts.createTicket.run(
      ticketId, t.type, t.category, t.phone, t.description, null, null, null,
      'Hindi', t.priority, t.status, t.status === 'IN_PROGRESS' ? 'Police Officer' : null,
      'Field', 0, 0, computeSlaDueIso(t.priority), createdAt, createdAt
    );
  });

  audit(req.user.username, 'DEMO_SEED', 'SYSTEM', null, `regs=${registrations.length}|tickets=${tickets.length}`, getClientIp(req));

  return res.json({
    ok: true,
    registrationCount: registrations.length,
    ticketCount: tickets.length,
    message: 'Demo data created successfully'
  });
});

app.post('/api/admin/demo-seed-bulk', requireAuth, requireRole(['ADMIN']), (req, res) => {
  const requested = Number(req.body?.count || 50);
  const count = Math.max(10, Math.min(200, Number.isFinite(requested) ? requested : 50));
  const now = Date.now();
  const runSeed = String(now).slice(-4);

  const languages = ['Hindi', 'English', 'Marathi', 'Gujarati'];
  const relations = ['Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Brother', 'Sister'];
  const actionMap = {
    HELP: ['Medical Emergency', 'Police Assistance', 'Women Safety', 'Senior Citizen', 'Child Assistance', 'Missing Person', 'Navigation', 'Transport', 'Other'],
    COMPLAINT: ['Crowd Management', 'Security Misconduct', 'Harassment', 'Theft', 'Sanitation', 'Toilet Issue', 'Food Quality', 'Overpricing', 'Staff Behavior', 'Other'],
    LOST: ['Document', 'Phone', 'Money', 'Jewelry', 'Clothes', 'Other'],
    FOUND: ['Document', 'Phone', 'Money', 'Jewelry', 'Clothes', 'Aadhar', 'Other']
  };
  const actionTypes = Object.keys(actionMap);
  const statuses = ['OPEN', 'IN_PROGRESS', 'CLOSED'];
  const officers = ['Alpha Unit', 'Bravo Unit', 'Sector-7 Patrol', 'Medical Team', 'Lost&Found Desk'];
  const units = ['Field', 'Ghat Security', 'Medical Camp', 'Central Control', 'Riverfront Unit'];

  let registrationCount = 0;
  let dependentCount = 0;
  let ticketCount = 0;

  const regIds = [];
  for (let i = 0; i < count; i++) {
    const id = uuidv4();
    const ts = new Date(now - i * 180000).toISOString();
    const phone = `9${runSeed}${String(i).padStart(6, '0')}`;
    const relativePhone = `8${runSeed}${String(i).padStart(6, '0')}`;
    const lang = languages[i % languages.length];

    stmts.createRegistration.run(
      id,
      `यात्री ${i + 1}`,
      phone,
      relativePhone,
      lang,
      'data:image/jpeg;base64,dGVzdF9waG90bw==',
      'COMPLETE',
      null,
      1 + (i % 6),
      ts,
      ts
    );
    registrationCount++;
    regIds.push({ id, phone, ts });

    const depLoop = 1 + (i % 3);
    for (let d = 0; d < depLoop; d++) {
      stmts.addDependent.run(
        uuidv4(),
        id,
        `Member ${i + 1}-${d + 1}`,
        relations[(i + d) % relations.length],
        8 + ((i + d) % 65),
        (i + d) % 2 === 0 ? 'M' : 'F',
        ts
      );
      dependentCount++;
    }
  }

  for (let i = 0; i < count; i++) {
    const reg = regIds[i];
    const actionType = actionTypes[i % actionTypes.length];
    const actionCategory = actionMap[actionType][i % actionMap[actionType].length];
    const priority = actionType === 'HELP' || actionType === 'LOST' ? 'HIGH' : 'NORMAL';
    const status = statuses[i % statuses.length];
    const createdAt = new Date(now - i * 120000).toISOString();
    const updatedAt = new Date(now - i * 60000).toISOString();
    const ticketId = `TK-${String(now + i).slice(-7)}`;
    const assignedTo = status === 'OPEN' ? null : officers[i % officers.length];

    stmts.createTicket.run(
      ticketId,
      actionType,
      actionCategory,
      reg.phone,
      `${actionCategory} | Demo bulk case ${i + 1}`,
      null,
      null,
      null,
      languages[(i + 1) % languages.length],
      priority,
      status,
      assignedTo,
      assignedTo ? units[i % units.length] : null,
      i % 7 === 0 ? 1 : 0,
      i % 7 === 0 ? 1 : 0,
      computeSlaDueIso(priority),
      createdAt,
      updatedAt
    );

    if (status === 'CLOSED') {
      const resolvedAt = new Date(now - i * 30000).toISOString();
      db.prepare(`
        UPDATE tickets
        SET resolved_at = ?, resolved_by = ?, resolution_note = ?, resolution_action = ?
        WHERE id = ?
      `).run(resolvedAt, assignedTo || 'Control Team', 'Resolved during bulk demo seed', 'Closed', ticketId);
    }

    stmts.createSLATracking.run(
      uuidv4(),
      ticketId,
      priority,
      priority === 'HIGH' ? 15 : 60,
      computeSlaDueIso(priority),
      createdAt
    );

    ticketCount++;
  }

  audit(req.user.username, 'DEMO_SEED_BULK', 'SYSTEM', null, `regs=${registrationCount}|deps=${dependentCount}|tickets=${ticketCount}`, getClientIp(req));

  return res.json({
    ok: true,
    registrationCount,
    dependentCount,
    ticketCount,
    criteriaCoverage: {
      actionTypes,
      statuses,
      languages,
      priorities: ['HIGH', 'NORMAL']
    },
    message: `${registrationCount} registrations and ${ticketCount} tickets seeded successfully`
  });
});

app.get('/api/admin/audit-logs', requireAuth, requireRole(['ADMIN']), (req, res) => {
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : 100;
  const logs = stmts.getRecentAudit.all(limit);
  return res.json({ ok: true, count: logs.length, logs });
});

// ============ STATS & REPORTING ============
app.get('/api/stats/realtime', (req, res) => {
  const stats = {
    totalRegistrations: stmts.countRegistrations.get().total,
    totalTickets: stmts.countTickets.get().total,
    openTickets: stmts.countOpenTickets.get().total,
    timestamp: new Date().toISOString()
  };
  res.json(stats);
});

// ============ DEVOTEE ENTRY QR ============
app.get('/api/devotee-entry-qr', async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const entryUrl = `${baseUrl}/scan/devotee`;
    const png = await QRCode.toBuffer(entryUrl, { type: 'png', width: 320, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Failed to generate devotee entry QR' });
  }
});

app.get('/scan/devotee', (req, res) => {
  res.redirect('/devotee?entry=qr');
});

// ============ OFFICER PORTAL API ============
app.get('/api/officer/my-tickets', requireAuth, requireRole(['POLICE_OFFICER', 'ADMIN']), (req, res) => {
  const username = req.user.username;
  const displayName = req.user.display_name || req.user.username;
  const tickets = db.prepare(
    "SELECT * FROM tickets WHERE assigned_to = ? OR assigned_to = ? ORDER BY created_at DESC"
  ).all(username, displayName);
  res.json({ ok: true, tickets });
});

// ============ FRONTEND PAGE ROUTES ============
app.get('/devotee', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'devotee.html'));
});

app.get('/officer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'officer.html'));
});

app.get('/control-room', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control-room.html'));
});

app.get('/ops', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control-room.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/ultimate-pro', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ultimate-pro-face-qr.html'));
});

// ============ ERROR HANDLER & FALLBACK ============
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎉 Ujjain Kumbh 2028 Enterprise System running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Dashboard: http://0.0.0.0:${PORT}/control-room`);
  console.log(`🔐 Admin: http://0.0.0.0:${PORT}/admin`);
  console.log(`\n📱 Test Credentials:\n   Control: control / Control@123\n   Police: police / Police@123\n   Admin: admin / Admin@123\n`);
});
