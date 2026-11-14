# CD Rack development

The application is in `audio-station-test`. Run `node --test` there after changes. Build the public Demo with `npm run build:demo`.

Keep browsing deliberate: selecting albums, refreshing, sorting and volume adjustments must not start playback. The volume modal blocks all underlying rack, cover, carousel and track interactions. Demo mode must never issue NAS API requests.

Preserve jewel-case proportions, multi-disc packaging, account-scoped catalogue/spine caches, and the separate browser preferences used by NAS and Demo modes. Never store DSM passwords or commit SSH keys, local catalogues, logs or session data.

NAS deployment uses `deploy-nas.ps1` with an explicitly selected current hostname and account, a dedicated verified SSH key, a successful health check and browser verification. Deployment restarts the service and invalidates its in-memory sessions.
