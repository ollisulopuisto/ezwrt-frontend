#!/bin/sh
# Tests the download-verification logic in openwrt-install.sh.
#
# The installer unpacks a downloaded archive as root on someone's router, so the
# checks around that are worth a regression test. This runs the real script with
# only the router-specific parts stubbed (apk, uci, init scripts, the root
# check, and wget) and points its paths at a sandbox — the verification and
# extraction logic is exercised unmodified.
#
#   sh scripts/test-openwrt-install.sh
#
# Deliberately depends on nothing but POSIX sh, tar and a SHA-256 tool: it has
# to run on a maintainer's macOS laptop and on a CI runner alike. `wget` is
# stubbed rather than served over HTTP, because fetching is not what is under
# test here — what happens to the bytes afterwards is.

set -u

SRC="$(cd "$(dirname "$0")" && pwd)/openwrt-install.sh"
WORK="$(mktemp -d)"
FAILURES=0

cleanup() { rm -rf "$WORK"; return 0; }
trap cleanup EXIT INT TERM

pass() { echo "  PASS  $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "  FAIL  $1"; }

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  else
    return 1
  fi
}

mkdir -p "$WORK/bin" "$WORK/www" "$WORK/acl" "$WORK/serve"

# --- stub wget: map a fake URL onto a local file ------------------------------
cat > "$WORK/bin/wget" <<'STUB'
#!/bin/sh
# Usage as called by the installer: wget -qO <dest> <url>
dest=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -qO) dest="$2"; shift 2 ;;
    -qO*) dest="${1#-qO}"; shift ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
src="$WGET_SERVE_DIR/$(basename "$url")"
[ -f "$src" ] || exit 1     # missing file behaves like a failed download
cat "$src" > "$dest"
STUB
chmod +x "$WORK/bin/wget"

# --- fixtures ----------------------------------------------------------------
mkdir -p "$WORK/dist/assets"
echo '<!doctype html><title>EZ-WRT</title>' > "$WORK/dist/index.html"
echo 'body{}' > "$WORK/dist/assets/app.css"
tar -czf "$WORK/serve/good.tar.gz" -C "$WORK/dist" .

mkdir -p "$WORK/nohtml"
echo stray > "$WORK/nohtml/stray.txt"
tar -czf "$WORK/serve/nohtml.tar.gz" -C "$WORK/nohtml" .

# An archive that escapes its target. tar implementations differ in how they let
# you build one, so try in order and then *prove* the result is dangerous —
# a harmless archive here would make the traversal check pass for the wrong
# reason, which is worse than not testing it.
mkdir -p "$WORK/evil"
echo pwned > "$WORK/evil/payload"
tar -czf "$WORK/serve/evil.tar.gz" -C "$WORK/evil" \
  --transform 's|payload|../../pwned|' payload 2>/dev/null \
  || tar -czPf "$WORK/serve/evil.tar.gz" "$WORK/evil/payload" 2>/dev/null \
  || tar -czf "$WORK/serve/evil.tar.gz" -C "$WORK" evil/../evil/payload 2>/dev/null \
  || true

EVIL_USABLE=0
if [ -f "$WORK/serve/evil.tar.gz" ] \
   && tar -tzf "$WORK/serve/evil.tar.gz" 2>/dev/null | grep -qE '^/|(^|/)\.\.(/|$)'; then
  EVIL_USABLE=1
fi

GOOD_SHA="$(sha256_of "$WORK/serve/good.tar.gz")" || {
  echo "No sha256 tool available (sha256sum, shasum or openssl); cannot run." >&2
  exit 1
}

# --- the installer, with only router-specific parts stubbed ------------------
sed \
  -e 's|^ACL_DIR=.*|ACL_DIR="'"$WORK"'/acl"|' \
  -e 's|^WWW_DIR=.*|WWW_DIR="'"$WORK"'/www/ezwrt"|' \
  -e 's|^if \[ "$(id -u)" -ne 0 \]; then|if false; then|' \
  -e 's|^apk |true |' \
  -e 's|^/etc/init.d/|true /etc/init.d/|' \
  -e 's|^uci |true uci |' \
  "$SRC" > "$WORK/install.sh"

run() { # run <label> <pass|fail> <env assignments...>
  label="$1"; expect="$2"; shift 2
  out="$(env "PATH=$WORK/bin:$PATH" "WGET_SERVE_DIR=$WORK/serve" "$@" \
        sh "$WORK/install.sh" 2>&1)"; rc=$?
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
  "EZWRT_DIST_URL=http://example.invalid/good.tar.gz" "EZWRT_DIST_SHA256=$GOOD_SHA"
if [ -f "$WORK/www/ezwrt/index.html" ] && [ -f "$WORK/www/ezwrt/assets/app.css" ]; then
  pass "files landed in place"
else
  fail "files missing after a successful install"
fi

run "missing checksum refuses" fail "EZWRT_DIST_URL=http://example.invalid/good.tar.gz"

run "wrong checksum refuses" fail \
  "EZWRT_DIST_URL=http://example.invalid/good.tar.gz" \
  "EZWRT_DIST_SHA256=0000000000000000000000000000000000000000000000000000000000000000"

run "uppercase checksum accepted" pass \
  "EZWRT_DIST_URL=http://example.invalid/good.tar.gz" \
  "EZWRT_DIST_SHA256=$(echo "$GOOD_SHA" | tr 'a-f' 'A-F')"

run "explicit insecure opt-out works" pass \
  "EZWRT_DIST_URL=http://example.invalid/good.tar.gz" "EZWRT_DIST_INSECURE=1"

run "failed download aborts" fail \
  "EZWRT_DIST_URL=http://example.invalid/missing.tar.gz" "EZWRT_DIST_INSECURE=1"

# A hashing tool that is present but produces nothing must fail closed with a
# clear reason, not silently read as a checksum mismatch.
mkdir -p "$WORK/nohash"
for tool in sha256sum shasum openssl; do
  printf '#!/bin/sh\nexit 0\n' > "$WORK/nohash/$tool"
  chmod +x "$WORK/nohash/$tool"
done
out="$(env "PATH=$WORK/nohash:$WORK/bin:$PATH" "WGET_SERVE_DIR=$WORK/serve" \
      "EZWRT_DIST_URL=http://example.invalid/good.tar.gz" \
      "EZWRT_DIST_SHA256=$GOOD_SHA" sh "$WORK/install.sh" 2>&1)"; rc=$?
if [ "$rc" -ne 0 ] && echo "$out" | grep -qi 'could not compute a checksum'; then
  pass "unusable hashing tool fails closed with a clear reason"
else
  fail "unusable hashing tool did not fail closed clearly (rc=$rc)"
  echo "$out" | sed 's/^/        /'
fi

echo "== Archive sanity =="
if [ "$EVIL_USABLE" = "1" ]; then
  run "path-traversal archive refused" fail \
    "EZWRT_DIST_URL=http://example.invalid/evil.tar.gz" "EZWRT_DIST_INSECURE=1"
  if [ -f "$WORK/pwned" ] || [ -f "$WORK/www/pwned" ]; then
    fail "traversal wrote outside the target directory"
  else
    pass "nothing written outside the target"
  fi
else
  # Never quietly skip: an untested traversal guard is the whole risk here.
  fail "could not build a path-traversal archive with this tar — guard is UNTESTED"
fi

run "archive without index.html refused" fail \
  "EZWRT_DIST_URL=http://example.invalid/nohtml.tar.gz" "EZWRT_DIST_INSECURE=1"

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
