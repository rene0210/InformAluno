# ============================================================
# Smoke test do InformAluno (Windows PowerShell)
# Sobe o Vite, testa rotas/modulos/CSS no ar real e encerra.
# Uso:  npm run verify     (raiz do projeto)
# Se o servidor ja estiver rodando, testa ele no lugar de subir outro.
# ============================================================
$falhas = @()

# 1) O servidor responde em http://localhost:5173 ?
$serverProprio = $false
$proc = $null
$jaRodando = $false
try {
  Invoke-WebRequest "http://localhost:5173/" -UseBasicParsing -TimeoutSec 3 | Out-Null
  $jaRodando = $true
} catch { }

if ($jaRodando) {
  Write-Host "[ok] Usando o servidor que ja esta rodando em 5173"
} else {
  # Porta precisa estar livre para subir um temporario
  $ocup = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
  if ($ocup) {
    $pidOcup = @($ocup)[0].OwningProcess
    Write-Host "[X] Porta 5173 ocupada por outro processo (PID $pidOcup) e nao responde como o app." -ForegroundColor Red
    Write-Host "    Mate-o com:   taskkill /PID $pidOcup /F"
    exit 1
  }

  $out = Join-Path $env:TEMP "informaluno-verify-out.log"
  $err = Join-Path $env:TEMP "informaluno-verify-err.log"
  Remove-Item $out, $err -ErrorAction SilentlyContinue
  $vite = Join-Path (Split-Path -Parent $PSScriptRoot) "node_modules/vite/bin/vite.js"
  if (-not (Test-Path $vite)) {
    Write-Host "[X] vite nao encontrado em node_modules - rode:  npm install" -ForegroundColor Red
    exit 1
  }

  $proc = Start-Process -FilePath "node" -ArgumentList "`"$vite`"", "--port", "5173", "--strictPort" `
    -WorkingDirectory (Split-Path -Parent $PSScriptRoot) -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err
  $serverProprio = $true

  $pronto = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-WebRequest "http://localhost:5173/" -UseBasicParsing -TimeoutSec 3 | Out-Null; $pronto = $true; break } catch { }
  }
  if (-not $pronto) {
    Write-Host "[X] O Vite nao subiu em 5s. Saida:" -ForegroundColor Red
    Get-Content $out, $err -Tail 15 -ErrorAction SilentlyContinue
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    exit 1
  }
  Write-Host "[ok] Vite iniciado (temporario)"
}

try {
  # 2) Rotas (SPA) + modulos + CSS - pegam import quebrado na hora
  $urls = @(
    "/", "/registrar", "/cadastro", "/portaria", "/professor", "/diretoria",
    "/painel", "/secretaria",
    "/src/main.tsx", "/src/app.tsx",
    "/src/pages/home/home.tsx",
    "/src/pages/auth/registrousuario.tsx",
    "/src/pages/portaria/portaria.tsx",
    "/src/pages/chat/chat.tsx",
    "/src/pages/professor/professordashboard.tsx",
    "/src/pages/diretoria/diretoriadashboard.tsx",
    "/src/pages/responsavel/painelresponsavel.tsx",
    "/src/pages/secretaria/secretariatela.tsx",
    "/src/pages/cadastro/Cadastro.css",
    "/inform-aluno-api/src/components/cadastro.tsx"
  )
  foreach ($u in $urls) {
    try {
      $r = Invoke-WebRequest "http://localhost:5173$u" -UseBasicParsing -TimeoutSec 15
      if ($r.StatusCode -eq 200) {
        Write-Host "[ok] 200  $u"
      } else {
        Write-Host "[X] $($r.StatusCode)  $u" -ForegroundColor Red
        $falhas += $u
      }
    } catch {
      Write-Host "[X] FALHOU  $u" -ForegroundColor Red
      $falhas += $u
    }
  }
} finally {
  if ($serverProprio -and $proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
}

# 3) Backend (informativo - nao derruba o verify)
try {
  $p = Invoke-WebRequest "http://127.0.0.1:8787/api/ping" -UseBasicParsing -TimeoutSec 3
  Write-Host "[ok] Backend 8787: $($p.Content)"
} catch {
  Write-Host "[!] Backend 8787 fora do ar - inicie com:  npm run api" -ForegroundColor Yellow
}

# 4) Resumo
if ($falhas.Count -eq 0) {
  Write-Host ""
  Write-Host "TUDO VERDE - projeto validado em http://localhost:5173" -ForegroundColor Green
  exit 0
} else {
  Write-Host ""
  Write-Host "$($falhas.Count) FALHA(S) - veja quais URLs falharam acima" -ForegroundColor Red
  exit 1
}
