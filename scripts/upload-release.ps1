$version = "2.5.0"
$token = $env:GH_TOKEN
$owner = "maopujie10-sys"
$repo = "Bailongma"

if (-not $token) { Write-Host "ERROR: Set token first: `$env:GH_TOKEN='ghp_xxx'"; exit 1 }

# Try get existing release
try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/v$version" -Headers @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
    Write-Host "Found existing release: $($release.id)"
} catch {
    Write-Host "Creating new release v$version ..."
    $body = @{ tag_name = "v$version"; name = "Bailongma v$version"; body = "v$version - fix approval popup + speed optimization"; draft = $false; prerelease = $false } | ConvertTo-Json
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases" -Method Post -Headers @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" } -Body $body -ContentType "application/json"
    Write-Host "Created release: $($release.id)"
}

$releaseId = $release.id
Write-Host "Release ID: $releaseId"

# Delete old assets
Write-Host "Deleting old assets..."
foreach ($asset in $release.assets) {
    Invoke-RestMethod -Uri $asset.url -Method Delete -Headers @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" } | Out-Null
    Write-Host "  Deleted: $($asset.name)"
}

# Upload new files
$uploadUrl = "https://uploads.github.com/repos/$owner/$repo/releases/$releaseId/assets"
$files = @(
    "dist-build\Bailongma-Setup-$version.exe",
    "dist-build\Bailongma-Setup-$version.exe.blockmap",
    "dist-build\latest.yml"
)

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Host "SKIP: $file not found"
        continue
    }
    $name = Split-Path $file -Leaf
    Write-Host "Uploading $name ..."
    try {
        Invoke-RestMethod -Uri "$uploadUrl`?name=$name" -Method Post -Headers @{
            Authorization = "Bearer $token"
            "Content-Type" = "application/octet-stream"
        } -InFile $file | Out-Null
        Write-Host "  OK"
    } catch {
        Write-Host "  FAILED: $_"
    }
}

Write-Host "Done! https://github.com/$owner/$repo/releases/tag/v$version"
