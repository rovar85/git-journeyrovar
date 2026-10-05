---
track: windows
title: PowerShell basics: cmdlets and the object pipeline
short: PowerShell basics
sub: Verb-Noun commands, discovering what exists, and the pipeline that passes objects, not text.
---

:::goals
- explain what PowerShell is and how it differs from Bash
- find commands and their properties with `Get-Command`, `Get-Help` and `Get-Member`
- filter, sort, select and group with the pipeline
- read and format output
:::

## Why PowerShell

Enterprise Vault runs on **Windows Server**, and Windows is administered with **PowerShell**: a shell and scripting language built on .NET. The big difference from Bash: commands pass **objects** (with properties and methods) down the pipeline, not lines of text. So instead of `ps | awk '{print $3}'` you write `Get-Process | Select-Object Name, CPU` and never parse columns.

**PowerShell 7** runs on Windows, Linux and macOS, so we can run real PowerShell in this lab (in a container). Windows-only features (services, registry, event logs, Active Directory) cannot run on Linux, so those are **Example (not run here)** in lesson 4. Everything about the language is the same everywhere.

@setup pwsh

```run
cat > v.ps1 <<'EOF'
"PowerShell version: " + $PSVersionTable.PSVersion
"Edition: " + $PSVersionTable.PSEdition
EOF
pwsh -File v.ps1
```

On Windows you will also meet "Windows PowerShell 5.1" (blue console, `powershell.exe`) built into the OS, and **PowerShell 7** (`pwsh.exe`). Server 2016-2022 ship with 5.1.

## Cmdlets: Verb-Noun

Commands are **cmdlets** named `Verb-Noun`: `Get-Process`, `Set-Content`, `Remove-Item`, `Restart-Service`. The verb set is standard (`Get`, `Set`, `New`, `Remove`, `Start`, `Stop`, `Restart`, `Test`, `Invoke`...), so guessing works. Many have **aliases** (`ls`, `dir`, `cat`, `cd`, `ps`) that map to cmdlets: `ls` is `Get-ChildItem`.

```run
cat > cmds.ps1 <<'EOF'
Get-Command -Verb Get -Noun *Item* | Select-Object -ExpandProperty Name | Sort-Object
"---"
Get-Alias ls, cat, ps | Select-Object Name, Definition | Format-Table -AutoSize | Out-String -Stream | Where-Object { $_ -ne "" }
EOF
pwsh -File cmds.ps1
```

| Discover | Command |
|---|---|
| find a command | `Get-Command *service*`, `Get-Command -Verb Stop` |
| how to use it | `Get-Help Get-Process -Examples` (run `Update-Help` once on a real machine) |
| what an object contains | `... | Get-Member` |
| what are the parameters | `Get-Help Get-ChildItem -Parameter *` |

## Everything is an object

```run
cat > obj.ps1 <<'EOF'
$f = Get-Item /etc/hostname
$f.GetType().FullName
"Properties include:"
$f | Get-Member -MemberType Property | Select-Object -First 6 -ExpandProperty Name
"Name  = " + $f.Name
"Bytes = " + $f.Length
"Is it a folder? " + $f.PSIsContainer
EOF
pwsh -File obj.ps1
```

`Get-Member` is the key to the pipeline: it lists the properties and methods you can use. Because output is objects, you pick fields by **name**.

## The pipeline: Where, Select, Sort, Group, Measure

`|` sends objects from one cmdlet to the next. The workhorses:

| Cmdlet | Does | Bash cousin |
|---|---|---|
| `Where-Object` (`?`) | filter by a condition | `grep`, `awk` conditions |
| `Select-Object` | choose properties, or first/last N | `cut`, `head`, `tail` |
| `Sort-Object` | sort by a property | `sort` |
| `Group-Object` | count by a property | `sort | uniq -c` |
| `Measure-Object` | sum, average, min, max, count | `wc`, `awk` |
| `ForEach-Object` (`%`) | run code per object | `xargs`, `while read` |
| `Format-Table` / `Format-List` | display (use last; they produce formatting objects) | |

A sample EV-style log to play with:

