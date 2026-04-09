const scanBtn = document.getElementById('scanBtn');
const step1 = document.getElementById('step1');
const registerCard = document.getElementById('registerCard');
const actionsCard = document.getElementById('actionsCard');
const adminCard = document.getElementById('adminCard');
const qrUrl = document.getElementById('qrUrl');
const qrImage = document.getElementById('qrImage');

const goRegister = document.getElementById('goRegister');
const goActions = document.getElementById('goActions');
const openAdmin = document.getElementById('openAdmin');
const refreshAdmin = document.getElementById('refreshAdmin');
const seedDemoData = document.getElementById('seedDemoData');
const runEscalation = document.getElementById('runEscalation');
const doneDependents = document.getElementById('doneDependents');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const authStatus = document.getElementById('authStatus');

const registerForm = document.getElementById('registerForm');
const dependentForm = document.getElementById('dependentForm');
const otpForm = document.getElementById('otpForm');
const actionForm = document.getElementById('actionForm');
const actionCategory = document.getElementById('actionCategory');
const startCameraBtn = document.getElementById('startCamera');
const captureFaceBtn = document.getElementById('captureFace');
const cameraPreview = document.getElementById('cameraPreview');
const cameraCanvas = document.getElementById('cameraCanvas');
const facePreview = document.getElementById('facePreview');
const facePhotoData = document.getElementById('facePhotoData');
const faceFileInput = document.getElementById('faceFileInput');
const actionMediaInput = document.getElementById('actionMediaInput');
const actionMediaData = document.getElementById('actionMediaData');
const actionMediaType = document.getElementById('actionMediaType');
const actionMediaDuration = document.getElementById('actionMediaDuration');
const actionVideoPreview = document.getElementById('actionVideoPreview');
const actionImagePreview = document.getElementById('actionImagePreview');
const actionLivePreview = document.getElementById('actionLivePreview');
const recordTimer = document.getElementById('recordTimer');
const startActionCameraBtn = document.getElementById('startActionCamera');
const captureActionPhotoBtn = document.getElementById('captureActionPhoto');
const startActionRecordBtn = document.getElementById('startActionRecord');
const stopActionRecordBtn = document.getElementById('stopActionRecord');

const registrationStatus = document.getElementById('registrationStatus');
const dependentStatus = document.getElementById('dependentStatus');
const otpStatus = document.getElementById('otpStatus');
const actionStatus = document.getElementById('actionStatus');
const adminTotals = document.getElementById('adminTotals');
const regTableBody = document.querySelector('#regTable tbody');
const ticketTableBody = document.querySelector('#ticketTable tbody');
const auditTableBody = document.querySelector('#auditTable tbody');
const controlStatusFilter = document.getElementById('controlStatusFilter');
const refreshControlQueue = document.getElementById('refreshControlQueue');
const controlTableBody = document.querySelector('#controlTable tbody');
const controlStatus = document.getElementById('controlStatus');
const faceMatchPanel = document.getElementById('faceMatchPanel');

let registrationId = null;
let dependentCount = 0;
let cameraStream = null;
let actionCameraStream = null;
let actionRecorder = null;
let actionRecordChunks = [];
let actionRecordStartedAt = 0;
let actionRecordAutoStop = null;
let actionRecordTicker = null;
let authToken = localStorage.getItem('kumbh_auth_token') || '';
let authUser = null;

const KUMBH_CATEGORIES = {
  HELP: [
    'Medical Emergency',
    'Senior Citizen Assistance',
    'Women and Child Assistance',
    'Missing Person Assistance',
    'Route and Navigation Help',
    'Emergency Transport'
  ],
  COMPLAINT: [
    'Crowd Mismanagement',
    'Cleanliness and Sanitation',
    'Water and Food Quality',
    'Toilet Facility Issue',
    'Security and Safety Issue',
    'Overcharging or Fraud'
  ]
};

qrUrl.textContent = window.location.href;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function loadQr() {
  const res = await fetch(`/api/qr?url=${encodeURIComponent(window.location.href)}`);
  const data = await res.json();
  if (res.ok && data.dataUrl) {
    qrImage.src = data.dataUrl;
  }
}

