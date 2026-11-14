# Run interactively once on the development PC. Passwords stay in SSH's prompt.
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]*$')][string]$NasHost,
  [string]$User = 'YourDSMUser',
  [int]$SshPort = 22
)
$ErrorActionPreference = 'Stop'
if ($User -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*$') { throw 'Invalid SSH username.' }
$key = "$env:USERPROFILE/.ssh/home-music-nas"
New-Item -ItemType Directory -Force -Path (Split-Path $key) | Out-Null
if (-not (Test-Path -LiteralPath $key)) {
  Write-Host 'Creating a dedicated deployment key. A passphrase is optional; use ssh-agent if you set one.'
  & ssh-keygen -t rsa -b 3072 -f $key -C home-music-deployment
  if ($LASTEXITCODE -ne 0) { throw 'Key creation failed.' }
}
$publicKey = (Get-Content -LiteralPath "$key.pub" -Raw).Trim()
if ($publicKey -notmatch '^ssh-rsa [A-Za-z0-9+/=]+ home-music-deployment$') { throw 'Unexpected public key format.' }
Write-Host 'Verify the NAS host fingerprint when SSH asks, then enter your DSM password in the SSH prompt.'
$installKey = "umask 077; test -d `$HOME || exit 1; mkdir -p `$HOME/.ssh && chmod 700 `$HOME/.ssh && touch `$HOME/.ssh/authorized_keys && (grep -qxF '$publicKey' `$HOME/.ssh/authorized_keys || printf '%s\n' '$publicKey' >> `$HOME/.ssh/authorized_keys) && chmod 600 `$HOME/.ssh/authorized_keys"
& ssh -p $SshPort -o StrictHostKeyChecking=ask "${User}@${NasHost}" $installKey
if ($LASTEXITCODE -ne 0) { throw 'Key setup failed. Check SSH and DSM user home service.' }
& ssh -p $SshPort -i $key -o BatchMode=yes -o StrictHostKeyChecking=yes "${User}@${NasHost}" 'echo Deployment-key-ready'
if ($LASTEXITCODE -ne 0) { throw 'Key login failed. If passphrase protected, add the key to ssh-agent.' }
Write-Host 'NAS access configured. You can now run deploy-nas.ps1.'
