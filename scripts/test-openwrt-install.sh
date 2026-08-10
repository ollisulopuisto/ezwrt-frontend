#!/bin/sh
# Tests the download-verification logic in openwrt-install.sh.
#
# The installer unpacks a downloaded archive as root on someone's router, so
# the checks around that are worth a regression test. This runs the real script
# with only the router-specific parts stubbed (apk, uci, init scripts, the root
# check) and points its paths at a sandbox — the download, verify and extract
# logic is exercised unmodified.
#
#   sh scripts/test-openwrt-install.sh
#
# Needs python3 (to serve the archives over HTTP) and GNU tar.

set -u

SRC="$(cd "$(dirname "$0")" && pwd)/openwrt-install.sh"
WORK="$(mktemp -d)"
PORT="${PORT:-3311}"
SERVER_PID=""
FAILURES=0

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$WORK"
  return 0
}
trap cleanup EXIT INT TERM

mkdir -p "$WORK/bin" "$WORK/www" "$WORK/acl" "$WORK/serve"

# A well-formed dist tarball, one that escapes the target, one missing index.html.
mkdir -p "$WORK/dist/assets"
echo '<!doctype html><title>EZ-WRT</title>' > "$WORK/dist/index.html"
echo 'body{}' > "$WORK/dist/assets/app.css"
tar -czf "$WORK/serve/good.tar.gz" -C "$WORK/dist" .

mkdir -p "$WORK/evil"
echo 'pwned' > "$WORK/evil/payload"
tar -czf "$WORK/serve/evil.tar.gz" -C "$WORK/evil" \
  --transform 's|payload|../../pwned|' payload 2>/dev/null

mkdir -p "$WORK/nohtml"
echo stray > "$WORK/nohtml/stray.txt"
tar -czf "$WORK/serve/nohtml.tar.gz" -C "$WORK/nohtml" .

GOOD_SHA="$(sha256sum "$WORK/serve/good.tar.gz" | awk '{print $1}')"

# wget's file:// handling is unreliable, so serve the archives for real.
( cd "$WORK/serve" && python3 -m http.server "$PORT" >/dev/null 2>&1 ) &
SERVER_PID=$!
BASE="http://127.0.0.1:$PORT"

i=0
while [ $i -lt 50 ]; do
  wget -qO /dev/null "$BASE/good.tar.gz" 2>/dev/null && break
  i=$((i + 1)); sleep 0.2
done

sed \
  -e 's|^ACL_DIR=.*|ACL_DIR="'"$WORK"'/acl"|' \
  -e 's|^WWW_DIR=.*|WWW_DIR="'"$WORK"'/www/ezwrt"|' \
  -e 's|^if \[ "$(id -u)" -ne 0 \]; then|if false; then|' \
  -e 's|^apk |true |' \
  -e 's|^/etc/init.d/|true /etc/init.d/|' \
  -e 's|^uci |true uci |' \
  "$SRC" > "$WORK/install.sh"

pass() { echo "  PASS  $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "  FAIL  $1"; }

run() { # run <label> <pass|fail> <env assignments...>
  label="$1"; expect="$2"; shift 2
  out="$(env "$@" sh "$WORK/install.sh" 2>&1)"; rc=$?
  if [ "$expect" = "pass" ] && [ "$rc" -eq 0 ]; then
    pass "$label"
  elif [ "$expect" = "fail" ] && [ "$rc" -ne 0 ]; then
    pass "$label — $(echo "$out" | grep -m1 -i 'error:' || echo 'non-zero exit')"
  else
    fail "$label (rc=$rc)"
    echo "$out" | sed 's/^/        /'
  fi
}

echo "== Download verification =="
run "correct checksum installs" pass \
  "EZWRT_DIST_URL=$BASE/good.tar.gz" "EZWRT_DIST_SHA256=$GOOD_SHA"
if [ -f "$WORK/www/ezwrt/index.html" ] && [ -f "$WORK/www/ezwrt/assets/app.css" ]; then
  pass "files landed in place"
else
  fail "files missing after a successful install"
fi

run "missing checksum refuses" fail "EZWRT_DIST_URL=$BASE/good.tar.gz"

run "wrong checksum refuses" fail \
  "EZWRT_DIST_URL=$BASE/good.tar.gz" \
  "EZWRT_DIST_SHA256=0000000000000000000000000000000000000000000000000000000000000000"

run "uppercase checksum accepted" pass \
  "EZWRT_DIST_URL=$BASE/good.tar.gz" \
  "EZWRT_DIST_SHA256=$(echo "$GOOD_SHA" | tr 'a-f' 'A-F')"

run "explicit insecure opt-out works" pass \
  "EZWRT_DIST_URL=$BASE/good.tar.gz" "EZWRT_DIST_INSECURE=1"

echo "== Archive sanity =="
run "path-traversal archive refused" fail \
  "EZWRT_DIST_URL=$BASE/evil.tar.gz" "EZWRT_DIST_INSECURE=1"
if [ -f "$WORK/pwned" ]; then
  fail "traversal wrote outside the target directory"
else
  pass "nothing written outside the target"
fi

run "archive without index.html refused" fail \
  "EZWRT_DIST_URL=$BASE/nohtml.tar.gz" "EZWRT_DIST_INSECURE=1"

echo "== Housekeeping =="
if ls /tmp/ezwrt-dist.* /tmp/ezwrt-stage.* >/dev/null 2>&1; then
  fail "temp files left behind"
else
  pass "no temp files left behind"
fi

run "no-op when EZWRT_DIST_URL is unset" pass "EZWRT_UNUSED=1"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "All installer checks passed."
else
  echo "$FAILURES installer check(s) failed."
fi
[ "$FAILURES" -eq 0 ]
