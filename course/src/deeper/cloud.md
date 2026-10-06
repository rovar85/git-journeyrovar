=== cloud/01
## A worked solution and common mistakes

```run
python3 - <<'PY'
lb = 0.9999
app_each = 0.995
db = 0.9995
app_pair = 1 - (1 - app_each) ** 2     # parallel: both must fail
total = lb * app_pair * db             # series: all layers needed
print(f"two app servers together: {app_pair*100:.4f}%")
print(f"whole service:            {total*100:.4f}%")
print("meets 99.95%?", total >= 0.9995)
minutes = (1 - total) * 365 * 24 * 60
print(f"expected downtime: {minutes:.0f} minutes a year")
PY
```

The two app servers together are very reliable (parallel parts multiply their *failure* chances), but the service is a **chain**: its availability is the product of every layer, so it ends up **below** its weakest component, the database. To reach 99.95% you must improve the database layer (for example a managed multi-zone database), not add a third app server.

:::warn Common mistakes
- **Believing "two servers" means the service is highly available** when a single database, load balancer or DNS record is still a single point of failure.
- **Confusing a provider's SLA with your design's availability.** The SLA is per service; you combine them.
- **Ignoring the shared responsibility model:** the provider secures the cloud, you secure what you put in it.
- **Treating the cloud like a bigger datacentre** instead of using managed services and automation.
:::

=== cloud/02
## A worked solution and common mistakes

```run
python3 - <<'PY'
import ipaddress
vpc = ipaddress.ip_network("10.10.0.0/16")
subnets = list(vpc.subnets(new_prefix=24))
tiers = ["web", "app", "sql", "backup"]
zones = ["a", "b", "c"]
used = len(tiers) * len(zones)
print("total /24 subnets in the /16:", len(subnets))
print("used by 4 tiers x 3 zones:    ", used)
print("left for growth:              ", len(subnets) - used)
i = 0
for t in tiers:
    for z in zones:
        print(f"  {t:7s} zone-{z}  {subnets[i]}")
        i += 1
PY
```

A /16 holds 256 /24 networks. Twelve are used, so 244 remain. In practice cloud providers reserve a few addresses per subnet (AWS keeps 5), so a /24 gives about 251 usable hosts.

:::warn Common mistakes
- **Overlapping CIDR ranges** with the corporate network or another VPC, which makes peering and VPN impossible later.
- **Choosing a tiny VPC** that cannot grow. Resizing is painful; plan big.
- **Wide-open security groups** (`0.0.0.0/0` on SQL or RDP).
- **Long-lived access keys and admin rights for everyone** instead of roles with least privilege.
:::

=== cloud/03
## A worked answer and common mistakes

One reasonable answer for EV's SQL database:

| Item | Choice | Why |
|---|---|---|
| **RPO** | 15 minutes | archive metadata loss beyond that is unacceptable |
| **RTO** | 4 hours | the business can live without search for half a day |
| **DR pattern** | warm standby in a second region | cheaper than active/active, faster than rebuilding |
| **Backup method** | full nightly plus transaction-log backups every 15 minutes, copied to another region | log backups give the 15 minute RPO |
| **Restore test** | automated quarterly: restore to a scratch server, run checks, record the time | proves the RTO |

:::warn Common mistakes
- **Backups that were never restored.** An untested backup is a hope, not a backup.
- **Backups in the same account and region as the data,** lost together in one incident.
- **No cost visibility:** missing tags and budget alerts.
- **Lift and shift without checking licences, latency to users and the egress cost** of moving data out.
:::
