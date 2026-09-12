$themes = @(
    @{ Name = "crimson-void"; Primary = "#D50000"; Secondary = "#212121"; Tertiary = "#BDBDBD" }, # Red
    @{ Name = "solar-flare"; Primary = "#E65100"; Secondary = "#FFD600"; Tertiary = "#FFFF00" }, # Orange
    @{ Name = "amber-glow"; Primary = "#FF6F00"; Secondary = "#FFCA28"; Tertiary = "#FFE082" }, # Amber
    @{ Name = "forest-whisper"; Primary = "#2E7D32"; Secondary = "#B2FF59"; Tertiary = "#CDDC39" }, # Green
    @{ Name = "teal-torrent"; Primary = "#009688"; Secondary = "#80CBC4"; Tertiary = "#B2DFDB" }, # Teal
    @{ Name = "neon-cyberpunk"; Primary = "#00E5FF"; Secondary = "#6200EA"; Tertiary = "#FF4081" }, # Cyan
    @{ Name = "oceanic-depth"; Primary = "#1A237E"; Secondary = "#00B0FF"; Tertiary = "#00B0FF" }, # Blue
    @{ Name = "indigo-night"; Primary = "#304FFE"; Secondary = "#536DFE"; Tertiary = "#8C9EFF" }, # Indigo
    @{ Name = "royal-amethyst"; Primary = "#4A148C"; Secondary = "#FFC107"; Tertiary = "#FFCA28" }, # Violet
    @{ Name = "magenta-madness"; Primary = "#D500F9"; Secondary = "#E040FB"; Tertiary = "#EA80FC" }, # Magenta
    @{ Name = "sakura-breeze"; Primary = "#C2185B"; Secondary = "#009688"; Tertiary = "#4DB6AC" }, # Pink
    @{ Name = "golden-sands"; Primary = "#5D4037"; Secondary = "#FFC107"; Tertiary = "#FFECB3" }, # Brown
    @{ Name = "midnight-slate"; Primary = "#263238"; Secondary = "#00BCD4"; Tertiary = "#4DD0E1" } # Grey
)

New-Item -ItemType Directory -Force -Path "src/app/styles/generated"

foreach ($t in $themes) {
    Write-Host "Generating $($t.Name)..."
    $cmd = "npx ng generate @angular/material:theme-color --primary-color=$($t.Primary) --secondary-color=$($t.Secondary) --tertiary-color=$($t.Tertiary) --include-high-contrast=true --directory=src/app/styles/generated --force --no-interactive"
    Invoke-Expression $cmd
  
    Move-Item -Path "src/app/styles/generated_theme-colors.scss" -Destination "src/app/styles/generated/_$($t.Name).scss" -Force
}
