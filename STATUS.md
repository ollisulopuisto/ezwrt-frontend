# EZ-WRT Status, TODO and Decisions

The living record of what has been built, how strongly it is verified, what is
still open, and what was deliberately not done. Update it in the same commit as
the change it describes.

`ROADMAP.md` says what we intend to build and why. This file says where each of
those things actually stands.

## Confidence levels

The important distinction in this project is **what the mock proves versus what
a router proves**. The mock server was written alongside the client, so the two
agreeing shows they are consistent — not that either matches rpcd.

| Level | Meaning |
| --- | --- |
| **HW** | Verified against a real OpenWrt router |
| **MOCK** | Verified by tests against `mock-server/`, which models UCI semantics |
| **UI** | Driven in a real browser against the mock |
| **REASONED** | Follows from documented rpcd/OpenWrt behaviour, never executed |
| **OPEN** | Not verified, and we know it matters |

**Nothing is HW yet.** The plan is to clone this repo on the always-on Mac
Studio and point the dev server at a spare OpenWrt box once one is free, then
run `scripts/verify-on-router.sh`. See "Verifying on real hardware" in
`README_OPENWRT.md`.

---

## Implemented

### Router communication

| Item | Level | Notes |
| --- | --- | --- |
| Create sections with `uci.add` when `uci.set` returns not-found | MOCK | `uci set` only edits existing sections; device pause, bedtime and port forwarding all depend on this |
| Apply/reload after changes so they take effect | MOCK | Committing alone changes nothing on a running system |
| Re-assert `enabled='1'` when re-blocking a device | MOCK, UI | pause → unpause → pause used to silently do nothing |
| Port forwards as `redirect` sections with `target DNAT` | MOCK | Were written as `rule` + `ACCEPT`, overriding what the UI passed |
| Session reuse, re-login once on permission-denied | MOCK | Was logging in on every 5s poll |
| WAN device resolved from the `wan` interface | MOCK | Was hardcoded to `eth1` |
| adblock switch at `adblock.global.adb_enabled` | REASONED | Schema is a guess — question 4 below |
| `service.event` config.change fallback for old rpcd | MOCK | Used only when `uci.apply` is missing |

### Safe Apply (rollback timer)

| Item | Level | Notes |
| --- | --- | --- |
| Stage → `uci apply` with `rollback:true` + 90s timer | MOCK | Never commit first; rpcd applies what is staged |
| Confirm / Undo buttons (`uci confirm` / `uci rollback`) | MOCK, UI | |
| Router reverts when nobody confirms | MOCK, UI | Integration tests let a real timer fire; browser test watches the banner clear |
| Countdown persisted across a reload | UI | So a user disconnected by their own change can reconnect and still confirm |
| Only one pending change; other controls disabled | MOCK, UI | Stacking changes would make the rollback point meaningless |
| Falls back to plain commit when `uci.apply` is absent, and says so | MOCK | No safety net on that path, by design |
| **Confirm accepted from a new session after reconnecting** | OPEN | The assumption the whole feature rests on — question 1 below |

### Dashboard

| Item | Level | Notes |
| --- | --- | --- |
| Error cleared on a successful poll | MOCK, UI | One failed poll used to hide every module until a page reload |
| Dashboard stays mounted through a transient failure | UI | |
| adblock / VPN / DHCP / system / traffic treated as optional | MOCK | A router without WireGuard still gets a working dashboard |
| Guest network found by name, not by assuming a `guest` section | MOCK, UI | Real configs use `default_radio0`, `wifinet1`, … |
| Wireless sections labelled by their radio | UI | |
| Snapshot restore staged and applied as one rollback-protected change | MOCK | |
| Polling pauses while the tab is hidden, 15s interval, refreshes on return | UI | Salvaged from `copilot/refactor-openwrt-installation`; each poll is ~7 authenticated calls |

### Setup and platform

| Item | Level | Notes |
| --- | --- | --- |
| ACL grants ubus `uci` methods (`get`/`changes`, `add`/`set`/`delete`/`commit`/`apply`/`confirm`/`rollback`) | REASONED | uhttpd authorises per object *and* method; per-config grants alone were never enough — question 3 below |
| Installer sets `ubus_cors` / `ubus_prefix` | REASONED | Without CORS every off-router client is blocked |
| Installer no longer claims the app is installed; optional `EZWRT_DIST_URL` | REASONED | |
| Android cleartext HTTP, iOS ATS local networking | OPEN | Config written; **no device build has been run** |
| CI on Node 22, `npm ci`, `npm test` | Verified in CI | Vite 7 needs ^20.19 \|\| >=22.12 |
| Calendar versioning tracks the real date | Verified | Was pinned to `26.2.x`; produced `26.8.0` on the next commit |
| Tests typechecked in their own tsconfig project | Verified | |

### Test infrastructure

| Item | Level | Notes |
| --- | --- | --- |
| Mock server models UCI semantics, real ubus error codes, staged vs committed, apply snapshot + timer, `delete`, `changes` | — | It previously returned fake success for everything, which is what hid every bug above |
| 38 unit + integration tests | — | Integration tests fork the mock server and wait out real rollback timers |
| `scripts/verify-on-router.sh` | Verified both ways | 21/21 against the mock; 7 correct failures against a deliberately broken stub |

---

## Open questions (blocked on hardware)

Ranked by consequence. Full detail in `README_OPENWRT.md`; questions 1–4 are
automated by `scripts/verify-on-router.sh`.

