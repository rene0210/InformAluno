# E2E — Secretaria: ajuste de fotos SEM funcao de excluir
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

function Invoke-JsonSend($metodo, $rota, $obj, $token) {
  $json = ConvertTo-Json $obj -Compress
  [System.IO.File]::WriteAllText($payloadFile, $json)
  $args = @("-s", "-o", $bodyFile, "-w", "%{http_code}", "-X", $metodo,
            "-H", "Content-Type: application/json", "-d", "@$payloadFile")
  if ($token) { $args += @("-H", ("Authorization: Bearer " + $token)) }
  $code = curl.exe @args ($base + $rota)
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

function Check($nome, $condicao, $detalhe) {
  if ($condicao) {
    Write-Output ("PASS  " + $nome + "  " + $detalhe)
  } else {
    Write-Output ("FAIL  " + $nome + "  " + $detalhe)
    $script:failures++
  }
}

# ===== 1. Login admin =====
$loginAdmin = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "admin@informaluno.com"; senha = "admin123" } $null
$tokenAdmin = $null
if ($loginAdmin.code -eq 200) { $tokenAdmin = ($loginAdmin.body | ConvertFrom-Json).token }
Check "Login admin" ($tokenAdmin -ne $null) ("[HTTP " + $loginAdmin.code + "]")
if (-not $tokenAdmin) { Write-Output "SEM TOKEN ADMIN - abortando"; exit 1 }

# ===== 2. Criar usuaria da secretaria + promover (fluxo do painel admin) =====
$rSec = Invoke-JsonSend "POST" "/api/auth/registro" @{ nome = "Sec Teste Fotos"; email = "e2e.secretaria@x.com"; senha = "SenhaForte123" } $null
Check "Registro auto-cadastro (RESPONSAVEL)" ($rSec.code -eq 201) ("[HTTP " + $rSec.code + "]")
$secId = ($rSec.body | ConvertFrom-Json).usuario.id

$prom = Invoke-JsonSend "PATCH" ("/api/admin/usuarios/" + $secId + "/role") @{ novoRole = "SECRETARIA" } $tokenAdmin
Check "Admin promove para SECRETARIA" ($prom.code -eq 200) ("[HTTP " + $prom.code + "]")

$loginSec = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.secretaria@x.com"; senha = "SenhaForte123" } $null
$tokenSec = $null
if ($loginSec.code -eq 200) { $tokenSec = ($loginSec.body | ConvertFrom-Json).token }
Check "Login secretaria" ($tokenSec -ne $null) ("[HTTP " + $loginSec.code + "]")

# ===== 3. Rota exige sessao =====
$semTok = Invoke-GetAuth "/api/secretaria/alunos" $null
Check "GET /api/secretaria/alunos sem token -> 401" ($semTok.code -eq 401) ("[HTTP " + $semTok.code + "]")

# ===== 4. Pre-cadastro de teste (sem vinculo) =====
$cad = Invoke-JsonSend "POST" "/api/cadastro" @{
  nome            = "Aluno Teste Secretaria"
  matricula       = "990077"
  cpfAluno        = "94477788899"
  responsavelNome = "Pai Teste Sec"
  cpf             = "94411122233"
  responsavel2Nome = "Mae Teste Sec"
  cpf2            = "94444455566"
  status          = "PENDENTE_VALIDACAO"
} $tokenSec
Check "Pre-cadastro de teste criado" ($cad.code -eq 201) ("[HTTP " + $cad.code + "]")

# ===== 5. Secretaria lista os pre-cadastros =====
$secLista = Invoke-GetAuth "/api/secretaria/alunos" $tokenSec
$alunoId = $null
$fotoAntes = $null
if ($secLista.code -eq 200) {
  $lista = $secLista.body | ConvertFrom-Json
  foreach ($a in $lista) {
    if ($a.matricula -eq "990077") { $alunoId = $a.id; $fotoAntes = $a.foto_aluno }
  }
}
Check "Secretaria lista pre-cadastros" (($secLista.code -eq 200) -and ($alunoId -ne $null)) ("[HTTP " + $secLista.code + "]")