function updateAuthUi() {
  if (!authToken) {
    authStatus.textContent = 'Not logged in.';
    return;
  }
  const name = authUser?.displayName || authUser?.username || 'User';
  const role = authUser?.role || 'UNKNOWN';
  authStatus.textContent = `Logged in as ${name} (${role})`;
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    authToken = '';
    authUser = null;
    localStorage.removeItem('kumbh_auth_token');
    updateAuthUi();
  }
  return res;
}

async function loadAdmin() {
  const res = await apiFetch('/api/admin/summary');
  const data = await res.json();

  if (!res.ok) {
    adminTotals.textContent = `Failed: ${data.message || 'Cannot load admin summary'}`;
    return;
  }

  adminTotals.textContent = `Total Registrations: ${data.totals.totalRegistrations}\nTotal Tickets: ${data.totals.totalTickets}\nOpen Tickets: ${data.totals.openTickets}\nResolved Tickets: ${data.totals.resolvedTickets}`;

  regTableBody.innerHTML = data.recentRegistrations.map((r) => `
    <tr>
      <td>${escapeHtml(r.id)}</td>
      <td>${escapeHtml(r.head_name)}</td>
      <td>${escapeHtml(r.phone)}</td>
      <td>${escapeHtml(r.relative_phone)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>${escapeHtml(r.created_at)}</td>
    </tr>
  `).join('');

  ticketTableBody.innerHTML = data.recentTickets.map((t) => `
    <tr>
      <td>${escapeHtml(t.id)}</td>
      <td>${escapeHtml(t.action_type)}</td>
      <td>${escapeHtml(t.priority)}</td>
      <td>${escapeHtml(t.status)}</td>
      <td>
        <select data-ticket-id="${escapeHtml(t.id)}" class="status-select">
          <option value="OPEN" ${t.status === 'OPEN' ? 'selected' : ''}>OPEN</option>
          <option value="IN_PROGRESS" ${t.status === 'IN_PROGRESS' ? 'selected' : ''}>IN_PROGRESS</option>
          <option value="CLOSED" ${t.status === 'CLOSED' ? 'selected' : ''}>CLOSED</option>
        </select>
      </td>
    </tr>
  `).join('');

  auditTableBody.innerHTML = (data.recentAudit || []).map((a) => `
    <tr>
      <td>${escapeHtml(a.created_at)}</td>
      <td>${escapeHtml(a.actor || 'SYSTEM')}</td>
      <td>${escapeHtml(a.action)}</td>
      <td>${escapeHtml(`${a.entity_type || ''} ${a.entity_id || ''}`.trim())}</td>
      <td>${escapeHtml(a.detail || '')}</td>
    </tr>
  `).join('');

  document.querySelectorAll('.status-select').forEach((el) => {
    el.addEventListener('change', async (event) => {
      const ticketId = event.target.getAttribute('data-ticket-id');
      const status = event.target.value;
      await apiFetch(`/api/admin/tickets/${encodeURIComponent(ticketId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      await loadAdmin();
    });
  });
}

async function loadControlRoomQueue() {
  const filter = controlStatusFilter.value;
  const res = await apiFetch(`/api/control-room/queue?status=${encodeURIComponent(filter)}`);
  const data = await res.json();

  if (!res.ok) {
    controlStatus.textContent = `Queue load failed: ${data.message || 'unknown error'}`;
    return;
  }

  controlStatus.textContent = `Queue loaded: ${data.items.length} tickets (${data.status})`;
  controlTableBody.innerHTML = data.items.map((t) => `
    <tr>
      <td>${escapeHtml(t.id)}</td>
      <td>${escapeHtml(t.action_type)}</td>
      <td>${escapeHtml(t.action_category)}</td>
      <td>${escapeHtml(t.phone)}</td>
      <td>${escapeHtml(t.status)}</td>
      <td>${escapeHtml(t.assigned_to || 'Unassigned')}</td>
      <td>${t.escalated ? `YES (L${escapeHtml(t.escalation_level || 1)})` : 'NO'}</td>
      <td>${escapeHtml(t.sla_due_at || '-')}</td>
      <td>${escapeHtml(t.media_type || 'none')}</td>
      <td>
        <button class="btn control-assign-btn" data-id="${escapeHtml(t.id)}">Assign</button>
        <button class="btn control-face-btn" data-id="${escapeHtml(t.id)}">Face Match</button>
        <button class="btn success control-resolve-btn" data-id="${escapeHtml(t.id)}">Resolve</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.control-assign-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ticketId = btn.getAttribute('data-id');
      const assignedTo = window.prompt('Assign ticket to officer/team:', 'Duty Officer');
      if (!assignedTo) return;

      const result = await apiFetch(`/api/control-room/assign/${encodeURIComponent(ticketId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo })
      });
      const assignData = await result.json();
      if (!result.ok) {
        controlStatus.textContent = `Assign failed (${ticketId}): ${assignData.message}`;
        return;
      }

      controlStatus.textContent = `Ticket ${ticketId} assigned to ${assignedTo}.`;
      await loadAdmin();
      await loadControlRoomQueue();
    });
  });

  document.querySelectorAll('.control-face-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ticketId = btn.getAttribute('data-id');
      const result = await apiFetch(`/api/control-room/face-match/${encodeURIComponent(ticketId)}`);
      const matchData = await result.json();
      if (!result.ok) {
        faceMatchPanel.classList.remove('hidden');
        faceMatchPanel.textContent = `Face match failed (${ticketId}): ${matchData.message}`;
        return;
      }

      faceMatchPanel.classList.remove('hidden');
      if (!matchData.matches.length) {
        faceMatchPanel.textContent = `No matches found for ${ticketId}.`;
        return;
      }

      faceMatchPanel.textContent = `Top face matches for ${ticketId}:\n` +
        matchData.matches.map((m, i) => `${i + 1}. ${m.headName} (${m.registrationId}) - score ${m.score}%`).join('\n');
    });
  });

  document.querySelectorAll('.control-resolve-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ticketId = btn.getAttribute('data-id');
      const resolvedBy = window.prompt('Resolved by (officer name):', 'Control Room Officer');
      if (!resolvedBy) return;
      const resolutionNote = window.prompt('Resolution note:', 'Issue resolved on ground and caller informed.');
      if (!resolutionNote) return;
      const linkedRegistrationId = window.prompt('Linked registration ID (optional):', '') || null;
      const faceMatchScore = window.prompt('Face match score (optional):', '') || null;

      const result = await apiFetch(`/api/control-room/resolve/${encodeURIComponent(ticketId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy, resolutionNote, linkedRegistrationId, faceMatchScore })
      });
      const resolveData = await result.json();
      if (!result.ok) {
        controlStatus.textContent = `Resolve failed (${ticketId}): ${resolveData.message}`;
        return;
      }

      controlStatus.textContent = `Ticket ${ticketId} resolved successfully.`;
      await loadAdmin();
      await loadControlRoomQueue();
    });
  });
}

