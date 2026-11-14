#!/bin/sh
# Run as the same DSM user for deployment and the boot-up task.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NODE=/var/packages/Node.js_v22/target/usr/local/bin/node
LOCK="$ROOT/run"
case "${1:-status}" in
  start)
    if [ -f "$LOCK/pid" ]; then
      pid=$(cat "$LOCK/pid")
      if kill -0 "$pid" 2>/dev/null; then
        if tr '\000' ' ' < "/proc/$pid/cmdline" | grep -F "$ROOT/service.sh supervise" >/dev/null; then exit 0; fi
        echo 'Service PID belongs to another process; inspect the run directory.' >&2; exit 1
      fi
      rm -f "$LOCK/pid"
      rmdir "$LOCK" 2>/dev/null || true
    fi
    if ! mkdir "$LOCK" 2>/dev/null; then
      echo 'Stale service lock exists. Check the service process before removing the run directory.' >&2
      exit 1
    fi
    nohup sh "$ROOT/service.sh" supervise >> "$ROOT/service.log" 2>&1 < /dev/null &
    ;;
  supervise)
    echo $$ > "$LOCK/pid"
    child=''
    cleanup() {
      trap - TERM INT EXIT
      if [ -n "$child" ]; then kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi
      rm -f "$LOCK/pid"
      rmdir "$LOCK" 2>/dev/null || true
    }
    trap 'cleanup; exit 0' TERM INT
    trap cleanup EXIT
    while :; do
      if [ -f "$ROOT/config.sh" ]; then . "$ROOT/config.sh"; fi
      cd "$ROOT/current"
      export RELEASE_ID=$(basename "$(readlink "$ROOT/current")")
      "$NODE" server.mjs &
      child=$!
      wait "$child" || true
      child=''
      sleep 3 &
      child=$!
      wait "$child" || true
      child=''
    done
    ;;
  stop)
    if [ ! -f "$LOCK/pid" ]; then exit 0; fi
    pid=$(cat "$LOCK/pid")
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$LOCK/pid"
      rmdir "$LOCK" 2>/dev/null || true
      exit 0
    fi
    # Verify identity before signalling; never kill an unrelated reused PID.
    if ! tr '\000' ' ' < "/proc/$pid/cmdline" | grep -F "$ROOT/service.sh supervise" >/dev/null; then
      echo 'Service PID does not match; inspect the run directory.' >&2; exit 1
    fi
    kill "$pid"
    count=0
    while [ -d "$LOCK" ]; do
      count=$((count + 1)); [ "$count" -lt 30 ] || exit 1
      sleep 1
    done
    ;;
  status)
    if [ -f "$LOCK/pid" ] && kill -0 "$(cat "$LOCK/pid")" 2>/dev/null; then echo Running; else echo Stopped; fi
    ;;
  *) echo 'Usage: service.sh start|stop|status' >&2; exit 1 ;;
esac
