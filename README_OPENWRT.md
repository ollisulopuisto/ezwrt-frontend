# EZ-WRT OpenWrt Integration

To use the EZ-WRT frontend with your OpenWrt 25 device, you need to configure `rpcd` and `uhttpd`.

## Quick Install (Recommended)

Connect to your router via SSH and run this single command:

```bash
wget -qO- https://raw.githubusercontent.com/ollisulopuisto/ezwrt-frontend/main/scripts/openwrt-install.sh | sh
```

This will automatically install the required packages, configure RPCD permissions, and restart services.

---

## Manual Setup

### 1. Install Dependencies
Ensure you have the ubus HTTP bridge installed:
```bash
apk update
apk add uhttpd uhttpd-mod-ubus rpcd
```

### 2. Configure ACL (Access Control List)
Create a new ACL file at `/usr/share/rpcd/acl.d/ezwrt.json` to grant the frontend permission to manage the router:

```json
{
  "ezwrt": {
    "description": "EZ-WRT Access",
    "read": {
      "uci": [ "wireless", "adblock", "network", "firewall", "dhcp", "sqm" ],
      "ubus": {
        "session": [ "access" ],
        "uci": [ "get", "changes" ],
        "service": [ "list" ],
        "network.interface": [ "status" ],
        "network.device": [ "status" ],
        "system": [ "info" ],
        "dhcp": [ "ipv4leases" ]
      }
    },
    "write": {
      "uci": [ "wireless", "adblock", "network", "firewall" ],
      "ubus": {
        "uci": [ "add", "set", "delete", "commit", "apply", "confirm", "rollback" ],
        "service": [ "event" ],
        "network.interface": [ "up", "down" ],
        "system": [ "reboot" ]
      }
    }
  }
}
```

### 3. Enable the ubus HTTP bridge
`ubus_cors` is required when the app is not served by the router itself (phone
app or dev machine); browsers block cross-origin ubus calls otherwise.
```bash
uci set uhttpd.main.ubus_prefix='/ubus'
uci set uhttpd.main.ubus_cors='1'
uci commit uhttpd
```

### 4. Restart Services
```bash
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

### 5. Install the frontend (optional)
The steps above prepare the router; they do not install the app. To serve it
from the router, build it on your workstation and copy it over:
```bash
npm run build
ssh root@<YOUR_ROUTER_IP> 'mkdir -p /www/ezwrt'
scp -r dist/* root@<YOUR_ROUTER_IP>:/www/ezwrt/
```
The quick installer does this for you if you point it at a tarball of `dist/`.
The archive is unpacked as root, so it must be verified first:
```bash
tar -czf ezwrt-dist.tar.gz -C dist .
sha256sum ezwrt-dist.tar.gz          # shasum -a 256 on macOS

EZWRT_DIST_URL=https://example.com/ezwrt-dist.tar.gz \
EZWRT_DIST_SHA256=<hash> sh openwrt-install.sh
```
The installer refuses to run without the hash, rejects archives containing
absolute or `..` paths, and unpacks to a staging directory so a bad archive
cannot leave `/www/ezwrt` half-written. `EZWRT_DIST_INSECURE=1` skips
verification, and says loudly that it is doing so.

### 6. Connection
Open `http://<YOUR_ROUTER_IP>/ezwrt/` (or run the app from your workstation),
then enter your router's IP and `root` credentials in the "Router Connection"
module.

## Why `sqm` is in the read list
EZ-WRT can turn on software flow offloading, which is off by default and is
often the real reason a router caps a connection below its plan. Offloaded
traffic skips the kernel's queueing, so on a router running SQM it would trade
bufferbloat control for throughput. EZ-WRT reads the `sqm` config to detect that
and refuses to enable offloading there. Read access is all it needs — it never
writes `sqm`.

If you installed EZ-WRT before this was added, re-run the installer (or add
`"sqm"` to the `read.uci` list yourself and restart rpcd). Without it the app
cannot tell whether shaping is configured, so it still offers the setting but
says it could not check.

EZ-WRT never writes `flow_offloading_hw`. Hardware offload on mt7621 and
friends has a history of wedging the datapath, and it is not something to switch
on for someone without them asking.

## Why `service: [ "event" ]` is in the ACL
`uci commit` writes `/etc/config` but changes nothing on a running system. The
owning service reloads when it receives a `config.change` event, which is what
EZ-WRT sends after every commit. Without that permission, settings appear to
save and then have no effect.


## Verifying on real hardware

Everything in EZ-WRT is currently tested against the mock server in
`mock-server/`, which models UCI semantics (staged vs committed state, `uci set`
failing on a missing section, an apply snapshot with a rollback timer). That
proves the client sends the right calls and handles the right answers — it does
**not** prove that the model matches rpcd, because both sides were written
together.

**Planned setup:** clone this repo onto the always-on Mac Studio and run the dev
server against a spare OpenWrt box on the LAN, once one is free. Until then the
list below is open.

Ranked by consequence if the assumption turns out to be wrong:

1. **`uci confirm` from a *new* session.** Safe Apply assumes rpcd's pending-apply
   state is daemon-global, so a user who is disconnected by their own change can
   reconnect, log in again, and still confirm. If it is bound to the session that
   called `uci apply`, every change that drops the connection would revert after
   90 seconds and the feature would be worse than not having it.
2. **`uci apply` picks up staged changes.** rpcd stages writes in a per-session
   savedir; EZ-WRT deliberately does not commit before applying. If apply does not
   see those changes, writes would silently do nothing.
3. **ACL completeness.** Whether the `ubus.uci` method grants plus the per-config
   `uci` grants are together sufficient for `apply`, `confirm` and `rollback`.
4. **adblock schema.** EZ-WRT writes `adb_enabled` in `config adblock 'global'`
   and reads the running state from `service list adblock`. The instance key in
   that response is a guess (`instance1` in the mock).
5. **fw4 time-based rules.** Bedtime writes `start_time`/`stop_time` on a firewall
   rule; confirm fw4 on OpenWrt 25 honours them rather than ignoring them.

### Running the checks

`scripts/verify-on-router.sh` answers questions 1-4 automatically. Run it from
your workstation, not on the router: it goes through HTTP -> uhttpd -> rpcd, so
it exercises the session and ACL layers that a local `ubus call` bypasses.

```bash
./scripts/verify-on-router.sh 192.168.1.1 root
```

It prints PASS/FAIL per check and exits non-zero if anything failed. It takes
about a minute, because two checks wait out a real rollback timer. It creates a
disabled firewall rule named `ezwrt_verify`, applies it, and deletes it again;
the rule has no src/dest and `enabled='0'`, so it never matches traffic.

Note that running it against `mock-server/` passes by construction — the mock
issues one fixed session id, so the reconnect-and-confirm check cannot fail
there. Only real hardware answers that one.

Useful commands to run on the box while checking these:

```bash
logread -f -e rpcd            # ACL denials show up here
ubus call uci apply '{"rollback":true,"timeout":90}'
ubus call uci confirm
uci show firewall | grep ezwrt   # sections EZ-WRT created
```

### Known limits of the rollback

- **It does not survive a reboot.** rpcd holds the pending-apply timer in memory,
  so a change that crashes or reboots the router is committed with nothing left
  to undo it. LuCI has the same limitation.
- **It covers UCI config only.** The `network.interface up`/`down` call made after
  a VPN change is runtime state, not config; a network reload is what brings it
  back in line.
- **Routers without `uci.apply`** fall back to a plain commit and reload. That
  path has no rollback at all, and the UI says so.
