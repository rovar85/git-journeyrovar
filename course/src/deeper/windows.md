=== windows/01
## A worked solution and common mistakes

```run
cat > log1.txt <<'EOF2'
2025-03-01 09:00:01 INFO Indexer started
2025-03-01 09:05:12 WARN Queue length 900
2025-03-01 09:07:40 ERROR Disk full on E:
2025-03-01 09:08:00 WARN Retrying
EOF2
cat > ans1.ps1 <<'EOF2'
$lines = Get-Content log1.txt
"WARN lines: " + ($lines | Where-Object { $_ -match ' WARN ' }).Count
$first = $lines | Where-Object { $_ -match ' ERROR ' } | Select-Object -First 1
"First ERROR at: " + ($first -split ' ')[1]
EOF2
pwsh -File ans1.ps1
```

`Where-Object` filters objects flowing through the pipeline, `-match` tests text with a regular expression, and `Select-Object -First 1` stops after the first hit.

:::warn Common mistakes
- **Treating output as text.** Commands return objects; use `Select-Object`, `Where-Object` and properties instead of cutting strings.
- **Using `Format-Table` in the middle of a pipeline.** Formatting commands produce display objects; put them last.
- **Not using `Get-Help` and `Get-Member`** to discover what a command accepts and returns.
- **Forgetting that `-eq`, `-like`, `-match` are operators, not `==`.**
:::

=== windows/02
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

=== windows/03
## A worked solution and common mistakes

```run
cat > log3.txt <<'EOF2'
2025-03-01 09:00:01 INFO ok
2025-03-01 09:05:12 WARN slow
2025-03-01 09:07:40 ERROR boom
2025-03-01 09:09:00 ERROR again
EOF2
cat > ans3.ps1 <<'EOF2'
function Get-LogSummary {
    [CmdletBinding()]
    param([Parameter(Mandatory)][ValidateScript({ Test-Path $_ })][string]$Path)
    $lines = Get-Content $Path
    $first = $lines | Where-Object { $_ -match ' ERROR ' } | Select-Object -First 1
    [pscustomobject]@{
        Errors     = @($lines | Where-Object { $_ -match ' ERROR ' }).Count
        Warnings   = @($lines | Where-Object { $_ -match ' WARN ' }).Count
        FirstError = if ($first) { ($first -split ' ')[1] } else { $null }
    }
}
Get-LogSummary -Path log3.txt | Format-List
try { Get-LogSummary -Path nothere.txt } catch { "caught: file validation failed" }
EOF2
pwsh -File ans3.ps1 2>&1 | head -12
```

`ValidateScript` rejects a bad path **before** the function body runs, and returning a `[pscustomobject]` gives callers properties they can sort, filter or export.

:::warn Common mistakes
- **Returning formatted text** instead of objects, so nothing downstream can use the result.
- **Relying on errors being caught without `-ErrorAction Stop`.** Many cmdlet errors are non-terminating and `try/catch` ignores them.
- **Scripts that exit 0 even on failure,** so Jenkins or Task Scheduler thinks they succeeded. Set an explicit `exit 1`.
- **Writing everything in one huge script** instead of small functions and a module with Pester tests.
:::

=== windows/04
## Answer and common mistakes

The exercise needs a real Windows Server, so here is the **shape** of a good answer (Example, not run here):

```powershell
$problems = @()
$problems += Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' } |
    ForEach-Object { "Service stopped: $($_.Name)" }
$problems += Get-Volume | Where-Object { $_.DriveLetter -and ($_.SizeRemaining / $_.Size) -lt 0.20 } |
    ForEach-Object { "Low disk: $($_.DriveLetter): $([int](100*$_.SizeRemaining/$_.Size))% free" }
$problems += Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.NotAfter -lt (Get-Date).AddDays(60) } |
    ForEach-Object { "Certificate expires soon: $($_.Subject)" }
$problems
if ($problems.Count -gt 0) { exit 1 } else { exit 0 }
```

The non-zero exit lets Task Scheduler, Jenkins or a monitoring agent treat the script as a health check.

:::warn Common mistakes
- **Changing production services interactively** with no record. Script it and keep the script in Git.
- **Opening remoting to everyone.** Limit PowerShell remoting by firewall and group membership.
- **Storing passwords in scripts.** Use the credential store, a vault or managed identities.
- **No `-WhatIf` / `-Confirm` rehearsal** for destructive commands.
:::