```run
cat > indexing.log <<'EOF'
2026-09-30 09:10:02 INFO  Indexing service started
2026-09-30 09:12:18 ERROR SQL connection timeout (SQL01)
2026-09-30 09:12:19 WARN  Retrying connection, attempt 1
2026-09-30 09:12:34 ERROR SQL connection timeout (SQL01)
2026-09-30 09:12:35 ERROR Indexing task aborted
2026-09-30 11:02:10 INFO  Indexing service started
2026-09-30 11:40:22 WARN  Name resolution slow for SQL01
2026-09-30 12:15:41 ERROR Name resolution failed for SQL01
EOF
cat > pipe.ps1 <<'EOF'
$lines = Get-Content indexing.log | ForEach-Object {
    $p = $_ -split '\s+', 4
    [pscustomobject]@{ Date = $p[0]; Time = $p[1]; Level = $p[2]; Message = $p[3] }
}
"Parsed $($lines.Count) lines into objects"
""
"Errors only:"
$lines | Where-Object Level -eq 'ERROR' | Select-Object Time, Message | Format-Table -AutoSize | Out-String -Stream | Where-Object { $_ -ne "" }
""
"Count by level:"
$lines | Group-Object Level | Sort-Object Count -Descending | ForEach-Object { "{0,-6} {1}" -f $_.Name, $_.Count }
""
"Last error time: " + ($lines | Where-Object Level -eq 'ERROR' | Select-Object -Last 1).Time
EOF
pwsh -File pipe.ps1
```

Notice we turned each text line into an **object** with named properties (`[pscustomobject]`), then everything after is clean: `Where-Object Level -eq 'ERROR'`, `Group-Object Level`. This is the mindset shift from Bash.

## Comparison operators

PowerShell uses words, not symbols, for comparisons (`>` is output redirection!): `-eq -ne -gt -ge -lt -le -like -match -contains -in -and -or -not`. String comparisons are **case-insensitive** by default (`-ceq` for case-sensitive).

```run
cat > ops.ps1 <<'EOF'
5 -gt 3
"EV01" -eq "ev01"
"EV01" -ceq "ev01"
"sql01.corp.local" -like "sql*"
"sql01.corp.local" -match "^sql(\d+)\."
"Number from the match: " + $Matches[1]
1, 2, 3 -contains 2
EOF
pwsh -File ops.ps1
```

## Output formatting and getting data out

```run
cat > fmt.ps1 <<'EOF'
$svc = @(
  [pscustomobject]@{ Name = 'EVIndexing'; Status = 'Running'; Memory = 1520 },
  [pscustomobject]@{ Name = 'EVStorage';  Status = 'Stopped'; Memory = 0 },
  [pscustomobject]@{ Name = 'EVAdmin';    Status = 'Running'; Memory = 310 }
)
"--- table"
$svc | Format-Table -AutoSize | Out-String -Stream | Where-Object { $_ -ne "" }
"--- list"
$svc | Select-Object -First 1 | Format-List | Out-String -Stream | Where-Object { $_ -ne "" }
"--- JSON"
$svc | Where-Object Status -eq 'Running' | ConvertTo-Json -Compress
"--- CSV"
$svc | ConvertTo-Csv -NoTypeInformation
EOF
pwsh -File fmt.ps1
```

`ConvertTo-Json`, `ConvertTo-Csv`, `Export-Csv`, `Out-File` write data out; `ConvertFrom-Json`, `Import-Csv`, `Get-Content` read it in. **Do your filtering before formatting**, because `Format-*` cmdlets turn objects into display instructions that later cmdlets cannot use.

:::recap
- PowerShell passes objects, so you select properties by name instead of parsing text.
- Cmdlets are `Verb-Noun`; discover with `Get-Command`, `Get-Help`, `Get-Member`.
- `Where-Object`, `Select-Object`, `Sort-Object`, `Group-Object`, `Measure-Object`, `ForEach-Object` do most pipeline work.
- Comparison operators are words (`-eq`, `-like`, `-match`); format last.
:::

:::try Your turn
Using the sample log, output the number of WARN lines and the time of the first ERROR.
:::

:::quiz
? What is the main difference between a PowerShell and a Bash pipeline?
+ PowerShell passes objects with properties; Bash passes text
- PowerShell has no pipeline
- Bash passes objects
- They are identical
! No more column parsing.
? Which cmdlet shows an object's properties and methods?
+ `Get-Member`
- `Get-Help`
- `Get-Alias`
- `Select-Object`
! Pipe any object into it.
? How do you test "equal" in PowerShell?
+ `-eq`
- `==`
- `=`
- `equals`
! `>` and `<` redirect output, so words are used.
:::
