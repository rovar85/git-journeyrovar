# PowerShell 7 (Linux build) in a container. On your own machine you would simply type: pwsh
pwsh() { docker run --rm -i --user "$(id -u):$(id -g)" -e HOME=/tmp -e POWERSHELL_TELEMETRY_OPTOUT=1 -v "$HOME/lab:/lab" -w /lab mcr.microsoft.com/powershell:latest pwsh -NoLogo -NoProfile "$@"; }
cd ~/lab
