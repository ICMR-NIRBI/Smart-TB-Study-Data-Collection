# Downloads new encrypted database backups from the server to this computer. Run hourly by Task Scheduler.
# The files stay encrypted: this computer never needs the backup passphrase. Do not store the passphrase here.
#
#   powershell -ExecutionPolicy Bypass -File pull-backups.ps1 -KeyPath D:\ServerKey\key.pem -Dest D:\SMART-TB-Backups
#
# This computer's public IP must be allowed for SSH on the server. Files older than -KeepDays are deleted here.
param(
  [Parameter(Mandatory)] [string] $KeyPath,
  [Parameter(Mandatory)] [string] $Dest,
  [string] $Server = '135.235.138.35',
  [string] $User = 'azureuser',
  [string] $RemoteDir = '/opt/smarttb/backups',
  [int] $KeepDays = 30
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$log = Join-Path $Dest 'pull.log'
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Path $log }

$sshArgs = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', "$User@$Server")

try {
  $listing = & ssh @sshArgs "sudo find $RemoteDir -maxdepth 1 -name smarttb-\*.dump.enc -exec stat -c %n,%s {} +"
  if ($LASTEXITCODE -ne 0) { throw "could not list backups on the server (exit $LASTEXITCODE)" }

  $fetched = 0
  foreach ($line in $listing) {
    $path, $size = $line -split ','
    $name = Split-Path $path -Leaf
    $target = Join-Path $Dest $name
    if ((Test-Path $target) -and (Get-Item $target).Length -eq [int64]$size) { continue }

    $part = "$target.part"
    # cmd's redirection keeps the bytes exact; PowerShell's own pipeline would corrupt binary data.
    cmd /c "ssh -i `"$KeyPath`" -o BatchMode=yes -o ConnectTimeout=20 $User@$Server sudo cat $path > `"$part`""
    if ($LASTEXITCODE -ne 0 -or (Get-Item $part).Length -ne [int64]$size) {
      Remove-Item $part -Force -ErrorAction SilentlyContinue
      throw "download of $name failed or was incomplete"
    }
    Move-Item -Force $part $target
    $fetched++
  }

  Get-ChildItem $Dest -Filter 'smarttb-*.dump.enc' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) | Remove-Item -Force
  $newest = (Get-ChildItem $Dest -Filter 'smarttb-*.dump.enc' | Sort-Object Name | Select-Object -Last 1).Name
  Log "OK: $fetched new file(s); newest: $newest"
} catch {
  Log "FAILED: $($_.Exception.Message)"
  exit 1
}
