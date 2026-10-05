# A small pretend Enterprise Vault server tree, with fixed timestamps so listings never change.
mkdir -p ev/logs ev/config ev/archive ev/scripts docs
cat > ev/logs/indexing.log <<'LOG'
2026-09-30 09:10:02 INFO  Indexing service started
2026-09-30 09:10:05 INFO  Connected to SQL01
2026-09-30 09:11:40 INFO  Indexed 1200 items
2026-09-30 09:12:18 ERROR SQL connection timeout (SQL01)
2026-09-30 09:12:19 WARN  Retrying connection, attempt 1
2026-09-30 09:12:34 ERROR SQL connection timeout (SQL01)
2026-09-30 09:12:35 ERROR Indexing task aborted
2026-09-30 09:13:01 INFO  Indexing service stopped
2026-09-30 11:02:10 INFO  Indexing service started
2026-09-30 11:02:14 INFO  Connected to SQL01
2026-09-30 11:05:00 INFO  Indexed 3400 items
2026-09-30 11:40:22 WARN  Name resolution slow for SQL01
2026-09-30 12:15:41 ERROR Name resolution failed for SQL01
2026-09-30 12:15:42 ERROR Indexing task aborted
LOG
cat > ev/logs/storage.log <<'LOG'
2026-09-30 09:00:00 INFO  Storage service started
2026-09-30 09:30:10 INFO  Archived 540 items to vault store 1
2026-09-30 10:15:44 WARN  Vault store 1 is 91 percent full
2026-09-30 10:50:03 INFO  Archived 610 items to vault store 1
2026-09-30 11:20:09 ERROR Vault store 1 write failed: disk full
LOG
cat > ev/config/evault.conf <<'CONF'
# Enterprise Vault server settings (pretend)
server_name = EV01
sql_server = SQL01
indexing_enabled = true
max_index_threads = 4
log_level = info
CONF
cat > ev/scripts/check.sh <<'SH'
#!/bin/bash
echo "checking EV01"
SH
echo "Welcome to the EV01 lab" > docs/readme.txt
echo "Run the checks every morning." > docs/notes.txt
touch -d "2026-01-15 09:00" ev/logs/indexing.log ev/logs/storage.log ev/config/evault.conf ev/scripts/check.sh docs/readme.txt docs/notes.txt
touch -d "2026-01-15 09:00" ev ev/logs ev/config ev/archive ev/scripts docs
