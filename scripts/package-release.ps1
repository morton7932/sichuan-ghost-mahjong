$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$node = "C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$releaseRoot = Join-Path $projectRoot "release\sichuan-ghost-mahjong"
$publicDownloads = Join-Path $projectRoot "public\downloads"
$zip = Join-Path $publicDownloads "sichuan-ghost-mahjong-offline.zip"

& $node (Join-Path $PSScriptRoot "build-offline.mjs")
if ($LASTEXITCODE -ne 0) { throw "Offline build failed with exit code $LASTEXITCODE" }
New-Item -ItemType Directory -Force -Path $publicDownloads | Out-Null
Compress-Archive -Path (Join-Path $releaseRoot "*") -DestinationPath $zip -Force
$releaseDownloads = Join-Path $releaseRoot "downloads"
New-Item -ItemType Directory -Force -Path $releaseDownloads | Out-Null
Copy-Item -LiteralPath $zip -Destination (Join-Path $releaseDownloads (Split-Path $zip -Leaf)) -Force
Write-Output "Publish folder: $releaseRoot"
Write-Output "Offline archive: $zip"
