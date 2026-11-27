// Admin page. Owner: Daniel.
// Sending non-admins away from this page is only for looks. The real lock is the
// Identity API: every call below goes to /api/admin, which checks the badge AND that
// the account is still an active admin, and answers 401/403 otherwise.
// Every value is shown with textContent, never innerHTML, so names or log text can't run as code.

const me = currentUser();
if (!me || me.role !== 'admin') {
  window.location.replace('login.html');
}

const statusBox = document.getElementById('status');

function showStatus(text, isError = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle('error', isError);
}

function signOut() {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userName');
  window.location.replace('login.html');
}
document.getElementById('logout').addEventListener('click', signOut);

// Calls /api/admin/... If the badge is missing or expired (401), or the account is no
// longer an active admin (403), go back to the login page.
async function adminRequest(path, options = {}) {
  try {
    return await apiRequest(`${API.admin}/admin${path}`, options);
  } catch (error) {
    if (error.status === 401 || (error.status === 403 && ['FORBIDDEN', 'ACCOUNT_INACTIVE'].includes(error.code))) {
      signOut();
    }
    throw error;
  }
}

// ---------- small helpers to build table rows safely ----------

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '';
}

function textCell(row, text) {
  const cell = document.createElement('td');
  cell.textContent = text === undefined || text === null ? '' : String(text);
  row.append(cell);
  return cell;
}

function pillCell(row, value) {
  const cell = document.createElement('td');
  const pill = document.createElement('span');
  pill.className = `status status-${value}`;
  pill.textContent = value;
  cell.append(pill);
  row.append(cell);
  return cell;
}

function actionsCell(row, buttons) {
  const cell = document.createElement('td');
  const box = document.createElement('div');
  box.className = 'actions';
  box.append(...buttons);
  cell.append(box);
  row.append(cell);
}

function actionButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

function emptyRow(tbody, columns, text) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = columns;
  cell.textContent = text;
  row.append(cell);
  tbody.append(row);
}

function updatePager({ page, pageSize, total }, label, prev, next) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  label.textContent = `Page ${page} of ${pages} (${total} in total)`;
  prev.disabled = page <= 1;
  next.disabled = page >= pages;
}

// ---------- tabs ----------

const panels = {
  verifications: { tab: document.getElementById('tab-verifications'), panel: document.getElementById('panel-verifications'), load: () => loadVerifications() },
  users: { tab: document.getElementById('tab-users'), panel: document.getElementById('panel-users'), load: () => loadUsers() },
  logs: { tab: document.getElementById('tab-logs'), panel: document.getElementById('panel-logs'), load: () => loadLogs() }
};

function openTab(name) {
  Object.entries(panels).forEach(([key, part]) => {
    part.tab.setAttribute('aria-selected', String(key === name));
    part.panel.hidden = key !== name;
  });
  showStatus('');
  panels[name].load();
}

Object.entries(panels).forEach(([key, part]) => {
  part.tab.addEventListener('click', () => openTab(key));
});

// ---------- 1. Waiting list ----------

const vStatus = document.getElementById('v-status');
const vRows = document.getElementById('v-rows');

