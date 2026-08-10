#!/bin/sh
# EZ-WRT hardware verification.
#
# Run this from your workstation, NOT on the router: it talks to the router the
# same way the app does (HTTP -> uhttpd -> rpcd), so it exercises the session
# and ACL layers that a local `ubus call` would bypass.
#
#   ./scripts/verify-on-router.sh 192.168.1.1 [user] [password]
#
# It answers the open questions in README_OPENWRT.md ("Verifying on real
# hardware") and prints PASS/FAIL per check.
#
# What it changes on the router: it creates a disabled firewall rule named
# `ezwrt_verify`, applies it, and deletes it again at the end. The rule has no
# src/dest and enabled='0', so it never matches traffic. If the script is
# interrupted, remove any leftover with:
#   uci delete firewall.ezwrt_verify && uci commit firewall

HOST="$1"
USERNAME="${2:-root}"
PASSWORD="$3"
CURL_TIMEOUT=10

if [ -z "$HOST" ]; then
  echo "Usage: $0 <router-ip> [user] [password]" >&2
  exit 2
fi

case "$HOST" in
  http://*|https://*) API="${HOST%/}/ubus" ;;
  *) API="http://$HOST/ubus" ;;
esac

if [ -z "$PASSWORD" ]; then
  printf 'Password for %s@%s: ' "$USERNAME" "$HOST" >&2
  stty -echo 2>/dev/null
  read -r PASSWORD
  stty echo 2>/dev/null
  echo >&2
fi

PASSED=0
FAILED=0
SKIPPED=0

pass() { PASSED=$((PASSED + 1)); echo "  PASS  $1"; }
fail() { FAILED=$((FAILED + 1)); echo "  FAIL  $1"; }
skip() { SKIPPED=$((SKIPPED + 1)); echo "  SKIP  $1"; }
info() { echo "        $1"; }
head1() { echo; echo "== $1"; }

# --- ubus plumbing -----------------------------------------------------------
# No jq: OpenWrt boxes and stock macOS may not have it, and the fields we need
# are simple enough to pull out with sed.

rpc() { # rpc <method> <params-json>
  curl -s --max-time "$CURL_TIMEOUT" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" "$API" 2>/dev/null
}

code_of() { printf '%s' "$1" | sed -n 's/.*"result":\[\([0-9][0-9]*\).*/\1/p'; }
session_of() { printf '%s' "$1" | sed -n 's/.*"ubus_rpc_session":"\([^"]*\)".*/\1/p'; }
value_of() { printf '%s' "$1" | sed -n 's/.*"value":"\([^"]*\)".*/\1/p'; }

# Human-readable ubus status, so a FAIL says why.
explain() {
  case "$1" in
    "") echo "no result (not ubus, or the request failed)" ;;
    0) echo "ok" ;;
    1) echo "invalid command" ;;
    2) echo "invalid argument" ;;
    3) echo "method not found — rpcd is too old, or the ubus ACL omits it" ;;
    4) echo "not found" ;;
    5) echo "no data" ;;
    6) echo "permission denied — check the ezwrt ACL and re-run the installer" ;;
    7) echo "timeout" ;;
    8) echo "not supported" ;;
    *) echo "status $1" ;;
  esac
}

login() { # login -> prints session id
  session_of "$(rpc session.login "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")"
}

call() { # call <session> <method> <extra-params-without-braces>
  _s="$1"; _m="$2"; _p="$3"
  if [ -n "$_p" ]; then
    rpc "$_m" "{$_p,\"ubus_rpc_session\":\"$_s\"}"
  else
    rpc "$_m" "{\"ubus_rpc_session\":\"$_s\"}"
  fi
}

check() { # check <label> <response>
  _code=$(code_of "$2")
  if [ "$_code" = "0" ]; then
    pass "$1"
    return 0
  fi
  fail "$1 — $(explain "$_code")"
  return 1
}

echo "EZ-WRT verification against $API"
echo "User: $USERNAME"
echo
echo "Takes about a minute: two of the checks wait out a rollback timer."
echo
echo "This applies and then removes a disabled firewall rule, and triggers"
echo "service reloads. Any UCI changes already staged on the router will be"
echo "committed too. Expect brief network blips."
printf 'Continue? [y/N] '
read -r REPLY
case "$REPLY" in
  y|Y|yes|YES) ;;
  *) echo "Aborted."; exit 1 ;;
esac

# --- 0. Reachability ---------------------------------------------------------
head1 "0. Endpoint and CORS"

RAW=$(curl -s -i --max-time "$CURL_TIMEOUT" -H 'Content-Type: application/json' \
  -H 'Origin: http://ezwrt.invalid' \
  -d '{"jsonrpc":"2.0","id":1,"method":"session.login","params":{"username":"","password":""}}' \
  "$API" 2>/dev/null)