loadQr();
updateAuthUi();

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    registrationStatus.textContent = 'Camera API not available. Use Mobile Camera Fallback.';
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    cameraPreview.srcObject = cameraStream;
    registrationStatus.textContent = 'Camera started. Capture face now.';
  } catch (err) {
    registrationStatus.textContent = 'Camera access denied/unavailable. Use Mobile Camera Fallback.';
  }
}

function captureFace() {
  const width = cameraPreview.videoWidth || 640;
  const height = cameraPreview.videoHeight || 480;
  cameraCanvas.width = width;
  cameraCanvas.height = height;
  const ctx = cameraCanvas.getContext('2d');
  ctx.drawImage(cameraPreview, 0, 0, width, height);
  const dataUrl = cameraCanvas.toDataURL('image/jpeg', 0.85);
  facePhotoData.value = dataUrl;
  facePreview.src = dataUrl;
  facePreview.classList.remove('hidden');
  registrationStatus.textContent = 'Face captured successfully.';
}

startCameraBtn.addEventListener('click', startCamera);
captureFaceBtn.addEventListener('click', captureFace);

async function startActionCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    actionStatus.textContent = 'Camera API not available on this browser.';
    return;
  }

  try {
    if (actionCameraStream) {
      actionCameraStream.getTracks().forEach((t) => t.stop());
      actionCameraStream = null;
    }

    actionCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: true
    });
    actionLivePreview.srcObject = actionCameraStream;
    actionLivePreview.classList.remove('hidden');
    actionStatus.textContent = 'Action camera started. Capture photo or record video.';
  } catch (err) {
    actionStatus.textContent = 'Unable to access action camera. Use upload fallback.';
  }
}

