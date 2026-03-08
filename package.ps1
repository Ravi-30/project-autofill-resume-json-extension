# Isolated Packaging Script for Chrome Extension
$zipName = "extension.zip"
$projectRoot = Get-Location
$zipFilepath = Join-Path $projectRoot $zipName
$tempDir = Join-Path $env:TEMP ("ext_build_" + [Guid]::NewGuid().ToString().Substring(0, 8))

# 1. Clean up existing zip in project root
if (Test-Path $zipFilepath) {
    Remove-Item $zipFilepath -Force
}

# 2. Create isolated temp directory
Write-Host "Creating isolated build environment at $tempDir..."
New-Item -ItemType Directory -Path $tempDir | Out-Null

# 3. List of files/folders to include
$includes = @(
    "manifest.json",
    "background.js",
    "content.js",
    "resumeProcessor.js",
    "sidepanel.html",
    "sidepanel.js",
    "styles.css",
    "atsStrategies",
    "icons"
)

# 4. Copy files to the isolated environment
Write-Host "Staging files..."
foreach ($item in $includes) {
    $src = Join-Path $projectRoot $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $tempDir -Recurse
    }
    else {
        Write-Warning "Required file not found: $item"
    }
}

# 5. Create zip using Python script for standard forward-slash support
# This avoids "Files outside directory" errors on the Chrome Web Store
Write-Host "Creating $zipName using Python..."
python zip_extension.py

# 6. Cleanup (Note: we keep the python script for future use, but it's small)
Write-Host "`nSuccess! Your extension.zip is ready at:"
Write-Host $zipFilepath
Write-Host "`nUpload this file directly to the Chrome Web Store."
