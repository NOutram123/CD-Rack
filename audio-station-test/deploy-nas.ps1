param(
  [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]*$')][string]$NasHost,
  [string]$User = 'YourDSMUser',
  [int]$SshPort = 22,
  [string]$AppUrl,
  [string]$IdentityFile = "$env:USERPROFILE/.ssh/home-music-nas"
)
$ErrorActionPreference = 'Stop'
if ($User -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*$') { throw 'Invalid SSH username.' }
Push-Location $PSScriptRoot
try {
  & node --test
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed; nothing deployed.' }
  $release = (Get-Date -Format 'yyyyMMddHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
  $archive = Join-Path ([IO.Path]::GetTempPath()) "home-music-$release.tgz"
  try {
    & tar -czf $archive server.mjs library.mjs session-policy.mjs artwork-thumbnail.mjs package.json public nas
    if ($LASTEXITCODE -ne 0) { throw 'Could not build the release archive.' }
    $sshOptions = @('-i', $IdentityFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10')
    # Legacy SCP works with Synology SSH without requiring the SFTP service.
    & scp -O @sshOptions -P $SshPort $archive "${User}@${NasHost}:home-music-$release.tgz"
    if ($LASTEXITCODE -ne 0) { throw 'Upload failed. Run connect-nas.ps1 first to configure SSH access.' }
    $command = "mkdir -p home-music-stage-$release && tar -xzf home-music-$release.tgz -C home-music-stage-$release nas/install.sh && sh home-music-stage-$release/nas/install.sh $release home-music-$release.tgz; result=`$?; rm -f home-music-stage-$release/nas/install.sh; rmdir home-music-stage-$release/nas home-music-stage-$release; exit `$result"
    & ssh @sshOptions -p $SshPort "${User}@${NasHost}" $command
    if ($LASTEXITCODE -ne 0) { throw 'NAS installation failed; inspect the message above.' }
    if (-not $AppUrl) { $AppUrl = "http://${NasHost}:8787" }
    $health = Invoke-RestMethod "$($AppUrl.TrimEnd('/'))/health" -TimeoutSec 10
    if (-not $health.ok -or $health.release -ne $release) { throw 'NAS did not return the expected healthy release.' }
    Write-Host "NAS version is live: $AppUrl (release $release)"
    Write-Host 'Open that address in this PC browser. A service update requires a fresh Audio Station login.'
  } finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
  }
} finally { Pop-Location }