function captureActionPhoto() {
  if (!actionCameraStream) {
    actionStatus.textContent = 'Start action camera first.';
    return;
  }

  const canvas = document.createElement('canvas');
  const width = actionLivePreview.videoWidth || 640;
  const height = actionLivePreview.videoHeight || 480;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(actionLivePreview, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  actionMediaData.value = dataUrl;
  actionMediaType.value = 'image/jpeg';
  actionMediaDuration.value = '0';
  actionImagePreview.src = dataUrl;
  actionImagePreview.classList.remove('hidden');
  actionVideoPreview.classList.add('hidden');
  actionStatus.textContent = 'Action photo captured.';
}

function stopActionRecordingInternal() {
  if (actionRecorder && actionRecorder.state === 'recording') {
    actionRecorder.stop();
  }
}

function formatSec(sec) {
  const s = String(sec % 60).padStart(2, '0');
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function stopRecordTimerUi() {
  clearInterval(actionRecordTicker);
  actionRecordTicker = null;
  recordTimer.classList.add('hidden');
  recordTimer.textContent = 'Recording: 00:00 / 00:20';
}

function startRecordTimerUi() {
  recordTimer.classList.remove('hidden');
  recordTimer.textContent = 'Recording: 00:00 / 00:20';
  clearInterval(actionRecordTicker);
  actionRecordTicker = setInterval(() => {
    const elapsed = Math.min(20, Math.floor((Date.now() - actionRecordStartedAt) / 1000));
    recordTimer.textContent = `Recording: ${formatSec(elapsed)} / 00:20`;
  }, 250);
}

function startActionRecording() {
  if (!actionCameraStream) {
    actionStatus.textContent = 'Start action camera first.';
    return;
  }

  if (typeof MediaRecorder === 'undefined') {
    actionStatus.textContent = 'Video recording is not supported in this browser.';
    return;
  }

  actionRecordChunks = [];
  actionRecorder = new MediaRecorder(actionCameraStream, { mimeType: 'video/webm' });
  actionRecordStartedAt = Date.now();

  actionRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      actionRecordChunks.push(event.data);
    }
  };

  actionRecorder.onstop = () => {
    const durationSec = Math.ceil((Date.now() - actionRecordStartedAt) / 1000);
    clearTimeout(actionRecordAutoStop);
    stopRecordTimerUi();

    if (durationSec > 20) {
      actionStatus.textContent = 'Recorded video exceeded 20 seconds and was rejected.';
      actionMediaData.value = '';
      actionMediaType.value = '';
      actionMediaDuration.value = '';
      return;
    }

    const blob = new Blob(actionRecordChunks, { type: 'video/webm' });
    const reader = new FileReader();
    reader.onload = () => {
      actionMediaData.value = reader.result;
      actionMediaType.value = 'video/webm';
      actionMediaDuration.value = String(durationSec);
      actionVideoPreview.src = reader.result;
      actionVideoPreview.classList.remove('hidden');
      actionImagePreview.classList.add('hidden');
      actionStatus.textContent = `Action video recorded (${durationSec}s).`;
    };
    reader.readAsDataURL(blob);
  };

  actionRecorder.start();
  actionStatus.textContent = 'Recording started. Maximum allowed: 20 seconds.';
  startRecordTimerUi();
  actionRecordAutoStop = setTimeout(stopActionRecordingInternal, 20000);
}

