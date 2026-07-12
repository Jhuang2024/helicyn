/* ============================================================
   HELICYN - theme toggle
   Dark is the brand default. A light theme is available and
   persisted per-browser; the actual attribute swap for first
   paint happens in the inline snippet in <head> (before this
   file loads) to avoid a flash of the wrong theme.
   ============================================================ */
(function () {
  var KEY = 'helicyn-theme';
  var root = document.documentElement;

  function current() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function syncButtons(theme) {
    var label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.setAttribute('aria-label', label);
    });
  }

  function syncMetaColor(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f6f3' : '#0a0a0c');
  }

  function apply(theme) {
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    syncButtons(theme);
    syncMetaColor(theme);
    window.dispatchEvent(new CustomEvent('helicyn:theme', { detail: { theme: theme } }));
  }

  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = current() === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
    });
  });

  syncButtons(current());
  syncMetaColor(current());
})();
