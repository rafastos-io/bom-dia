# Bandeja do agente do radar (Bom Dia).
#
# Controla o agente local (run-forever.cmd) sem console aberto:
# iniciar, parar, rodar agora, abrir o Radar, ver o log e sair.
#
# Abra pelo atalho (abrir-bandeja.vbs) para nao aparecer janela nenhuma.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$agentDir = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $agentDir "radar-agent.log"
$icoPath = Join-Path $PSScriptRoot "bandeja.ico"
$wrapper = Join-Path $agentDir "run-forever.cmd"
$radarUrl = "https://bomdia.rafastos.com.br/radar"

function Get-AgentProcesses {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*index.js*watch*" }
}

function Test-AgentRunning {
  return [bool](Get-AgentProcesses | Select-Object -First 1)
}

function Start-Agent {
  if (Test-AgentRunning) { return }
  Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "`"$wrapper`"") -WindowStyle Hidden
}

function Stop-Agent {
  Get-AgentProcesses | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*run-forever*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 400
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = New-Object System.Drawing.Icon($icoPath)
$notify.Text = "BomDia Radar"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem "Agente: verificando..."
$statusItem.Enabled = $false
[void]$menu.Items.Add($statusItem)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$openItem = New-Object System.Windows.Forms.ToolStripMenuItem "Abrir o Radar"
$onceItem = New-Object System.Windows.Forms.ToolStripMenuItem "Rodar agora"
[void]$menu.Items.Add($openItem)
[void]$menu.Items.Add($onceItem)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$toggleItem = New-Object System.Windows.Forms.ToolStripMenuItem "Parar agente"
$logItem = New-Object System.Windows.Forms.ToolStripMenuItem "Abrir log"
$folderItem = New-Object System.Windows.Forms.ToolStripMenuItem "Abrir pasta do agente"
[void]$menu.Items.Add($toggleItem)
[void]$menu.Items.Add($logItem)
[void]$menu.Items.Add($folderItem)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem "Sair (para o agente)"
[void]$menu.Items.Add($exitItem)
$notify.ContextMenuStrip = $menu

function Update-Status {
  if (Test-AgentRunning) {
    $statusItem.Text = "Agente: ativo"
    $toggleItem.Text = "Parar agente"
  } else {
    $statusItem.Text = "Agente: parado (o Radar nao atualiza)"
    $toggleItem.Text = "Iniciar agente"
  }
}

function Show-Balloon([string]$title, [string]$text) {
  $notify.BalloonTipTitle = $title
  $notify.BalloonTipText = $text
  $notify.ShowBalloonTip(3000)
}

$openItem.add_Click({ Start-Process $radarUrl })
$notify.add_DoubleClick({ Start-Process $radarUrl })

$onceItem.add_Click({
  $command = "cd /d `"$agentDir`" && npm run once >> `"$logPath`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $command) -WindowStyle Hidden
  Show-Balloon "BomDia Radar" "Rodada rapida iniciada. Abra o Radar em instantes."
})

$toggleItem.add_Click({
  if (Test-AgentRunning) {
    Stop-Agent
    Show-Balloon "BomDia Radar" "Agente parado. O Radar para de atualizar ate voce iniciar de novo."
  } else {
    Start-Agent
    Show-Balloon "BomDia Radar" "Agente iniciado."
  }
  Start-Sleep -Milliseconds 600
  Update-Status
})

$logItem.add_Click({
  if (Test-Path $logPath) { Start-Process notepad.exe $logPath }
  else { Show-Balloon "BomDia Radar" "Ainda nao ha log do agente." }
})

$folderItem.add_Click({ Start-Process explorer.exe $agentDir })

$exitItem.add_Click({
  Stop-Agent
  $notify.Visible = $false
  $notify.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({ Update-Status })
$timer.Start()

Start-Agent
Update-Status
Show-Balloon "BomDia Radar" "Agente ativo. Clique duas vezes no icone para abrir o Radar."

[System.Windows.Forms.Application]::Run()
$timer.Stop()
