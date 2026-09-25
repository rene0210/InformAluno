# E2E dos 3 criticos de seguranca - InformAluno
$ErrorActionPreference = "Continue"
$base = "http://127.0.0.1:8787"
$tmp = "C:\Users\Rene Silva\AppData\Local\Temp\opencode"
$bodyFile = Join-Path $tmp "e2e-body.json"
$payloadFile = Join-Path $tmp "e2e-payload.json"
$script:failures = 0

function Read-Code($raw) {
  if ([string]::IsNullOrWhiteSpace([string]$raw)) { return 0 }
  return [int]$raw
}

function Invoke-JsonPost($rota, $obj) {
  $json = ConvertTo-Json $obj -Compress
  [System.IO.File]::WriteAllText($payloadFile, $json)
  $code = curl.exe -s -o $bodyFile -w "%{http_code}" -X POST ($base + $rota) -H "Content-Type: application/json" -d "@$payloadFile"
  $body = ""
  if (Test-Path $bodyFile) { $body = Get-Content $bodyFile -Raw }
  return @{ code = (Read-Code $code); body = $body }
}

function Invoke-GetAuth($rota, $token) {
  if ($token) {
    $code = curl.exe -s -o $bodyFile -w "%{http_code}" -H ("Authorization: Bearer " + $token) ($base + $rota)
  } else {
    $code = curl.exe -s -o $bodyFile -w "%{http_code}" ($base + $rota)
  }
  $body = ""
  if (Test-Path $bodyFile) { $body = Get-Content $bodyFile -Raw }
  return @{ code = (Read-Code $code); body = $body }
}

function Invoke-DeleteAuth($rota, $token) {
  $code = curl.exe -s -o $bodyFile -w "%{http_code}" -X DELETE -H ("Authorization: Bearer " + $token) ($base + $rota)
  return (Read-Code $code)
}

function Check($nome, $obtido, $esperado) {
  if ($obtido -eq $esperado) {
    Write-Output ("PASS  " + $nome + "  [HTTP " + $obtido + "]")
  } else {
    Write-Output ("FAIL  " + $nome + "  [esperado " + $esperado + ", obteve " + $obtido + "]")
    $script:failures++
  }
}

# ===== CRIT-1: whitelist de cargos no auto-cadastro =====
$r = Invoke-JsonPost "/api/auth/registro" @{ nome = "E2E Admin"; email = "e2e.admin.teste@x.com"; senha = "SenhaForte123"; role = "ADMIN" }
Check "CRIT-1 registro role=ADMIN bloqueado" $r.code 400

$r = Invoke-JsonPost "/api/auth/registro" @{ nome = "E2E Diretor"; email = "e2e.diretor.teste@x.com"; senha = "SenhaForte123"; role = "DIRETOR" }
Check "CRIT-1 registro role=DIRETOR bloqueado" $r.code 400

$rPort = Invoke-JsonPost "/api/auth/registro" @{ nome = "E2E Portaria"; email = "e2e.portaria.teste@x.com"; senha = "SenhaForte123"; role = "PORTARIA" }
Check "CRIT-1 registro role=PORTARIA permitido" $rPort.code 201
$portId = $null
if ($rPort.code -eq 201) {
  $j = $rPort.body | ConvertFrom-Json
  $portId = $j.usuario.id
}

# ===== CRIT-2: sessoes com token =====
$login = Invoke-JsonPost "/api/auth/login" @{ email = "admin@informaluno.com"; senha = "admin123" }
Check "Login admin" $login.code 200
$tokenAdmin = $null
if ($login.code -eq 200) { $tokenAdmin = ($login.body | ConvertFrom-Json).token }

$r = Invoke-GetAuth "/api/admin/usuarios" $null
Check "CRIT-2 /api/admin/usuarios sem token -> 401" $r.code 401

if ($tokenAdmin) {
  $r = Invoke-GetAuth "/api/admin/usuarios" $tokenAdmin
  Check "CRIT-2 /api/admin/usuarios com token ADMIN -> 200" $r.code 200
} else {
  Write-Output "FAIL  sem token admin - dependentes puladas"
  $script:failures++
}

$loginP = Invoke-JsonPost "/api/auth/login" @{ email = "e2e.portaria.teste@x.com"; senha = "SenhaForte123" }
Check "Login usuario PORTARIA de teste" $loginP.code 200
$tokenPort = $null
if ($loginP.code -eq 200) { $tokenPort = ($loginP.body | ConvertFrom-Json).token }

if ($tokenPort) {
  $r = Invoke-GetAuth "/api/diretoria/dashboard" $tokenPort
  Check "CRIT-2 token PORTARIA em /api/diretoria -> 403" $r.code 403

  $r = Invoke-GetAuth "/api/admin/usuarios" $tokenPort
  Check "CRIT-2 token PORTARIA em /api/admin -> 403" $r.code 403
}

# ===== limpeza: remove usuario de teste =====
if ($tokenAdmin -and $portId) {
  $code = Invoke-DeleteAuth ("/api/admin/usuarios/" + $portId) $tokenAdmin
  if ($code -eq 200 -or $code -eq 204) {
    Write-Output ("PASS  limpeza: usuario PORTARIA de teste removido  [HTTP " + $code + "]")
  } else {
    Write-Output ("FAIL  limpeza: remocao do usuario de teste  [HTTP " + $code + "]")
    $script:failures++
  }

  $loginAfter = Invoke-JsonPost "/api/auth/login" @{ email = "e2e.portaria.teste@x.com"; senha = "SenhaForte123" }
  if ($loginAfter.code -ne 200) {
    Write-Output ("PASS  usuario de teste realmente removido (login HTTP " + $loginAfter.code + ")")
  } else {
    Write-Output "FAIL  usuario de teste ainda existe apos remocao"
    $script:failures++
  }
} else {
  Write-Output "FAIL  limpeza pulada (faltou token admin ou id do usuario)"
  $script:failures++
}

Write-Output ""
if ($script:failures -eq 0) {
  Write-Output "E2E CRITICOS: TUDO VERDE"
} else {
  Write-Output ("E2E CRITICOS: " + $script:failures + " FALHA(S)")
}