async function loadVerifications() {
  vRows.replaceChildren();
  try {
    const data = await adminRequest(`/verifications?status=${encodeURIComponent(vStatus.value)}`);
    if (!data.results.length) {
      emptyRow(vRows, 6, vStatus.value === 'pending' ? 'Nobody is waiting for approval.' : 'No requests found.');
      return;
    }
    data.results.forEach((request) => {
      const row = document.createElement('tr');
      textCell(row, request.user.name);
      textCell(row, request.user.email);
      textCell(row, request.user.role);
      textCell(row, formatDate(request.createdAt));
      pillCell(row, request.status);
      const buttons = request.status === 'pending'
        ? [
            actionButton('Approve', '', () => decide(request, 'approved')),
            actionButton('Reject', 'secondary', () => decide(request, 'rejected'))
          ]
        : [];
      actionsCell(row, buttons);
      vRows.append(row);
    });
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function decide(request, decision) {
  if (decision === 'rejected' && !window.confirm(`Reject ${request.user.name}'s registration?`)) return;
  try {
    const data = await adminRequest(`/verifications/${encodeURIComponent(request.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision })
    });
    showStatus(`${request.user.name}: ${data.message}`);
  } catch (error) {
    showStatus(error.message, true);
  }
  loadVerifications();
}

document.getElementById('verifications-form').addEventListener('submit', (event) => {
  event.preventDefault();
  loadVerifications();
});

// ---------- 2. Accounts ----------

const uQ = document.getElementById('u-q');
const uRole = document.getElementById('u-role');
const uStatus = document.getElementById('u-status');
const uRows = document.getElementById('u-rows');
const uPrev = document.getElementById('u-prev');
const uNext = document.getElementById('u-next');
const uPage = document.getElementById('u-page');
let usersPage = 1;

async function loadUsers() {
  const params = new URLSearchParams();
  const q = uQ.value.trim();
  if (q) params.set('q', q);
  if (uRole.value) params.set('role', uRole.value);
  if (uStatus.value) params.set('status', uStatus.value);
  params.set('page', usersPage);

  uRows.replaceChildren();
  try {
    const data = await adminRequest(`/users?${params}`);
    updatePager(data, uPage, uPrev, uNext);
    if (!data.results.length) {
      emptyRow(uRows, 6, 'No accounts match.');
      return;
    }
    data.results.forEach((user) => {
      const row = document.createElement('tr');
      textCell(row, user.name);
      textCell(row, user.email);
      textCell(row, user.role);
      pillCell(row, user.accountStatus);
      textCell(row, formatDate(user.createdAt));
      const buttons = [];
      // Admin accounts are protected by the API; we just don't offer the buttons.
      if (user.role !== 'admin' && user.accountStatus === 'active') {
        buttons.push(actionButton('Suspend', 'secondary', () => changeStatus(user, 'suspended')));
      }
      if (user.role !== 'admin' && user.accountStatus === 'suspended') {
        buttons.push(actionButton('Reactivate', '', () => changeStatus(user, 'active')));
      }
      actionsCell(row, buttons);
      uRows.append(row);
    });
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function changeStatus(user, status) {
  if (status === 'suspended'
      && !window.confirm(`Suspend ${user.name}? They will be locked out of AlumniLink within a minute.`)) return;
  try {
    const data = await adminRequest(`/users/${encodeURIComponent(user.id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    showStatus(`${user.name}: ${data.message}`);
  } catch (error) {
    showStatus(error.message, true);
  }
  loadUsers();
}

document.getElementById('users-form').addEventListener('submit', (event) => {
  event.preventDefault();
  usersPage = 1;
  loadUsers();
});
uPrev.addEventListener('click', () => { usersPage -= 1; loadUsers(); });
uNext.addEventListener('click', () => { usersPage += 1; loadUsers(); });

// ---------- 3. Audit log ----------

const lService = document.getElementById('l-service');
const lAction = document.getElementById('l-action');
const lOutcome = document.getElementById('l-outcome');
const lFrom = document.getElementById('l-from');
const lTo = document.getElementById('l-to');
const lRows = document.getElementById('l-rows');
const lPrev = document.getElementById('l-prev');
const lNext = document.getElementById('l-next');
const lPage = document.getElementById('l-page');
let logsPage = 1;

async function loadLogs() {
  const params = new URLSearchParams();
  if (lService.value) params.set('service', lService.value);
  const action = lAction.value.trim().toUpperCase();
  if (action) params.set('action', action);
  const outcome = lOutcome.value.trim().toLowerCase();
  if (outcome) params.set('outcome', outcome);
  if (lFrom.value) params.set('from', lFrom.value);
  if (lTo.value) params.set('to', lTo.value);
  params.set('page', logsPage);

  lRows.replaceChildren();
  try {
    const data = await adminRequest(`/logs?${params}`);
    updatePager(data, lPage, lPrev, lNext);
    if (!data.results.length) {
      emptyRow(lRows, 6, 'No events match.');
      return;
    }
    data.results.forEach((event) => {
      const row = document.createElement('tr');
      textCell(row, formatDate(event.createdAt));
      textCell(row, event.service);
      textCell(row, event.action);
      pillCell(row, event.outcome);
      textCell(row, event.actor ? `${event.actor.name} (${event.actor.role})` : 'unknown');
      const target = textCell(row, event.targetId ? `${event.targetId.slice(0, 8)}…` : '');
      if (event.targetId) target.title = event.targetId; // full id on hover
      lRows.append(row);
    });
  } catch (error) {
    showStatus(error.message, true);
  }
}

document.getElementById('logs-form').addEventListener('submit', (event) => {
  event.preventDefault();
  logsPage = 1;
  loadLogs();
});
lPrev.addEventListener('click', () => { logsPage -= 1; loadLogs(); });
lNext.addEventListener('click', () => { logsPage += 1; loadLogs(); });

// ---------- start ----------
if (me && me.role === 'admin') {
  openTab('verifications');
}