---
track: windows
title: Files, text and data with PowerShell
short: Files and data
sub: Navigate folders, search text, read CSV and JSON, and report on log files.
---

:::goals
- list, copy, move and delete files safely (`-WhatIf`)
- search text with `Select-String`
- read and write CSV and JSON
- build a small log report
:::

@setup pwsh

## Files and folders

| Task | PowerShell | Bash |
|---|---|---|
| list | `Get-ChildItem` (`ls`, `dir`) | `ls` |
| change folder | `Set-Location` (`cd`) | `cd` |
| read a file | `Get-Content` (`cat`) | `cat` |
| write a file | `Set-Content`, `Add-Content`, `Out-File` | `>` `>>` |
| copy / move | `Copy-Item`, `Move-Item` | `cp` `mv` |
| delete | `Remove-Item` | `rm` |
| create | `New-Item -ItemType Directory` | `mkdir`, `touch` |
| exists? | `Test-Path` | `[ -e ]` |

```run
cat > files.ps1 <<'EOF'
New-Item -ItemType Directory -Path ev/logs, ev/archive -Force | Out-Null
1..3 | ForEach-Object { Set-Content -Path "ev/logs/index-$_.log" -Value ("line " * $_) }
Set-Content ev/logs/notes.txt "notes"
"Log files:"
Get-ChildItem ev/logs -Filter *.log | Select-Object Name, Length | Format-Table -AutoSize | Out-String -Stream | Where-Object { $_ -ne "" }
"Recursive count: " + (Get-ChildItem ev -Recurse -File).Count
"Exists? " + (Test-Path ev/logs/notes.txt)
EOF
pwsh -File files.ps1
```

### Safe by design: -WhatIf and -Confirm

Destructive cmdlets support **`-WhatIf`** (show what would happen, change nothing) and **`-Confirm`** (ask first). Always rehearse before deleting:

```run
cat > whatif.ps1 <<'EOF'
Get-ChildItem ev/logs -Filter *.log | Remove-Item -WhatIf
""
"Files still there: " + (Get-ChildItem ev/logs -Filter *.log).Count
Get-ChildItem ev/logs -Filter index-1.log | Move-Item -Destination ev/archive
"After moving one file to archive: logs=" + (Get-ChildItem ev/logs -Filter *.log).Count + " archive=" + (Get-ChildItem ev/archive).Count
EOF
pwsh -File whatif.ps1
```

## Searching text: Select-String

`Select-String` is PowerShell's `grep`: it searches files (or piped text) with regular expressions and returns match **objects** with file name, line number and text.

```run
cat > ev/logs/indexing.log <<'EOF'
2026-09-30 09:10:02 INFO  Indexing service started
2026-09-30 09:12:18 ERROR SQL connection timeout (SQL01)
2026-09-30 09:12:35 ERROR Indexing task aborted
2026-09-30 11:40:22 WARN  Name resolution slow for SQL01
2026-09-30 12:15:41 ERROR Name resolution failed for SQL01
EOF
cat > grep.ps1 <<'EOF'
Select-String -Path ev/logs/indexing.log -Pattern 'ERROR' | ForEach-Object { "{0}: {1}" -f $_.LineNumber, $_.Line.Trim() }
""
"Count of SQL01 mentions: " + (Select-String -Path ev/logs/*.log -Pattern 'SQL01').Count
"Lines NOT containing INFO: " + (Get-Content ev/logs/indexing.log | Where-Object { $_ -notmatch 'INFO' }).Count
EOF
pwsh -File grep.ps1
```

## CSV and JSON

Structured files become objects automatically:

```run
cat > servers.csv <<'EOF'
Name,Role,Site,MemoryGB
EV01,Indexing,London,64
EV02,Storage,London,32
SQL01,Database,London,128
EV03,Indexing,Leeds,64
EOF
cat > csv.ps1 <<'EOF'
$servers = Import-Csv servers.csv
"Servers: " + $servers.Count
"Total memory GB: " + ($servers | Measure-Object -Property MemoryGB -Sum).Sum
"By site:"
$servers | Group-Object Site | ForEach-Object { "  {0}: {1}" -f $_.Name, ($_.Group.Name -join ", ") }
""
"As JSON:"
$servers | Where-Object Role -eq 'Indexing' | Select-Object Name, Site | ConvertTo-Json -Compress
""
$cfg = '{"server":"EV01","retries":3,"paths":["D:\\Index","E:\\Store"]}' | ConvertFrom-Json
"retries is a " + $cfg.retries.GetType().Name + ", first path: " + $cfg.paths[0]
$cfg.retries = 5
$cfg | ConvertTo-Json -Compress
EOF
pwsh -File csv.ps1
```