function stopActionRecording() {
  stopActionRecordingInternal();
}

startActionCameraBtn.addEventListener('click', startActionCamera);
captureActionPhotoBtn.addEventListener('click', captureActionPhoto);
startActionRecordBtn.addEventListener('click', startActionRecording);
stopActionRecordBtn.addEventListener('click', stopActionRecording);

faceFileInput.addEventListener('change', () => {
  const file = faceFileInput.files && faceFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    facePhotoData.value = reader.result;
    facePreview.src = reader.result;
    facePreview.classList.remove('hidden');
    registrationStatus.textContent = 'Face image selected from camera/file fallback.';
  };
  reader.readAsDataURL(file);
});

actionMediaInput.addEventListener('change', () => {
  const file = actionMediaInput.files && actionMediaInput.files[0];
  if (!file) {
    actionMediaData.value = '';
    actionMediaType.value = '';
    actionMediaDuration.value = '';
    actionVideoPreview.classList.add('hidden');
    actionImagePreview.classList.add('hidden');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    actionMediaData.value = reader.result;
    actionMediaType.value = file.type || 'application/octet-stream';

    if (file.type.startsWith('video/')) {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.onloadedmetadata = () => {
        const duration = Math.ceil(tempVideo.duration || 0);
        URL.revokeObjectURL(tempVideo.src);

        if (duration > 20) {
          actionStatus.textContent = 'Video duration should be 20 seconds or less.';
          actionMediaInput.value = '';
          actionMediaData.value = '';
          actionMediaType.value = '';
          actionMediaDuration.value = '';
          actionVideoPreview.classList.add('hidden');
          actionImagePreview.classList.add('hidden');
          return;
        }

        actionMediaDuration.value = String(duration);
        actionVideoPreview.src = reader.result;
        actionVideoPreview.classList.remove('hidden');
        actionImagePreview.classList.add('hidden');
      };
      tempVideo.src = URL.createObjectURL(file);
    } else {
      actionMediaDuration.value = '0';
      actionImagePreview.src = reader.result;
      actionImagePreview.classList.remove('hidden');
      actionVideoPreview.classList.add('hidden');
    }
  };
  reader.readAsDataURL(file);
});

scanBtn.addEventListener('click', () => {
  step1.classList.remove('hidden');
});

goRegister.addEventListener('click', () => {
  registerCard.classList.remove('hidden');
  actionsCard.classList.add('hidden');
  adminCard.classList.add('hidden');
});

goActions.addEventListener('click', () => {
  actionsCard.classList.remove('hidden');
  registerCard.classList.add('hidden');
  adminCard.classList.add('hidden');
});

function fillCategoryOptions(actionType) {
  const options = KUMBH_CATEGORIES[actionType] || [];
  actionCategory.innerHTML = '<option value="">Select Category</option>';
  options.forEach((label) => {
    const opt = document.createElement('option');
    opt.value = label;
    opt.textContent = label;
    actionCategory.appendChild(opt);
  });
}

actionForm.actionType.addEventListener('change', (e) => {
  fillCategoryOptions(e.target.value);
});

openAdmin.addEventListener('click', async () => {
  adminCard.classList.remove('hidden');
  registerCard.classList.add('hidden');
  actionsCard.classList.add('hidden');
  faceMatchPanel.classList.add('hidden');
  await loadAdmin();
  await loadControlRoomQueue();
});

refreshAdmin.addEventListener('click', loadAdmin);
refreshControlQueue.addEventListener('click', loadControlRoomQueue);
controlStatusFilter.addEventListener('change', loadControlRoomQueue);

seedDemoData.addEventListener('click', async () => {
  const res = await apiFetch('/api/admin/demo-seed', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    adminTotals.textContent = `Seed failed: ${data.message || 'unknown error'}`;
    return;
  }
  adminTotals.textContent = `Demo data seeded. Registrations + Tickets added.`;
  await loadAdmin();
});

