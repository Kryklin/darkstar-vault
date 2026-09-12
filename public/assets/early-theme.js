(function () {
  try {
    // 1. Enforce dark-first
    document.documentElement.classList.add('dark-theme');

    // 2. Load saved theme
    const savedTheme = localStorage.getItem('selectedTheme');
    if (savedTheme) {
      document.documentElement.classList.add(savedTheme);
    } else {
      // Default theme if none saved
      document.documentElement.classList.add('theme-obsidian-shard');
    }
  } catch (e) {
    console.error('Early theme detection failed', e);
  }
})();
