// Login page. Owner: Daniel.
// Sends email + password + Turnstile ticket to the Identity API.
// On success it keeps the badge (token) in sessionStorage under "token", where
// Ammar's apiRequest() and Ahmed's profile pages look for it, then goes to the
// right page for the role.
// The site's home address (/) redirects here (frontend/vercel.json), so visitors
// see the login page first.

// Already logged in with a badge that has not expired? Skip the form and go straight in.
// This only decides which page to show: every API still checks the badge itself.
function savedLogin() {
  const token = sessionStorage.getItem('token');
  if (!token) return null;
  try {
    const body = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(body));
    if (!payload.exp || payload.exp * 1000 <= Date.now()) throw new Error('expired');
    return payload;
  } catch {
    // Broken or expired badge: forget it so the person can log in again.
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userName');
    return null;
  }
}

const saved = savedLogin();
if (saved) {
  window.location.replace(saved.role === 'admin' ? 'admin.html' : 'index.html');
}

const form = document.getElementById('login-form');
const statusBox = document.getElementById('status');
const button = document.getElementById('login-button');

renderTurnstile('#turnstile-widget');

// Same green/red message box as Ahmed's pages. textContent, never innerHTML.
function showStatus(text, isError = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle('error', isError);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) {
    showStatus('Please enter your email and password.', true);
    return;
  }

  const ticket = getTurnstileToken();
  if (!ticket) {
    showStatus('Please wait for the "Verify you are human" check to finish.', true);
    return;
  }

  button.disabled = true;
  showStatus('Logging in...');

  try {
    const data = await apiRequest(`${API.admin}/auth/login`, {
      method: 'POST',
      headers: { 'X-Turnstile-Token': ticket },
      body: JSON.stringify({ email, password })
    });

    sessionStorage.setItem('token', data.token);
    sessionStorage.setItem('userName', data.user.name);
    window.location.href = data.user.role === 'admin' ? 'admin.html' : 'index.html';
  } catch (error) {
    // The Identity API's own message, e.g. "Email or password is incorrect."
    showStatus(error.message, true);
    resetTurnstile();
    button.disabled = false;
  }
});