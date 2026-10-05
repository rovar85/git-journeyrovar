---
track: windows
title: Windows Server administration with PowerShell
short: Windows admin
sub: Services, event logs, the registry, scheduled tasks, remoting, Active Directory and SQL Server: the daily toolbox for an EV environment.
---

:::note Example (not run here)
Everything in this lesson uses Windows-only features (services, event log, registry, WinRM, Active Directory). The lab runs Linux, so these are **examples of real commands and the output shape you will see**. The language and pipeline are exactly what you practised in lessons 1 to 3. When you have a Windows machine or VM (a free evaluation Windows Server works well), repeat each command there.
:::

## Services

Windows runs background programs as **services** (the Linux track's systemd units). EV has several (Indexing, Storage, Admin, Task Controller...).

```powershell
Get-Service *Enterprise* , *EV*                    # list by name pattern
Get-Service -Name EnterpriseVaultIndexingService | Select-Object Name, Status, StartType
Restart-Service -Name EnterpriseVaultIndexingService -WhatIf      # rehearse
Stop-Service  -Name EnterpriseVaultIndexingService
Set-Service   -Name EnterpriseVaultIndexingService -StartupType Automatic
Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' }   # should be running but is not
```

```term
PS> Get-Service -Name Spooler | Select-Object Name, Status, StartType

Name    Status StartType
----    ------ ---------
Spooler Running Automatic
```

The last command in the first block is a classic health check: services set to start automatically that are not running. Compare with `systemctl list-units --failed`.

## Event logs

The Windows **Event Log** is the place for application and system errors (the `journalctl` of Windows):

```powershell
Get-WinEvent -LogName Application -MaxEvents 20 |
    Where-Object { $_.LevelDisplayName -eq 'Error' } |
    Select-Object TimeCreated, ProviderName, Id, Message

# Events in the last hour from the EV providers
Get-WinEvent -FilterHashtable @{ LogName='Application'; ProviderName='Enterprise Vault'; StartTime=(Get-Date).AddHours(-1) }

# Failed logons (needs elevation): event ID 4625 in the Security log
Get-WinEvent -FilterHashtable @{ LogName='Security'; Id=4625 } -MaxEvents 10
```

Use `-FilterHashtable` (filtering at the source) rather than piping everything into `Where-Object`: it is far faster on large logs.

## Processes, disks, performance

```powershell
Get-Process | Sort-Object WS -Descending | Select-Object -First 5 Name, Id, @{n='MemMB';e={[int]($_.WS/1MB)}}
Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n='FreeGB';e={[math]::Round($_.Free/1GB,1)}}, @{n='UsedGB';e={[math]::Round($_.Used/1GB,1)}}
Get-Counter '\Processor(_Total)\% Processor Time','\Memory\Available MBytes' -SampleInterval 2 -MaxSamples 3
Get-Volume | Where-Object { $_.SizeRemaining / $_.Size -lt 0.15 }     # volumes below 15% free
Test-NetConnection sql01.corp.local -Port 1433                          # port check (nc -zv)
Resolve-DnsName sql01.corp.local                                         # DNS (dig)
```

These map directly to the Linux and Networking tracks: `top`, `df -h`, `vmstat`, `nc -zv`, `dig`.

## Registry and configuration

The registry is a hierarchical settings store, exposed as drives `HKLM:` and `HKCU:`:

```powershell
Get-ItemProperty 'HKLM:\SOFTWARE\KVS\Enterprise Vault\Install' | Select-Object InstallPath, Version
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Contoso\Tool' -Name Retries -Value 5
New-Item -Path 'HKLM:\SOFTWARE\Contoso\Tool' -Force
```

Take a backup (`reg export`) before changing the registry on a production server, and prefer product-supported tools or configuration files where they exist.

## Scheduled tasks (Windows cron)

```powershell
$action  = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument '-File C:\Scripts\Check-EV.ps1'
$trigger = New-ScheduledTaskTrigger -Daily -At 02:30
Register-ScheduledTask -TaskName 'EV nightly check' -Action $action -Trigger $trigger -User 'CORP\svc-evcheck' -Password $pw
Get-ScheduledTask -TaskName 'EV nightly check' | Get-ScheduledTaskInfo
```

Scheduled tasks need their script to be **idempotent**, write a log, and return a meaningful exit code.

## Remoting: run commands on other servers

**WinRM / PowerShell Remoting** (or SSH remoting in PowerShell 7) lets you run PowerShell on many servers at once, the equivalent of `ssh` plus Ansible ad hoc commands:

```powershell
Enable-PSRemoting -Force                                   # once, on each target
Invoke-Command -ComputerName EV01, EV02, SQL01 -ScriptBlock {
    Get-Service -Name 'MSSQLSERVER','EnterpriseVault*' -ErrorAction SilentlyContinue |
        Select-Object Name, Status
} | Select-Object PSComputerName, Name, Status
Enter-PSSession -ComputerName EV01                         # interactive session (like ssh)
```

Results come back as objects tagged with `PSComputerName`. Remoting uses Kerberos in a domain. Ansible's Windows support uses the same WinRM channel (Ansible track, lesson 6).

## Active Directory and SQL Server

```powershell
Import-Module ActiveDirectory
Get-ADUser -Filter "Name -like 'svc-ev*'" -Properties LastLogonDate, PasswordLastSet | Select-Object Name, Enabled, LastLogonDate
Get-ADGroupMember 'EV-Admins' | Select-Object Name, SamAccountName
Search-ADAccount -LockedOut

Import-Module SqlServer
Invoke-Sqlcmd -ServerInstance SQL01 -Query "SELECT name, state_desc FROM sys.databases" | Format-Table
Backup-SqlDatabase -ServerInstance SQL01 -Database EVDirectory -BackupFile D:\Backup\EVDirectory.bak
```

For an EV estate, AD identities (service accounts, groups) and SQL databases are central: a locked service account or a database in `RECOVERY_PENDING` state explains many outages. Use **least privilege** service accounts, **group managed service accounts (gMSA)** where possible so passwords are managed automatically, and never store passwords in scripts: use `Get-Credential`, the **SecretManagement** module, or a vault.

## Patching, firewall, certificates

```powershell
Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 5            # installed updates
Get-NetFirewallRule -DisplayName 'SQL*' | Select-Object DisplayName, Enabled, Direction, Action
New-NetFirewallRule -DisplayName 'EV Admin 8080' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
Get-ChildItem Cert:\LocalMachine\My | Where-Object NotAfter -lt (Get-Date).AddDays(30) | Select-Object Subject, NotAfter    # certs expiring soon
```

The last line is a valuable monitoring check: **certificates expiring within 30 days** (the TLS lesson in the Networking track explained why that causes outages).

## Desired State Configuration and infrastructure as code

Windows servers can be built and kept in a known state with code, the same philosophy as Ansible and Terraform:

- **DSC** (Desired State Configuration): declare features, files, services, registry values; the Local Configuration Manager enforces them.
- **Ansible** with `ansible.windows` modules (`win_feature`, `win_service`, `win_package`, `win_regedit`, `win_copy`) over WinRM.
- **Terraform** to create the VMs; **Packer** to build golden images; **Chocolatey** or **winget** for packages.

```yaml:win.yml (Example, not run here)
- hosts: evservers
  tasks:
    - name: Ensure the indexing service starts automatically and is running
      ansible.windows.win_service:
        name: EnterpriseVaultIndexingService
        start_mode: auto
        state: started
    - name: Open the admin port
      community.windows.win_firewall_rule:
        name: EV Admin
        localport: 8080
        protocol: tcp
        action: allow
        direction: in
        state: present
        enabled: true
```

## A health-check script you could run on EV servers

```powershell:Check-EV.ps1 (Example, not run here)
[CmdletBinding()]
param([string[]]$Server = @('EV01','EV02'))
$ErrorActionPreference = 'Stop'

$results = Invoke-Command -ComputerName $Server -ScriptBlock {
    [pscustomobject]@{
        Server       = $env:COMPUTERNAME
        StoppedAuto  = @(Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' }).Count
        LowDiskGB    = @(Get-Volume | Where-Object { $_.DriveLetter -and ($_.SizeRemaining / $_.Size) -lt 0.15 }).Count
        CertsExpire  = @(Get-ChildItem Cert:\LocalMachine\My | Where-Object NotAfter -lt (Get-Date).AddDays(30)).Count
        RecentErrors = @(Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2; StartTime=(Get-Date).AddHours(-1)} -ErrorAction SilentlyContinue).Count
    }
}
$results | Format-Table -AutoSize
if ($results | Where-Object { $_.StoppedAuto -or $_.LowDiskGB -or $_.CertsExpire }) { exit 1 }   # non-zero for Jenkins/monitoring
```

Run it from Jenkins (a Windows agent, see the Jenkins track), schedule it, and send the result to your monitoring system: PowerShell, CI and monitoring working together.

:::recap
- Services (`Get-Service`), event logs (`Get-WinEvent -FilterHashtable`), processes and disks, registry drives, scheduled tasks.
- Remoting with `Invoke-Command` and `Enter-PSSession`; Ansible reaches Windows over WinRM too.
- Active Directory and SQL Server modules; gMSA and vaults for credentials.
- Check expiring certificates, low disks, stopped services; build and maintain servers as code (DSC, Ansible, Terraform).
:::

:::try Your turn
On a Windows VM, write a script that lists automatic services that are stopped, volumes under 20% free, and certificates expiring within 60 days, and exits non-zero if anything is found.
:::

:::quiz
? Why use `-FilterHashtable` with `Get-WinEvent`?
+ Filtering happens at the source, much faster than piping everything
- It hides errors
- It is required syntax
- It disables logging
! Filter early on large logs.
? Which cmdlet runs commands on several remote servers?
+ `Invoke-Command -ComputerName`
- `Get-Service`
- `Set-Location`
- `Write-Output`
! Results return as objects with `PSComputerName`.
? Why prefer a gMSA for a service account?
+ Windows manages and rotates its password automatically
- It is faster
- It needs no AD
- It cannot be locked
! No password stored in scripts.
:::
