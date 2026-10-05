# A real Jenkins controller (core only, no plugins) in Docker on 127.0.0.1:8085. Security is off: lab use on loopback only.
if ! docker ps --format '{{.Names}}' | grep -qx jenkins; then
  docker rm -f jenkins > /dev/null 2>&1
  docker run -d --name jenkins -p 127.0.0.1:8085:8080 -e JAVA_OPTS="-Djenkins.install.runSetupWizard=false" jenkins/jenkins:lts-jdk17 > /dev/null
fi
for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8085/login 2>/dev/null | grep -q 200 && break; sleep 2; done
JENKINS=http://127.0.0.1:8085
# helpers used by the lessons
JAR=~/.jenkins-cookies
# Jenkins ties a CSRF crumb to a web session, so keep a cookie jar. jcurl = curl with crumb + cookie for POSTs.
jcurl() { local c; c=$(curl -s -c $JAR "$JENKINS/crumbIssuer/api/json" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["crumbRequestField"]+":"+d["crumb"])'); curl -s -b $JAR -H "$c" "$@"; }
jpost() { jcurl -o /dev/null -w "%{http_code}\n" -X POST "$@"; }
jwait() { for i in $(seq 1 60); do r=$(curl -s "$JENKINS/job/$1/lastBuild/api/json?tree=building,result" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("building" if d["building"] else d["result"])' 2>/dev/null); [ -n "$r" ] && [ "$r" != "building" ] && { echo "$r"; return; }; sleep 1; done; echo timeout; }
cd ~/lab
