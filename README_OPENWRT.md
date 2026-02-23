# EZ-WRT OpenWrt Integration

To use the EZ-WRT frontend with your OpenWrt 25 device, you need to configure `rpcd` and `uhttpd`.

## 1. Install Dependencies
Ensure you have the ubus HTTP bridge installed:
```bash
apk add uhttpd uhttpd-mod-ubus rpcd
```

## 2. Configure ACL (Access Control List)
Create a new ACL file at `/usr/share/rpcd/acl.d/ezwrt.json` to grant the frontend permission to manage WiFi and Adblock.

```json
{
  "ezwrt": {
    "description": "EZ-WRT Frontend Access",
    "read": {
      "uci": [ "wireless", "adblock" ],
      "ubus": {
        "service": [ "list" ],
        "network.wireless": [ "status" ]
      }
    },
    "write": {
      "uci": [ "wireless", "adblock" ]
    }
  }
}
```

## 3. Restart Services
Restart `rpcd` and `uhttpd` to apply the changes:
```bash
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

## 4. Connection
The frontend will connect to `http://<YOUR_ROUTER_IP>/ubus` using JSON-RPC. Ensure you have set the correct IP in the `UbusClient.ts` or through the UI configuration (if implemented).