1. **`uci confirm` from a new session.** If rpcd binds the pending apply to the
   session that called apply, a user disconnected by their own change can never
   confirm — every such change would revert, making Safe Apply worse than
   nothing. The app would have to warn instead of promising a safety net.
2. **`uci apply` sees session-staged changes.** If not, writes silently do nothing.
3. **ACL completeness** for `apply` / `confirm` / `rollback`.
4. **adblock schema** — `global` / `adb_enabled`, and the `service list` instance key.
5. **fw4 honours `start_time`/`stop_time`** on rules, or Bedtime does nothing.
   Needs a shell on the box: `fw4 print | grep -i -A2 'meta hour'`.

Also unverified: the **Android and iOS builds**. The cleartext/ATS config is
written but no device build has been run, so "the packaged app can reach the
router" is still a claim, not a result.

---

## Known limitations (accepted, not bugs)

- **Rollback does not survive a reboot.** rpcd holds the timer in memory, so a
  change that crashes or reboots the router commits with nothing left to undo
  it. LuCI has the same hole.
- **Rollback covers UCI config only.** The `network.interface up`/`down` after a
  VPN change is runtime state; a network reload is what realigns it.
- **The pre-`uci.apply` fallback has no rollback at all.** The UI says so.
- **The router password is stored in plaintext in `localStorage`**, because the
  5s polling loop needs it. Documented in the README.
- **EZ-WRT toggles a guest network, it does not create one.** If the wireless
  config has no guest interface, the module does not appear.
- **`npm run lint` fails on `main`** with pre-existing `no-explicit-any` errors,
  so it is not wired into CI.

---

## TODO

Roughly in the order I would do them.

1. **Run `verify-on-router.sh` against real hardware** and fix whatever it finds.
   Everything else is guesswork until this happens.
2. **No way to delete a port forward or a block rule from the UI.** You can add a
   port forward and pause a device, but rules can only be removed over SSH.
   Needs `uci.delete` wiring (the ACL and mock already support it).
3. **The traffic chart plots cumulative counters, not a rate**, so it only ever
   climbs. Should be a delta between polls.
4. **Bedtime times are shared across all devices** — `startTime`/`stopTime` are
   component state in `DeviceModule`, so opening a second device shows the first
   one's times rather than that device's saved schedule.
5. **No favicon**, so every page load logs a 404.

---

## Ideas (not decided)

### Salvaged from `copilot/refactor-openwrt-installation`

That branch was never merged and had no PR. Its polling improvement is now on
`main` (above); these are the rest, recorded here before the branch was deleted.

**The branch was deleted on 2026-08-10. Its tip was `9acc8e3`** ("chore:
finalize CI follow-up improvements from review"). GitHub keeps unreferenced
commits fetchable by SHA until garbage collection, so the actual files can be
recovered for a while:

```bash
git fetch origin 9acc8e31e0a239b74a37476c800ddf3f6510e4f1
git checkout -b salvage FETCH_HEAD
```

That window is not indefinite. If the packaging is wanted later and the SHA no
longer resolves, it has to be rebuilt from the description below.

- **Ship EZ-WRT as an installable package.** The branch builds a package
  containing the app at `/www/ezwrt`, with `/etc/uci-defaults/99-ezwrt-uhttpd`
  setting `ubus_prefix`/`ubus_cors` at install time — declarative and
  idempotent, better than the installer's imperative `uci set`. CI uploads it as
  an artifact. **It builds an `.ipk` (opkg), but this project targets OpenWrt 25,
  which uses `apk`** — the layout and install hooks carry over, the archive
  format does not. Its bundled ACL is the pre-Safe-Apply version and must not be
  reused: without the `ubus.uci` method grants, apply/confirm/rollback are
  denied. Also `Package: luci-app-ezwrt` is misleading — this is not a LuCI app.
- **Validate the router endpoint** on save: `host[:port]` shape, trimmed inputs,
  non-empty credentials. Today anything typed is stored as-is.
- **Drop the `192.168.1.1` / `root` / `admin` defaults** in favour of empty
  fields. Better security posture, some UX cost.

### Other

- **Boot-time rollback guard**: an init script that checks for an unconfirmed
  apply on boot and restores. The only fix for the reboot hole. Deliberately
  deferred until hardware tells us where rpcd keeps its snapshot.
- Stop persisting the password: session-only, with a re-prompt on expiry.
- Per-device traffic, not just WAN totals.
- Create a guest network rather than only toggling one.
- WireGuard peer configuration (`ROADMAP.md` item 4 mentions it; only the
  interface toggle exists).

---

## Discarded

- **A shell-script rollback daemon on the router.** rpcd already implements
  apply/confirm/rollback; reimplementing it in sh would duplicate a working
  mechanism and add a stateful component that can fail on its own — a stuck
  timer reverting good config is worse than no timer. Keeps the installer
  declarative (packages, ACL, uhttpd settings, nothing running in the
  background). Revisit only for the reboot case, above.
- **Backporting rollback to the pre-`uci.apply` fallback path.** Would mean
  building backup + detached timer + confirm in sh, for routers whose rpcd
  predates 2018. Such a device would struggle to run this app anyway.
- **Wiring `npm run lint` into CI now.** It fails on `main` for pre-existing
  reasons; adding it would make CI red for something this work did not cause.
- **Auto-confirming "low risk" changes** to skip the banner. Every control here
  can strand the user — pausing a device can pause the phone you are holding —
  so there is no safe subset worth the inconsistency.

---

## History

`PROGRESS.md` is the log of an earlier session (CORS diagnosis, calendar
versioning, desktop layout). It is kept as history and is **not** current
state — several of its conclusions have since been superseded.