if [ -z "$RAW" ]; then
  fail "$API did not respond — is uhttpd-mod-ubus installed and ubus_prefix set?"
  echo
  echo "Cannot continue without the ubus endpoint."
  exit 1
fi
pass "ubus endpoint responds"

if printf '%s' "$RAW" | grep -qi '^access-control-allow-origin'; then
  pass "CORS enabled (ubus_cors=1) — the app can run off-router"
else
  skip "no Access-Control-Allow-Origin header"
  info "Only needed if the app is not served by the router itself:"
  info "  uci set uhttpd.main.ubus_cors='1' && uci commit uhttpd && /etc/init.d/uhttpd restart"
fi

# --- 1. Login ----------------------------------------------------------------
head1 "1. Authentication"

SESSION=$(login)
if [ -z "$SESSION" ]; then
  fail "login failed for $USERNAME — wrong password, or rpcd is not granting session.login"
  echo
  echo "Cannot continue without a session."
  exit 1
fi
pass "logged in (session ${SESSION%%????????????????????????}...)"

# --- 2. Reads the dashboard needs -------------------------------------------
head1 "2. Dashboard reads (ACL coverage)"

check "uci get wireless" "$(call "$SESSION" uci.get '"config":"wireless"')"
check "uci get firewall" "$(call "$SESSION" uci.get '"config":"firewall"')"
check "system info" "$(call "$SESSION" system.info '')"
check "dhcp ipv4leases" "$(call "$SESSION" dhcp.ipv4leases '')"

WAN=$(call "$SESSION" network.interface.status '"interface":"wan"')
if [ "$(code_of "$WAN")" = "0" ]; then
  WAN_DEV=$(printf '%s' "$WAN" | sed -n 's/.*"l3_device":"\([^"]*\)".*/\1/p')
  [ -z "$WAN_DEV" ] && WAN_DEV=$(printf '%s' "$WAN" | sed -n 's/.*"device":"\([^"]*\)".*/\1/p')
  pass "wan interface status (device: ${WAN_DEV:-unknown})"
  if [ -n "$WAN_DEV" ]; then
    check "network.device status $WAN_DEV (traffic graph)" \
      "$(call "$SESSION" network.device.status "\"name\":\"$WAN_DEV\"")"
  fi
else
  fail "wan interface status — $(explain "$(code_of "$WAN")")"
  info "The traffic graph resolves its device from this call."
fi

# --- 3. Staging and section creation ----------------------------------------
head1 "3. Staging and uci.add"

VERIFY_SECTION="ezwrt_verify"
call "$SESSION" uci.delete "\"config\":\"firewall\",\"section\":\"$VERIFY_SECTION\"" >/dev/null 2>&1

ADD=$(call "$SESSION" uci.add \
  "\"config\":\"firewall\",\"type\":\"rule\",\"name\":\"$VERIFY_SECTION\",\"values\":{\"name\":\"ezwrt verification\",\"enabled\":\"0\",\"target\":\"REJECT\"}")
if ! check "uci add creates a named section" "$ADD"; then
  info "Device pause, bedtime and port forwarding all depend on this."
fi

SET=$(call "$SESSION" uci.set \
  "\"config\":\"firewall\",\"section\":\"$VERIFY_SECTION\",\"values\":{\"name\":\"ezwrt staged\"}")
check "uci set on the new section" "$SET"

CHANGES=$(call "$SESSION" uci.changes '"config":"firewall"')
if [ "$(code_of "$CHANGES")" = "0" ]; then
  if printf '%s' "$CHANGES" | grep -q "$VERIFY_SECTION"; then
    pass "staged changes are visible to this session (uci.apply will see them)"
  else
    fail "uci changes does not list our staged edit"
    info "If apply cannot see staged changes, writes would silently do nothing."
  fi
else
  skip "uci changes — $(explain "$(code_of "$CHANGES")")"
fi

# --- 4. Apply with rollback, confirmed from a NEW session --------------------
head1 "4. Safe Apply: confirm from a new session (the critical one)"

# Note: running this against mock-server/ always passes, because the mock hands
# out one fixed session id. Only a real router can answer this one.
info "Applying with a 20s rollback timer, then confirming from a fresh login."
APPLY=$(call "$SESSION" uci.apply '"rollback":true,"timeout":20')
if ! check "uci apply with rollback" "$APPLY"; then
  info "Without this the app has no safety net at all."