runEscalation.addEventListener('click', async () => {
  const res = await apiFetch('/api/control-room/escalations/run', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    controlStatus.textContent = `Escalation run failed: ${data.message || 'unknown error'}`;
    return;
  }
  controlStatus.textContent = `Escalation run complete. Escalated: ${data.escalated || 0}`;
  await loadAdmin();
  await loadControlRoomQueue();
});

loginBtn.addEventListener('click', async () => {
  const username = (loginUsername.value || '').trim();
  const password = loginPassword.value || '';
  if (!username || !password) {
    authStatus.textContent = 'Username and password are required.';
    return;
  }

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) {
    authStatus.textContent = `Login failed: ${data.message || 'invalid credentials'}`;
    return;
  }

  authToken = data.token;
  authUser = data.user;
  localStorage.setItem('kumbh_auth_token', authToken);
  updateAuthUi();
  await loadAdmin();
  await loadControlRoomQueue();
});

logoutBtn.addEventListener('click', () => {
  authToken = '';
  authUser = null;
  localStorage.removeItem('kumbh_auth_token');
  updateAuthUi();
  adminTotals.textContent = '';
  controlStatus.textContent = '';
  regTableBody.innerHTML = '';
  ticketTableBody.innerHTML = '';
  controlTableBody.innerHTML = '';
  auditTableBody.innerHTML = '';
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(registerForm);
  const payload = Object.fromEntries(fd.entries());

  if (!payload.facePhoto) {
    registrationStatus.textContent = 'Face photo is mandatory. Please capture face before registration.';
    return;
  }

  const res = await fetch('/api/register/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  if (!res.ok) {
    registrationStatus.textContent = `Blocked: ${data.message}`;
    return;
  }

  registrationId = data.registrationId;
  dependentCount = 0;
  registrationStatus.textContent = `Registration started\nID: ${data.registrationId}\nOTP for testing: ${data.otpForTesting || 'sent via provider'}`;
  dependentForm.classList.remove('hidden');
  dependentStatus.classList.remove('hidden');
  dependentStatus.textContent = 'Add dependents, then click "Done Adding Dependents" to move to OTP step.';
  otpForm.classList.add('hidden');
  otpStatus.textContent = '';

  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
});

dependentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!registrationId) return;

  const fd = new FormData(dependentForm);
  const payload = Object.fromEntries(fd.entries());
  payload.registrationId = registrationId;

  const res = await fetch('/api/register/dependent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  if (!res.ok) {
    dependentStatus.textContent = `Dependent add failed: ${data.message}`;
    return;
  }

  dependentCount = data.count;
  dependentStatus.textContent = `Dependents added: ${data.count}`;
  dependentForm.reset();
});

doneDependents.addEventListener('click', () => {
  if (!registrationId) return;
  otpForm.classList.remove('hidden');
  otpStatus.textContent = `Proceed to final OTP verification.${dependentCount ? ` Total dependents: ${dependentCount}` : ''}`;
});

otpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!registrationId) return;

  const fd = new FormData(otpForm);
  const payload = {
    registrationId,
    otp: fd.get('otp')
  };

  const res = await fetch('/api/register/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  otpStatus.textContent = res.ok ? 'Registration COMPLETE' : `OTP Failed: ${data.message}`;
});

actionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(actionForm);
  const payload = Object.fromEntries(fd.entries());

  if (!payload.phone) {
    actionStatus.textContent = 'Phone number is mandatory.';
    return;
  }

  if (!payload.actionCategory) {
    actionStatus.textContent = 'Category is mandatory.';
    return;
  }

  const res = await fetch('/api/action/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  if (!res.ok) {
    actionStatus.textContent = `Failed: ${data.message}`;
    return;
  }

  actionStatus.textContent = `Ticket Created\nID: ${data.ticket.id}\nType: ${data.ticket.action_type}\nPriority: ${data.ticket.priority}`;
  actionForm.reset();
  actionCategory.innerHTML = '<option value="">Select action first</option>';
  actionMediaData.value = '';
  actionMediaType.value = '';
  actionMediaDuration.value = '';
  actionVideoPreview.classList.add('hidden');
  actionImagePreview.classList.add('hidden');
  stopRecordTimerUi();
});
