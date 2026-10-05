# Two real SSH servers (as the unprivileged lab user) on 127.0.0.1:2222 and :2223, key login only.
pkill -u "$(id -u)" -f "[s]shlab/sshd_" 2>/dev/null
mkdir -p ~/sshlab && cd ~/sshlab
[ -f client_key ] || ssh-keygen -q -t ed25519 -N "" -f client_key -C lab-client
for h in 1 2; do
  [ -f hostkey$h ] || ssh-keygen -q -t ed25519 -N "" -f hostkey$h
  printf 'Port %s\nListenAddress 127.0.0.1\nHostKey %s/sshlab/hostkey%s\nAuthorizedKeysFile %s/sshlab/client_key.pub\nPidFile %s/sshlab/sshd%s.pid\nUsePAM no\nPasswordAuthentication no\nStrictModes no\nSubsystem sftp /usr/lib/openssh/sftp-server\n' \
    $((2221+h)) "$HOME" $h "$HOME" "$HOME" $h > sshd_$h.conf
  /usr/sbin/sshd -f "$HOME/sshlab/sshd_$h.conf" -E "$HOME/sshlab/sshd$h.log"
done
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat > ~/.ssh/config <<'CFG'
Host ev01
    HostName 127.0.0.1
    Port 2222
    User student
    IdentityFile ~/sshlab/client_key
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    LogLevel ERROR
Host sql01
    HostName 127.0.0.1
    Port 2223
    User student
    IdentityFile ~/sshlab/client_key
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    LogLevel ERROR
CFG
chmod 600 ~/.ssh/config
sleep 1
cd ~/lab
