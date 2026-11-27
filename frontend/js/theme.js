// Light/dark switch for every page. Owner: Daniel.
// - Until the visitor clicks the button, the site follows the computer's own setting
//   (Windows/macOS light or dark), and switches along if that setting changes.
// - The small moon/sun button at the right end of the top menu switches between light
//   and dark; that choice is remembered (localStorage, this browser only) and wins.
// css/theme.css holds the dark colours. This file is loaded in <head> (not deferred),
// so the right look is applied before the page is drawn: no white flash.
// It only changes how pages look.
(function () {
  const KEY = 'alumnilink-theme';
  const root = document.documentElement;
  const systemQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function savedTheme() {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;
    }
  }
  function saveTheme(value) {
    try { localStorage.setItem(KEY, value); } catch { /* private mode: just don't remember */ }
  }
  function systemTheme() {
    return systemQuery && systemQuery.matches ? 'dark' : 'light';
  }

  // The visitor's own choice first, otherwise the computer's setting.
  root.dataset.theme = savedTheme() || systemTheme();

  function updateButton(button) {
    const dark = root.dataset.theme === 'dark';
    button.textContent = dark ? '\u2600' : '\u263E'; // sun in dark mode, moon in light mode
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  function addButton() {
    const nav = document.querySelector('.site-header nav');
    if (!nav || document.getElementById('theme-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'theme-toggle';
    button.className = 'theme-toggle';
    updateButton(button);
    button.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      saveTheme(root.dataset.theme);
      updateButton(button);
    });
    nav.appendChild(button);

    // No choice made yet? Follow the computer if its setting changes while the page is open.
    if (systemQuery && systemQuery.addEventListener) {
      systemQuery.addEventListener('change', () => {
        if (savedTheme()) return;
        root.dataset.theme = systemTheme();
        updateButton(button);
      });
    }
  }

  // setTimeout lets nav.js add "Log in" / "Log out" first, so this button ends up last (far right).
  document.addEventListener('DOMContentLoaded', () => setTimeout(addButton, 0));
})();