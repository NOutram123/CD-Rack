#!/bin/sh
# Called by deploy-nas.ps1 after transferring a release archive.
set -eu
umask 077
RELEASE=$1
ARCHIVE=$2
ROOT="$HOME/home-music"
NODE=/var/packages/Node.js_v22/target/usr/local/bin/node
case "$RELEASE" in *[!0-9a-z-]*|'') exit 1 ;; esac
"$NODE" -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
mkdir -p "$ROOT/releases/$RELEASE"
tar -xzf "$ARCHIVE" -C "$ROOT/releases/$RELEASE"
rm "$ARCHIVE"
"$NODE" --check "$ROOT/releases/$RELEASE/server.mjs"
"$NODE" --check "$ROOT/releases/$RELEASE/public/app.js"
if [ ! -f "$ROOT/config.sh" ]; then
  printf '%s\n' 'export PORT=8787' 'export BIND_ADDRESS=::' 'export NAS_LOCAL=true' > "$ROOT/config.sh"
fi
PREVIOUS=$(readlink "$ROOT/current" || true)
if [ -f "$ROOT/service.sh" ]; then sh "$ROOT/service.sh" stop; fi
cp "$ROOT/releases/$RELEASE/nas/service.sh" "$ROOT/service.sh"
ln -s "releases/$RELEASE" "$ROOT/current.new"
mv -fT "$ROOT/current.new" "$ROOT/current"
sh "$ROOT/service.sh" start
healthy() {
  "$NODE" --input-type=module -e 'const r=await fetch("http://127.0.0.1:"+(process.env.PORT||8787)+"/health",{headers:{Host:process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).host:"localhost:"+(process.env.PORT||8787)},signal:AbortSignal.timeout(2000)});if(!r.ok)process.exit(1)' >/dev/null 2>&1
}
. "$ROOT/config.sh"
attempt=0
until healthy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 15 ]; then
    sh "$ROOT/service.sh" stop
    if [ -n "$PREVIOUS" ]; then
      ln -s "$PREVIOUS" "$ROOT/current.rollback"
      mv -fT "$ROOT/current.rollback" "$ROOT/current"
      sh "$ROOT/service.sh" start
    fi
    echo 'Release failed its health check; previous release restored when available.' >&2
    exit 1
  fi
  sleep 1
done
if [ -n "$PREVIOUS" ]; then printf '%s\n' "$PREVIOUS" > "$ROOT/previous-release"; fi
echo "Installed $RELEASE at $ROOT"
echo "Boot task command: sh $ROOT/service.sh start"
