# NAS hosting and updates

This app controls Audio Station on a Synology NAS and a Denon DLNA/UPnP renderer on the same home network. The user guide includes requirements and a setup checklist. Example hostnames and account names below are placeholders.

## Requirements

- Synology DSM with Audio Station and indexed music folders.
- Node.js 22 or later (the service uses the Synology Node.js v22 package path).
- DSM user home service, SSH for deployment, and an account allowed to use Audio Station and its DLNA/UPnP renderers.
- A dedicated deployment SSH key and verified NAS host key. Do not save DSM passwords.
- TCP 8787 reachable from the home LAN; no router port forwarding.
- The existing NAS `/usr/bin/convert` (ImageMagick) is used for optional cached 512-pixel thumbnails. Original artwork is the fallback if conversion is unavailable.

## One-time access

From PowerShell in the application folder, use the current NAS hostname/address and your DSM deployment account:

```powershell
./connect-nas.ps1 -NasHost YourNASName.local -User YourDSMUser
```

Verify the host fingerprint and enter the password only in the interactive SSH prompt. The script creates a dedicated key under the PC user's `.ssh` folder. Use ssh-agent for a passphrase-protected key.

## Deploy

```powershell
./deploy-nas.ps1 -NasHost YourNASName.local -User YourDSMUser -AppUrl http://YourNASName.local:8787
```

This runs tests, uploads an isolated release, checks syntax, switches the current-release link, restarts the service and verifies the expected healthy release. A failed startup restores the previous release when available. It does not start music or change music files. Sign in again after deployment.

The installation lives at `$HOME/home-music` on the NAS. Configuration, service supervision and logs live there; releases are in `releases/`. Account-scoped catalogue, spine-colour and thumbnail caches live outside releases in `catalogue/` and survive updates. Do not commit these files.

## Start at boot

Create a DSM Task Scheduler triggered user-defined script, event **Boot-up**, named **Home Music PWA**, running as the deployment user. Paste the exact startup command printed by the installer. Run the task once and verify the app in the PC browser. Then verify after a NAS reboot. Use the account/path reported by the installer, rather than copying someone else's home-directory path.

The service binds to `::` for IPv4/IPv6. Use a working local hostname or discover the current DHCP address. The hostname example `YourNASName.local` requires the NAS's existing mDNS advertisement.

## HTTP and optional HTTPS

The default is HTTP on the home LAN. This does not provide the trusted origin normally required for LAN PWA installation. To add trusted HTTPS, configure a DSM reverse proxy and certificate, preserve the public Host header, set `PUBLIC_ORIGIN` in `config.sh`, and bind the backend to loopback if appropriate. Pass the matching HTTPS app URL to the deployment script for verification.

## Sessions and troubleshooting

App logins expire after 30 days of browser inactivity. Read-only Audio Station checks help keep the NAS session alive without changing playback or volume. Passwords are never stored. Service/NAS restarts and DSM session revocation still require sign-in.

Use Settings -> Refresh Rack after indexed music uploads/deletions. For service diagnostics, use `sh "$HOME/home-music/service.sh" status` and inspect `service.log`. A stopped supervisor may be started with `sh "$HOME/home-music/service.sh" start`. Avoid removing run-state files or switching releases until the current service state is understood.
