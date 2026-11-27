// Adds "Log in" or "Log out" (and "Admin" for admins) to the top menu on every page.
// This only changes what is shown. Every API still checks the login and role itself.
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.site-header nav[aria-label="Main"]');
  if (!nav) return;

  const token = sessionStorage.getItem('token');
  let role = null;
  if (token) {
    try {
      const body = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      role = JSON.parse(atob(body)).role;
    } catch {
      role = null;
    }
  }

  if (!token) {
    const existingLogout = document.getElementById('logout');
    if (existingLogout) existingLogout.style.display = 'none';
    const login = document.createElement('a');
    login.href = 'login.html';
    login.textContent = 'Log in';
    nav.appendChild(login);
    return;
  }

  // Students have no profile, so My profile and Privacy are hidden for them.
  if (role === 'student') {
    nav.querySelectorAll('a[href="profile.html"], a[href="privacy.html"]').forEach((link) => { link.hidden = true; });
  }

  if (role === 'admin' && !nav.querySelector('a[href="admin.html"]')) {
    const admin = document.createElement('a');
    admin.href = 'admin.html';
    admin.textContent = 'Admin';
    nav.insertBefore(admin, document.getElementById('logout'));
  }

  // The profile, privacy and admin pages already have their own sign-out button.
  if (!document.getElementById('logout')) {
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.id = 'logout';
    logout.textContent = 'Log out';
    logout.addEventListener('click', () => {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('userName');
      window.location.href = 'login.html';
    });
    nav.appendChild(logout);
  }
});
