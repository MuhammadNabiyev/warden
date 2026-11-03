# Drives the real Windows mouse and keyboard for screen recordings, so the video shows the normal
# cursor moving smoothly, not an automation overlay.
#
#   mouse.ps1 -Action moveclick -X 900 -Y 400       glide to (X,Y) in screen pixels, then click
#   mouse.ps1 -Action move -X 900 -Y 400            glide only
#   mouse.ps1 -Action type -Text "Move PAY-8"       type like a person (real key events)
#   mouse.ps1 -Action key -Text "{ENTER}"           one SendKeys chord
#   mouse.ps1 -Action scroll -Ticks -3              wheel; negative scrolls down
param(
  [Parameter(Mandatory)] [ValidateSet("move", "click", "moveclick", "type", "key", "scroll")] [string] $Action,
  [int] $X, [int] $Y, [string] $Text = "", [int] $Ticks = 0, [int] $Ms = 650
)

Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Input {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
# Work in physical screen pixels, the same space as the recording, whatever the Windows scaling.
[void][Input]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms

function Glide([int] $tx, [int] $ty, [int] $ms) {
  $p = New-Object Input+POINT; [void][Input]::GetCursorPos([ref] $p)
  $steps = [Math]::Max(12, [int]($ms / 12))
  for ($i = 1; $i -le $steps; $i++) {
    $t = $i / $steps
    $e = if ($t -lt 0.5) { 4 * $t * $t * $t } else { 1 - [Math]::Pow(-2 * $t + 2, 3) / 2 }  # ease in-out
    [void][Input]::SetCursorPos([int]($p.X + ($tx - $p.X) * $e), [int]($p.Y + ($ty - $p.Y) * $e))
    Start-Sleep -Milliseconds 12
  }
}

function Click {
  Start-Sleep -Milliseconds 120
  [Input]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 70
  [Input]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
}

switch ($Action) {
  "move" { Glide $X $Y $Ms }
  "click" { Click }
  "moveclick" { Glide $X $Y $Ms; Click }
  "type" {
    foreach ($c in $Text.ToCharArray()) {
      $k = if ("+^%~(){}[]".Contains($c)) { "{$c}" } else { "$c" }
      [System.Windows.Forms.SendKeys]::SendWait($k)
      Start-Sleep -Milliseconds (Get-Random -Minimum 35 -Maximum 85)
    }
  }
  "key" { [System.Windows.Forms.SendKeys]::SendWait($Text) }
  "scroll" {
    $n = [Math]::Abs($Ticks); $dir = [Math]::Sign($Ticks)
    for ($i = 0; $i -lt $n; $i++) { [Input]::mouse_event(0x800, 0, 0, 120 * $dir, [UIntPtr]::Zero); Start-Sleep -Milliseconds 140 }
  }
}
