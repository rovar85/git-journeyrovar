---
track: windows
title: PowerShell scripting: variables, functions, errors and modules
short: Scripting
sub: Write reusable, safe scripts with parameters, functions, error handling and tests.
---

:::goals
- use variables, arrays, hashtables and control flow
- write functions with typed parameters and validation
- handle errors with `try/catch` and `-ErrorAction`
- understand advanced functions, modules and testing
:::

@setup pwsh

## Variables, arrays, hashtables

```run
cat > basics.ps1 <<'EOF'
$name = "EV01"                         # string
$retries = 3                           # int
$servers = @("EV01", "EV02", "SQL01")  # array
$limits = @{ Memory = 64; Disk = 500 } # hashtable (dictionary)

"Server $name will retry $retries times"          # double quotes expand variables
'Single quotes do not expand: $name'
"Second server: $($servers[1]), count: $($servers.Count)"   # $( ) runs an expression
"Memory limit: $($limits.Memory) GB"
$limits.Network = 10
"Keys: " + ($limits.Keys | Sort-Object) -join ", "

foreach ($s in $servers) {
    if ($s -like "SQL*") { "$s is a database server" }
    elseif ($s -eq "EV01") { "$s is the primary indexer" }
    else { "$s is a secondary" }
}
for ($i = 1; $i -le 3; $i++) { "attempt $i" }
$n = 3; while ($n -gt 0) { "countdown $n"; $n-- }
switch ("EV02") { "EV01" { "one" } "EV02" { "two" } default { "other" } }
EOF
pwsh -File basics.ps1
```

Variables start with `$` and are **dynamically typed** (add a type like `[int]$retries` to enforce one). Arrays are `@( )`, hashtables `@{ }`. `$_` (or `$PSItem`) is the current pipeline object.

## Functions with parameters

```run
cat > func.ps1 <<'EOF'
function Test-DiskSpace {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Server,

        [ValidateRange(1, 100)]
        [int]$WarnPercent = 80,

        [int]$UsedPercent = 50
    )
    if ($UsedPercent -ge $WarnPercent) {
        [pscustomobject]@{ Server = $Server; Status = 'WARN'; Used = $UsedPercent }
    } else {
        [pscustomobject]@{ Server = $Server; Status = 'OK'; Used = $UsedPercent }
    }
}

Test-DiskSpace -Server EV01 -UsedPercent 91 | ConvertTo-Json -Compress
Test-DiskSpace -Server EV02 -UsedPercent 40 -WarnPercent 60 | ConvertTo-Json -Compress
"--- validation rejects a bad value:"
try { Test-DiskSpace -Server EV03 -WarnPercent 500 } catch { $_.Exception.Message -replace '\r?\n',' ' | ForEach-Object { $_.Substring(0, [Math]::Min(110, $_.Length)) } }
"--- pipeline into a function:"
"EV01","EV02" | ForEach-Object { Test-DiskSpace -Server $_ -UsedPercent 85 } | ForEach-Object { "$($_.Server) $($_.Status)" }
EOF
pwsh -File func.ps1
```

`[CmdletBinding()]` turns a function into an **advanced function** that behaves like a real cmdlet (common parameters like `-Verbose`, `-ErrorAction`, `-WhatIf` support). **Return objects**, not formatted text, so other commands can use them. `[Parameter(Mandatory)]`, `[Validate*]` attributes check input for you.

## Errors

PowerShell has two kinds of error: **terminating** (stops the pipeline unless caught) and **non-terminating** (reports and continues). Most cmdlet errors are non-terminating by default, which surprises people. To make a failure catchable, ask for `-ErrorAction Stop`:

```run
cat > err.ps1 <<'EOF'
"--- without Stop: the error is printed but the script goes on"
Get-Item /no/such/file -ErrorAction SilentlyContinue
"script continues (last command success flag: $?)"

"--- with Stop inside try/catch:"
try {
    Get-Content /no/such/file -ErrorAction Stop
    "never printed"
}
catch [System.Management.Automation.ItemNotFoundException] {
    "caught: file not found -> " + $_.Exception.Message
}
catch {
    "caught something else: " + $_.Exception.Message
}
finally {
    "finally always runs (cleanup goes here)"
}

"--- set it for the whole script:"
$ErrorActionPreference = 'Stop'
try { 1 / 0 } catch { "caught: " + $_.Exception.InnerException.Message }
EOF
pwsh -File err.ps1
```