if ($alunoId) {
  # ===== 6. Ajustar foto do ALUNO =====
  $fotoNova1 = "data:image/jpeg;base64,TESTESECALUNO001"
  $p1 = Invoke-JsonSend "PATCH" ("/api/secretaria/alunos/" + $alunoId + "/foto") @{ alvo = "aluno"; foto = $fotoNova1 } $tokenSec
  Check "Secretaria ajusta foto do aluno" ($p1.code -eq 200) ("[HTTP " + $p1.code + "]")

  # ===== 7. Ajustar foto do PAI =====
  $fotoNova2 = "data:image/jpeg;base64,TESTESECPAI0001"
  $p2 = Invoke-JsonSend "PATCH" ("/api/secretaria/alunos/" + $alunoId + "/foto") @{ alvo = "pai"; foto = $fotoNova2 } $tokenSec
  Check "Secretaria ajusta foto do pai" ($p2.code -eq 200) ("[HTTP " + $p2.code + "]")

  # ===== 8. Persistencia =====
  $secLista2 = Invoke-GetAuth "/api/secretaria/alunos" $tokenSec
  $ok1 = $false
  if ($secLista2.code -eq 200) {
    foreach ($a in ($secLista2.body | ConvertFrom-Json)) {
      if ($a.id -eq $alunoId) {
        if ($a.foto_aluno -eq $fotoNova1 -and $a.foto_pai -eq $fotoNova2) { $ok1 = $true }
      }
    }
  }
  Check "Fotos persistidas (aluno + pai)" $ok1 ""

  # ===== 9. Validacoes =====
  $pBad = Invoke-JsonSend "PATCH" ("/api/secretaria/alunos/" + $alunoId + "/foto") @{ alvo = "extranho"; foto = "x" } $tokenSec
  Check "Alvo invalido -> 400" ($pBad.code -eq 400) ("[HTTP " + $pBad.code + "]")

  $p404 = Invoke-JsonSend "PATCH" "/api/secretaria/alunos/999999/foto" @{ alvo = "aluno"; foto = "x" } $tokenSec
  Check "Aluno inexistente -> 404" ($p404.code -eq 404) ("[HTTP " + $p404.code + "]")

  # ===== 10. SEM EXCLUSAO: secretaria nao deleta nem usa namespace admin =====
  $delSec = Invoke-DeleteAuth ("/api/admin/alunos/" + $alunoId) $tokenSec
  Check "Secretaria tenta EXCLUIR -> 403" ($delSec -eq 403) ("[HTTP " + $delSec + "]")

  $listaAdminSec = Invoke-GetAuth "/api/admin/alunos" $tokenSec
  Check "Secretaria em /api/admin/alunos -> 403" ($listaAdminSec.code -eq 403) ("[HTTP " + $listaAdminSec.code + "]")

  $delUserSec = Invoke-DeleteAuth ("/api/admin/usuarios/" + $secId) $tokenSec
  Check "Secretaria tenta excluir usuario -> 403" ($delUserSec -eq 403) ("[HTTP " + $delUserSec + "]")

  # Aluno continua existindo apos tentativas de exclusao
  $depois = Invoke-GetAuth "/api/secretaria/alunos" $tokenSec
  $aindaLa = $false
  if ($depois.code -eq 200) {
    foreach ($a in ($depois.body | ConvertFrom-Json)) { if ($a.id -eq $alunoId) { $aindaLa = $true } }
  }
  Check "Aluno intacto apos tentativas de exclusao" $aindaLa ""
}

# ===== 11. Regressao do admin (refatoracao do helper) =====
$admLista = Invoke-GetAuth "/api/admin/alunos" $tokenAdmin
Check "Regressao: admin GET /api/admin/alunos" ($admLista.code -eq 200) ("[HTTP " + $admLista.code + "]")

if ($alunoId) {
  $fotoMae = "data:image/jpeg;base64,TESTESECMAE0001"
  $pAdm = Invoke-JsonSend "PATCH" ("/api/admin/alunos/" + $alunoId + "/foto") @{ alvo = "mae"; foto = $fotoMae } $tokenAdmin
  Check "Regressao: admin ajusta foto da mae" ($pAdm.code -eq 200) ("[HTTP " + $pAdm.code + "]")

  $pAdmBad = Invoke-JsonSend "PATCH" ("/api/admin/alunos/" + $alunoId + "/foto") @{ alvo = "mae"; foto = "" } $tokenAdmin
  Check "Regressao: foto vazia -> 400" ($pAdmBad.code -eq 400) ("[HTTP " + $pAdmBad.code + "]")
}

# ===== 12. Limpeza =====
if ($alunoId) {
  $delAluno = Invoke-DeleteAuth ("/api/admin/alunos/" + $alunoId) $tokenAdmin
  Check "Limpeza: aluno de teste removido" (($delAluno -eq 200) -or ($delAluno -eq 204)) ("[HTTP " + $delAluno + "]")
}
if ($secId) {
  $delSecUser = Invoke-DeleteAuth ("/api/admin/usuarios/" + $secId) $tokenAdmin
  Check "Limpeza: usuario secretaria removido" (($delSecUser -eq 200) -or ($delSecUser -eq 204)) ("[HTTP " + $delSecUser + "]")
}
$secPos = Invoke-GetAuth "/api/secretaria/alunos" $tokenSec
Check "Sessao da secretaria removida -> 401" ($secPos.code -eq 401) ("[HTTP " + $secPos.code + "]")

Write-Output ""
if ($script:failures -eq 0) {
  Write-Output "E2E SECRETARIA/FOTOS: TUDO VERDE"
} else {
  Write-Output ("E2E SECRETARIA/FOTOS: " + $script:failures + " FALHA(S)")
}
