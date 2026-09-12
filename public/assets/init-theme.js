(function () {
  try {
    var themeClass = localStorage.getItem('selectedTheme') || 'theme-obsidian-shard';
    document.body.classList.add('dark-theme', themeClass);
  } catch (_e) {}
})();