else
  SESSION2=$(login)
  if [ -z "$SESSION2" ]; then
    fail "second login failed"
  else
    pass "logged in again (simulating a reconnect after being disconnected)"
    CONFIRM=$(call "$SESSION2" uci.confirm '')
    if check "uci confirm accepted from the new session" "$CONFIRM"; then
      info "Waiting 25s to prove the change is not rolled back anyway..."
      sleep 25
      READBACK=$(call "$SESSION2" uci.get \
        "\"config\":\"firewall\",\"section\":\"$VERIFY_SECTION\",\"option\":\"name\"")
      if [ "$(value_of "$READBACK")" = "ezwrt staged" ]; then
        pass "change survived the timer — reconnect-then-confirm works"
      else
        fail "change was rolled back despite the confirm"
        info "The pending apply is bound to the session that applied it."
        info "A user disconnected by their own change could never confirm it,"
        info "so every such change would revert. Report this — the app would"
        info "need to warn instead of promising a safety net."
      fi
      SESSION="$SESSION2"
    else
      info "Confirm is rejected from a different session than the apply."
      info "Same consequence as above. Waiting out the timer before continuing..."
      sleep 22
    fi
  fi
fi

# --- 5. Rollback actually fires ---------------------------------------------
head1 "5. Safe Apply: an unconfirmed change reverts"

SESSION=$(login)
call "$SESSION" uci.set \
  "\"config\":\"firewall\",\"section\":\"$VERIFY_SECTION\",\"values\":{\"name\":\"ezwrt should revert\"}" >/dev/null
APPLY2=$(call "$SESSION" uci.apply '"rollback":true,"timeout":10')
if check "uci apply (leaving it unconfirmed)" "$APPLY2"; then
  info "Waiting 20s for the router to roll back on its own..."
  sleep 20
  SESSION=$(login)
  READBACK2=$(call "$SESSION" uci.get \
    "\"config\":\"firewall\",\"section\":\"$VERIFY_SECTION\",\"option\":\"name\"")
  CURRENT=$(value_of "$READBACK2")
  if [ "$CURRENT" = "ezwrt should revert" ]; then
    fail "the change was NOT rolled back"
    info "The timer did not fire. Safe Apply gives no protection on this router."
  else
    pass "unconfirmed change reverted by the router (now: '${CURRENT:-removed}')"
  fi
fi

# --- 6. Schema guesses -------------------------------------------------------
head1 "6. adblock schema (EZ-WRT assumes 'global' / adb_enabled)"

ADB=$(call "$SESSION" uci.get '"config":"adblock"')
ADB_SECTIONS=$(printf '%s' "$ADB" | sed 's/.*"values":{//' | tr ',' '\n' \
  | sed -n 's/^"\([A-Za-z0-9_]*\)":{.*/\1/p' | tr '\n' ' ')

case "$(code_of "$ADB")" in
  0)
    if [ -z "$ADB_SECTIONS" ]; then
      skip "adblock has no configuration — package not installed?"
    else
      if printf '%s' "$ADB" | grep -q '"global"'; then
        pass "adblock has a 'global' section"
      else
        fail "no 'global' section in /etc/config/adblock"
        info "Sections found: $ADB_SECTIONS"
      fi
      if printf '%s' "$ADB" | grep -q 'adb_enabled'; then
        pass "adb_enabled option present"
      else
        fail "no adb_enabled option — the adblock toggle writes the wrong key"
      fi
    fi
    ;;
  *) skip "adblock not installed or not readable — $(explain "$(code_of "$ADB")")" ;;
esac

SVC=$(call "$SESSION" service.list '"name":"adblock"')
if [ "$(code_of "$SVC")" = "0" ]; then
  INSTANCES=$(printf '%s' "$SVC" | sed -n 's/.*"instances":{"\([^"]*\)".*/\1/p')
  if [ -n "$INSTANCES" ]; then
    info "service list adblock reports instance key: '$INSTANCES'"
    info "(the app treats any running instance as 'on', so this is informational)"
  fi
fi

# --- 7. Cleanup --------------------------------------------------------------
head1 "7. Cleanup"

DEL=$(call "$SESSION" uci.delete "\"config\":\"firewall\",\"section\":\"$VERIFY_SECTION\"")
check "removed the verification section" "$DEL"
APPLY3=$(call "$SESSION" uci.apply '"rollback":false')
if [ "$(code_of "$APPLY3")" != "0" ]; then
  call "$SESSION" uci.commit '"config":"firewall"' >/dev/null
  call "$SESSION" service.event '"type":"config.change","data":{"package":"firewall"}' >/dev/null
fi
info "If anything remains: uci delete firewall.$VERIFY_SECTION && uci commit firewall"

# --- Summary -----------------------------------------------------------------
echo
echo "=============================="
echo " $PASSED passed, $FAILED failed, $SKIPPED skipped"
echo "=============================="
echo
echo "Still to check by hand ON the router (needs a shell there):"
echo "  fw4 print | grep -i -A2 'meta hour'   # are bedtime start_time/stop_time honoured?"
echo "  logread -e rpcd                       # any ACL denials during this run"
echo

[ "$FAILED" -eq 0 ]
