# Quick script to verify files and show push instructions
Write-Host "=== Verifying Files ===" -ForegroundColor Green

# Check if key files exist
$files = @("Dockerfile", ".dockerignore", ".node-version", "railway.json")
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "✅ $file exists" -ForegroundColor Green
    } else {
        Write-Host "❌ $file NOT FOUND" -ForegroundColor Red
    }
}

Write-Host "`n=== Git Status ===" -ForegroundColor Yellow
git status --short | Select-Object -First 10

Write-Host "`n=== Key Files to Push ===" -ForegroundColor Cyan
Write-Host "New files (need to add):"
Write-Host "  - Dockerfile"
Write-Host "  - .dockerignore"
Write-Host "  - .node-version"
Write-Host "`nModified files:"
Write-Host "  - railway.json"
Write-Host "  - nixpacks.toml"

Write-Host "`n=== Next Steps ===" -ForegroundColor Magenta
Write-Host "1. Add files: git add Dockerfile .dockerignore .node-version railway.json nixpacks.toml"
Write-Host "2. Commit: git commit -m 'Fix: Force Node.js 20 with Dockerfile'"
Write-Host "3. Push: git push"
Write-Host "`nOr use GitHub Desktop to commit and push visually."

