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

# 4. Resolve a Python executable
$pythonCmd = $null
foreach ($candidate in @("py", "python")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) {
        $pythonCmd = $candidate
        break
    }
}

if (-not $pythonCmd) {
    throw "Python was not found in PATH. Install Python or run zip_extension.py manually."
}

try {
    # 5. Copy files to the isolated environment
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

    # 6. Create zip using Python script for standard forward-slash support
    # This avoids "Files outside directory" errors on the Chrome Web Store
    Write-Host "Creating $zipName using Python..."
    if ($pythonCmd -eq "py") {
        & py -3 zip_extension.py --source $tempDir --output $zipFilepath
    }
    else {
        & python zip_extension.py --source $tempDir --output $zipFilepath
    }

    if (-not (Test-Path $zipFilepath)) {
        throw "Packaging finished without producing $zipName."
    }

    Write-Host "`nSuccess! Your extension.zip is ready at:"
    Write-Host $zipFilepath
    Write-Host "`nUpload this file directly to the Chrome Web Store."
}
finally {
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force
    }
}