Best practices: put `$ErrorActionPreference = 'Stop'` near the top of scripts that must not continue after failure (like `set -e` in Bash), use `try/catch/finally`, log the error and the **context** (server name, item), and exit with a non-zero code for automation (`exit 1`).

```run
cat > exit.ps1 <<'EOF'
$ErrorActionPreference = 'Stop'
try {
    $count = (Select-String -Path ev/logs/missing.log -Pattern ERROR).Count
}
catch {
    Write-Error "Check failed: $($_.Exception.Message)" -ErrorAction Continue
    exit 2
}
EOF
pwsh -File exit.ps1 2>&1 | head -2 | cut -c1-80; echo "exit code seen by the caller (Jenkins, Ansible, cron): ${PIPESTATUS[0]}"
```

## Output streams and logging

`Write-Output` (the pipeline, return values), `Write-Host` (screen only, not capturable), `Write-Verbose`, `Write-Warning`, `Write-Error`, `Write-Debug`. In scripts, emit **objects** to the pipeline and use `Write-Verbose` for chatter, so callers choose how much to see. Use `Start-Transcript` to record a whole session.

## Modules and testing

A **module** (`.psm1` file or a folder with a manifest `.psd1`) packages functions for reuse; install community modules with `Install-Module` from the **PowerShell Gallery**; load with `Import-Module`. Useful modules for this course's world: `ActiveDirectory`, `SqlServer`, `Pester` (testing), `PSScriptAnalyzer` (linting), `Az` (Azure), `AWSPowerShell`, and `PSDesiredStateConfiguration`.

**Pester** is the testing framework:

```powershell:Test-DiskSpace.Tests.ps1 (Example, not run here)
Describe 'Test-DiskSpace' {
    It 'warns at or above the threshold' {
        (Test-DiskSpace -Server EV01 -UsedPercent 90 -WarnPercent 80).Status | Should -Be 'WARN'
    }
    It 'is OK below the threshold' {
        (Test-DiskSpace -Server EV01 -UsedPercent 10).Status | Should -Be 'OK'
    }
}
```

Run `Invoke-Pester` locally and in CI (the Jenkins track), and lint with `Invoke-ScriptAnalyzer`.

## PowerShell versus Bash: when to use which

| Situation | Choose |
|---|---|
| Windows servers, Active Directory, SQL Server, IIS, EV | PowerShell |
| Linux servers and containers | Bash (or PowerShell 7 if you prefer) |
| Structured data (JSON, CSV, APIs) | PowerShell is excellent; or Python |
| Cross-platform automation at scale | Ansible, calling either |

:::recap
- Variables `$x`, arrays `@()`, hashtables `@{}`, `if/foreach/for/while/switch`; double quotes expand variables.
- Advanced functions: `[CmdletBinding()]`, `[Parameter(Mandatory)]`, `[Validate*]`; return objects.
- Make errors catchable with `-ErrorAction Stop` or `$ErrorActionPreference = 'Stop'`; `try/catch/finally`; exit codes for automation.
- Modules package code; Pester tests it; PSScriptAnalyzer lints it.
:::

:::try Your turn
Write a function `Get-LogSummary -Path` that returns an object with `Errors`, `Warnings` and `FirstError` (time) for a log file, with validation that the file exists. Test the missing-file case with `try/catch`.
:::

:::quiz
? Why add `-ErrorAction Stop` to a cmdlet inside `try`?
+ Non-terminating errors are otherwise not caught by `catch`
- It makes the cmdlet faster
- It hides errors
- It is required syntax
! It turns the error into a terminating one.
? What should a function return for other commands to reuse?
+ Objects
- Formatted text from `Write-Host`
- Nothing
- A table string
! Format only at the end.
? What is Pester?
+ The PowerShell testing framework
- A package manager
- A remoting tool
- A linter
! Run it in CI.
:::
