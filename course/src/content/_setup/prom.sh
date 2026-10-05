# Helpers for the monitoring lessons. Prometheus runs in Docker on 127.0.0.1:9090 (started by the lesson).
PROM=http://127.0.0.1:9090
# promq 'expr'  -> prints "labels value" lines for an instant query
promq() { curl -s --data-urlencode "query=$1" $PROM/api/v1/query | python3 -c '
import sys, json
d = json.load(sys.stdin)
if d["status"] != "success": print("error:", d.get("error")); sys.exit()
for r in d["data"]["result"]:
    lab = ",".join(f"{k}={v}" for k, v in sorted(r["metric"].items()) if k not in ("__name__","instance","job"))
    print((lab or "(no labels)") + "  " + str(round(float(r["value"][1]), 2)))
'; }
cd ~/lab
