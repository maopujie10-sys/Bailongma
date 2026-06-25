$version = "2.4.2"
$token = $env:GH_TOKEN
$owner = "maopujie10-sys"
$repo = "Bailongma"

if (-not $token) { Write-Host "ERROR: Set token first: `$env:GH_TOKEN='ghp_xxx'"; exit 1 }

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/v$version" -Headers @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }
$releaseId = $release.id
Write-Host "Release ID: $releaseId"

Write-Host "Deleting old assets..."
foreach ($asset in $release.assets) {
    Invoke-RestMethod -Uri $asset.url -Method Delete -Headers @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" } | Out-Null
    Write-Host "  Deleted: $($asset.name)"
}

$uploadUrl = "https://uploads.github.com/repos/$owner/$repo/releases/$releaseId/assets"
$files = @(
    "dist-build\Bailongma-Setup-$version.exe",
    "dist-build\Bailongma-Setup-$version.exe.blockmap",
    "dist-build\latest.yml"
)

foreach ($file in $files) {
    $name = Split-Path $file -Leaf
    Write-Host "Uploading $name ..."
    Invoke-RestMethod -Uri "$uploadUrl`?name=$name" -Method Post -Headers @{
        Authorization = "Bearer $token"
        "Content-Type" = "application/octet-stream"
    } -InFile $file | Out-Null
    Write-Host "  OK"
}

Write-Host "Done! https://github.com/$owner/$repo/releases/tag/v$version"
