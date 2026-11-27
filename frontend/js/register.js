// Sign-up page. Owner: Daniel.
// Sends name, email, password, role and the Turnstile ticket to the Identity API.
// The checks here are only for convenience: the Identity API checks everything again,
// because anyone can skip this page and call the API directly.
const form = document.getElementById('register-form');
const statusBox = document.getElementById('status');
const button = document.getElementById('register-button');

renderTurnstile('#turnstile-widget');

// Same green/red message box as Ahmed's pages. textContent, never innerHTML.
function showStatus(text, isError = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle('error', isError);
}

// Returns a message if something is wrong, or '' if the form looks fine.
function checkForm({ name, email, role, password, confirm }) {
  if (name.length < 2) return 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  if (!['student', 'alumni'].includes(role)) return 'Please choose Student or Alumni.';
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must be 8 to 72 characters with at least one letter and one number.';
  }
  if (password !== confirm) return 'The two passwords do not match.';
  return '';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const values = {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim(),
    role: document.getElementById('role').value,
    password: document.getElementById('password').value,
    confirm: document.getElementById('confirm').value
  };

  const problem = checkForm(values);
  if (problem) {
    showStatus(problem, true);
    return;
  }

  const ticket = getTurnstileToken();
  if (!ticket) {
    showStatus('Please wait for the "Verify you are human" check to finish.', true);
    return;
  }

  button.disabled = true;
  showStatus('Creating your account...');

  try {
    const data = await apiRequest(`${API.admin}/auth/register`, {
      method: 'POST',
      headers: { 'X-Turnstile-Token': ticket },
      // Only the four fields the API accepts. "confirm" stays in the page.
      body: JSON.stringify({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role
      })
    });

    form.reset();
    showStatus(data.message); // "Account created. An admin must approve it..."
  } catch (error) {
    // The Identity API's own message, e.g. "This email is already registered."
    showStatus(error.message, true);
  } finally {
    // Each ticket works only once, so get a fresh one for the next try.
    resetTurnstile();
    button.disabled = false;
  }
});