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
| Tarball install verified by SHA-256, rejects path traversal, stages before swapping | Verified | `scripts/test-openwrt-install.sh`, run in CI — the archive is unpacked as root |
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

## Field evidence from a real router (external, 2026-08-23)

Measurements from a **different** project — a long debugging session on a used
Netgear R6850 (ramips/mt7621, mipsel_24kc, 4 threads @ 880 MHz, 128 MB RAM,
16 MB ubifs overlay, OpenWrt 25.12.5, CGNAT mobile uplink). Relayed by Olli.

This is real hardware, but **it is not EZ-WRT verification**: none of it exercised
this app, and it closes none of the open questions above. What it does give us is
a concrete profile of the machine EZ-WRT is meant to run on, and several findings
that change what the UI should do.

### Directly relevant to code we already have

- **Our device-side script surface is busybox-safe.** `openwrt-install.sh` uses
  only `apk awk cat cp echo grep id mkdir mktemp printf rm sh tar tr trap uci
  wget` plus the sha256 fallbacks. Checked against the report's list of gaps on a
  real image — no `nohup`, `diff`, `paste`, `getconf`, `nc -z`, `ip -s`. The
  `nohup` one is the dangerous gap: `nohup … &` fails with "not found" and the
  backgrounded command **silently never runs**, so a fix appears to succeed.
  `setsid sh -c "…" &` works where `nohup` does not. Keep new device-side code
  inside this set.
- **We have no ping-based connectivity check, which is the correct accident.**
  On a CGNAT link ICMP is dropped *and* `1.1.1.1` is unreachable on every port,
  so `ping` fails on a perfectly healthy connection; meanwhile `nslookup`
  succeeded from dnsmasq's cache while the WAN was genuinely down. Neither
  proves anything. If we ever add an internet-status indicator it must be a real
  TCP/HTTPS fetch (`wget -O/dev/null -T8 -t1 https://www.google.com/`), and
  `ping: sendto: Network unreachable` (no default route) must be distinguished
  from a timeout (filtered). Never show ping results to a non-expert as
  "internet status".
- **CPU saturation looks exactly like ISP latency.** A pegged router added
  ~150 ms of queueing delay to traffic it merely *forwarded*: 174–274 ms under
  load versus 32 ms idle on the same path. Anyone reading a latency graph without
  CPU next to it will blame their ISP for a CPU problem — worth remembering for
  TODO 3 below.

### The tuning win worth a feature

`firewall.@defaults[0].flow_offloading` was **unset**, which is the default. A/B
measured with a 100 MB pull while sampling `/proc/stat`:

| | CPU | softirq | throughput | CPU per 100 Mbit |
| --- | --- | --- | --- | --- |
| offload on | 32.8% | 3.2% | 258 Mbit/s | 11.31% |
| offload off | 45.4% | 7.3% | 202 Mbit/s | 16.31% |

−31% CPU per unit of traffic and +27% throughput from one setting. The box capped
at exactly 202 Mbit/s, which is what speedtest had reported for months — the user
believed that was their ISP's ceiling. **It was the router.**

Two caveats that belong in the UI rather than hidden, if we build this:

- Offloaded flows bypass netfilter, so per-device accounting (nlbwmon) silently
  undercounts afterwards. That interacts with "per-device traffic" in Ideas.
- `flow_offloading_hw` on MT7621 has a bad history. Do **not** offer the hardware
  variant as casually as the software one.

### Bearing on the WireGuard roadmap item

- **Userspace WireGuard is expensive on this class of hardware.** tailscaled
  carried 0.8% of the router's bytes while taking ~72% of CPU in a bad period.
  The cost was not crypto but NAT churn: in 35 minutes, 21 endpoint changes, 4
  DERP home changes, 4 netmap updates, and symmetric NAT (`varies=true`) from a
  rotating CGNAT address. That work is **traffic-independent**, so reducing
  traffic does not reduce it. Kernel WireGuard to a fixed endpoint has none of
  it — which supports ROADMAP item 4 as specified.
- **A VPN footgun a UI could refuse outright.** A node that *advertises* a subnet
  while also *accepting* routes will accept its own LAN back over the tunnel and
  install it ahead of the real interface. Inbound packets arrive; replies go into
  the tunnel. If the peer holding that route is offline it is a silent black
  hole — the router looks dead while being perfectly healthy, and LAN clients
  lose internet through misrouted return traffic. The nuance: accept-routes is
  not itself the bug, and the *sole* advertiser of a subnet can safely accept
  routes. **Mutual advertisement is the bug**, and it is detectable in one check.

### Memory and logging on a 128 MB box

- **Go daemons must be measured, never preset.** With `GODEBUG=gctrace=1`,
  tailscaled's live heap was ~45 MB and default GOGC targeted a 99 MB heap on a
  118 MB box. The advice circulating for small routers — `GOGC=20`,
  `GOMEMLIMIT=32MiB` — is actively harmful, because 32 MiB sits *below* the live
  heap: the limit is never reached, GC runs forever, and each mark cycle faults
  swapped pages back off USB, causing the very swap storm it was meant to
  prevent. `GOMEMLIMIT` is a soft limit and must sit comfortably **above** live
  heap. Settled on `GOGC=50` + `GOMEMLIMIT=64MiB`.
- **zram beats a USB swapfile.** kmod-zram + zram-swap (57 MiB, lzo-rle) at
  priority 100 compressed 3:1 and left the demoted USB swapfile at 0 bytes used
  indefinitely — the hard-to-recover USB stall risk is retired without losing the
  fallback. With `vm.swappiness=100`, `vm.page-cluster=0` (zram is random-access,
  so reading 8 pages per fault is waste), `vm.watermark_scale_factor=125`.
- **`logread` is a RAM ring buffer, and the first crash left zero evidence.** Two
  traps: `log_size` doubles as the ring buffer size unless `log_buffer_size` is
  set separately, so naively raising it to get file history grows logd's RAM by
  the same amount — backwards on 128 MB. And `logread --help` documents `-S` as
  bytes when it is **KiB**, verified empirically; setting 32768 on the printed
  meaning gives a 32 KB log that rotates hourly and looks fine until you need it.
  Working config: `log_buffer_size=64`, `log_size=32768`,
  `log_file=/mnt/usb/log/messages`. ~50 KB/h, so a few MB covers weeks.

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
   climbs. Should be a delta between polls. When it becomes a real graph, put
   **CPU load next to it** — a saturated router adds ~150 ms of queueing delay
   to traffic it only forwards, and users read that as an ISP fault.
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

- **One-tap "speed up my old router"**: detect that
  `firewall.@defaults[0].flow_offloading` is unset and offer to enable it. On the
  R6850 above this was +27% throughput and −31% CPU per Mbit from a single
  setting, and it was mistaken for an ISP cap for months. Highest measured
  value-per-click found so far for used hardware. Must say that offloaded flows
  bypass netfilter (per-device accounting undercounts afterwards), and must not
  offer `flow_offloading_hw` on MT7621 with the same confidence.
- **Refuse mutual subnet advertisement** if VPN routing is ever managed here:
  advertising a subnet while also accepting routes installs your own LAN back
  over the tunnel and silently black-holes replies. One check catches it.
- **Honest internet-status indicator** — TCP/HTTPS, never ping, and it must tell
  "no default route" apart from "filtered". See field evidence above.
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