CSV and JSON are how scripts exchange data with spreadsheets, APIs, Ansible and Terraform. `Invoke-RestMethod` calls REST APIs and returns objects directly (for example Kubernetes, Jenkins or cloud APIs).

## A small report

```run
cat > report.ps1 <<'EOF'
$rows = Get-Content ev/logs/indexing.log | ForEach-Object {
    if ($_ -match '^(?<date>\S+) (?<time>\S+) (?<level>\w+)\s+(?<msg>.*)$') {
        [pscustomobject]@{ Hour = $Matches.time.Substring(0,2); Level = $Matches.level; Message = $Matches.msg }
    }
}
$summary = $rows | Group-Object Level | Select-Object @{n='Level';e={$_.Name}}, Count
$summary | Sort-Object Count -Descending | Format-Table -AutoSize | Out-String -Stream | Where-Object { $_ -ne "" }
$errorsByHour = $rows | Where-Object Level -eq 'ERROR' | Group-Object Hour
"Errors by hour: " + (($errorsByHour | ForEach-Object { "$($_.Name):00 -> $($_.Count)" }) -join ", ")
$summary | Export-Csv report.csv -NoTypeInformation
"Wrote report.csv with " + (Import-Csv report.csv).Count + " rows"
EOF
pwsh -File report.ps1
```

The same analysis you did with `grep | sort | uniq -c` in the Linux track, but with named fields. `Select-Object @{n=...;e={...}}` creates a **calculated property**.

## Paths and encodings (Windows habits)

- Paths use `\` on Windows (`D:\Index`); PowerShell also accepts `/`. Use `Join-Path` to build paths portably.
- Drives are **providers**: `HKLM:\SOFTWARE` is the registry, `Cert:\` the certificate store, `Env:` environment variables, as if they were folders.
- Be explicit about text encoding (`-Encoding utf8`) when exchanging files with other systems.

<!-- deeper -->
## A worked solution and common mistakes

```run
cat > servers1.csv <<'EOF2'
Name,MemoryGB,Role
EV02,64,Indexer
SQL01,128,Database
EV01,64,Indexer
WEB01,16,Web
EOF2
cat > ans2.ps1 <<'EOF2'
$big = Import-Csv servers1.csv |
    Where-Object { [int]$_.MemoryGB -ge 64 } |
    Sort-Object Name
$big | ForEach-Object { "$($_.Name) $($_.MemoryGB) GB" }
$big | ConvertTo-Json | Set-Content big1.json
"json bytes: " + (Get-Item big1.json).Length
EOF2
pwsh -File ans2.ps1
```

Note the cast `[int]`: `Import-Csv` returns every column as text, so without the cast `"128"` would sort and compare as a string (and `"16" -ge 64` could misbehave).

:::warn Common mistakes
- **Comparing text as numbers** after `Import-Csv`.
- **Forgetting `-Encoding`** for files that other tools read, or using `>` which may change encoding between versions.
- **Hard-coding paths** with `C:\Users\you\...` instead of `$PSScriptRoot` or parameters.
- **`Remove-Item -Recurse` without `-WhatIf` first.**
:::
<!-- /deeper -->

:::recap
- `Get-ChildItem`, `Get-Content`, `Set-Content`, `Copy-Item`, `Move-Item`, `Remove-Item`, `Test-Path`.
- Use `-WhatIf` before destructive commands.
- `Select-String` searches text; `Import-Csv`/`ConvertFrom-Json` produce objects; `Export-Csv`/`ConvertTo-Json` write them.
- Regex named groups plus `[pscustomobject]` turn log lines into data you can group and measure.
:::

:::try Your turn
Using `servers.csv`, list servers with at least 64 GB memory sorted by name, and export them to `big.json`.
:::

:::quiz
? What does `-WhatIf` do?
+ Shows what would happen without making changes
- Asks a question
- Forces the action
- Logs to the event log
! Use it before `Remove-Item` and similar.
? Which cmdlet is PowerShell's grep?
+ `Select-String`
- `Select-Object`
- `Get-Content`
- `Find-Item`
! It returns match objects.
? What does `Import-Csv` return?
+ Objects, one per row, with column names as properties
- A single string
- A file handle
- Nothing
! No manual parsing.
:::
