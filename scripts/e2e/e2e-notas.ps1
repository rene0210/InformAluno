# E2E — Notas, Acompanhamento, Painel do Pai, Diretoria/Coordenador
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

# ===== 2. Criar usuarios de teste (pai, professor, coordenador) =====
$rPai = Invoke-JsonSend "POST" "/api/auth/registro" @{ nome = "Pai Teste Notas"; email = "e2e.pai.notas@x.com"; senha = "SenhaForte123" } $null
Check "Registro pai (RESPONSAVEL)" ($rPai.code -eq 201) ("[HTTP " + $rPai.code + "]")
$paiId = ($rPai.body | ConvertFrom-Json).usuario.id

$rProf = Invoke-JsonSend "POST" "/api/auth/registro" @{ nome = "Prof Teste Notas"; email = "e2e.prof.notas@x.com"; senha = "SenhaForte123" } $null
Check "Registro professor (auto-cadastro)" ($rProf.code -eq 201) ("[HTTP " + $rProf.code + "]")
$profId = ($rProf.body | ConvertFrom-Json).usuario.id

$rCoord = Invoke-JsonSend "POST" "/api/auth/registro" @{ nome = "Coord Teste Notas"; email = "e2e.coord.notas@x.com"; senha = "SenhaForte123" } $null
Check "Registro coordenador (auto-cadastro)" ($rCoord.code -eq 201) ("[HTTP " + $rCoord.code + "]")
$coordId = ($rCoord.body | ConvertFrom-Json).usuario.id

# ===== 3. Admin promove cargos (fluxo real do painel) =====
$p1 = Invoke-JsonSend "PATCH" ("/api/admin/usuarios/" + $profId + "/role") @{ novoRole = "PROFESSOR" } $tokenAdmin
Check "Admin promove para PROFESSOR" ($p1.code -eq 200) ("[HTTP " + $p1.code + "]")

$p2 = Invoke-JsonSend "PATCH" ("/api/admin/usuarios/" + $coordId + "/role") @{ novoRole = "COORDENADOR" } $tokenAdmin
Check "Admin promove para COORDENADOR" ($p2.code -eq 200) ("[HTTP " + $p2.code + "]")

# ===== 4. Logins dos tres perfis =====
$loginPai = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.pai.notas@x.com"; senha = "SenhaForte123" } $null
$tokenPai = $null
if ($loginPai.code -eq 200) { $tokenPai = ($loginPai.body | ConvertFrom-Json).token }
Check "Login pai" ($tokenPai -ne $null) ("[HTTP " + $loginPai.code + "]")

$loginProf = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.prof.notas@x.com"; senha = "SenhaForte123" } $null
$tokenProf = $null
if ($loginProf.code -eq 200) { $tokenProf = ($loginProf.body | ConvertFrom-Json).token }
Check "Login professor" ($tokenProf -ne $null) ("[HTTP " + $loginProf.code + "]")

$loginCoord = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.coord.notas@x.com"; senha = "SenhaForte123" } $null
$tokenCoord = $null
if ($loginCoord.code -eq 200) { $tokenCoord = ($loginCoord.body | ConvertFrom-Json).token }
Check "Login coordenador" ($tokenCoord -ne $null) ("[HTTP " + $loginCoord.code + "]")

# ===== 5. Pre-cadastro com vinculo (conta do pai) =====
$cad = Invoke-JsonSend "POST" "/api/cadastro" @{
  usuario_id    = $paiId
  nome          = "Aluno Teste Notas"
  matricula     = "990011"
  cpfAluno      = "92299988877"
  responsavelNome = "Pai Teste Notas"
  cpf           = "92233344455"
  responsavel2Nome = "Mae Teste Notas"
  cpf2          = "92266677788"
  status        = "PENDENTE_VALIDACAO"
} $tokenPai
Check "Pre-cadastro com vinculo do pai" ($cad.code -eq 201) ("[HTTP " + $cad.code + "]")

# ===== 6. Professor lista alunos (aluno de teste + Anthony) =====
$profAlunos = Invoke-GetAuth "/api/professor/alunos" $tokenProf
$alunoTeste = $null
$anthonyId = $null
if ($profAlunos.code -eq 200) {
  $lista = ($profAlunos.body | ConvertFrom-Json).alunos
  foreach ($a in $lista) {
    if ($a.matricula -eq "990011") { $alunoTeste = $a }
    if ($a.matricula -eq "101010") { $anthonyId = $a.id }
  }
}
Check "Professor lista alunos" (($profAlunos.code -eq 200) -and ($alunoTeste -ne $null)) ("[HTTP " + $profAlunos.code + "]")
$alunoId = $null
if ($alunoTeste) { $alunoId = $alunoTeste.id }

# Sem token -> 401
$profSemTok = Invoke-GetAuth "/api/professor/alunos" $null
Check "GET /api/professor/alunos sem token -> 401" ($profSemTok.code -eq 401) ("[HTTP " + $profSemTok.code + "]")

# ===== 7. Pai ve o filho no painel =====
$paiAlunos = Invoke-GetAuth "/api/painel/alunos" $tokenPai
$filhoNoPainel = $null
if ($paiAlunos.code -eq 200) {
  foreach ($f in (($paiAlunos.body | ConvertFrom-Json).alunos)) {
    if ($f.matricula -eq "990011") { $filhoNoPainel = $f }
  }
}
Check "Pai ve o filho no painel" (($paiAlunos.code -eq 200) -and ($filhoNoPainel -ne $null)) ("[HTTP " + $paiAlunos.code + "]")

# ===== 8. Professor lanca nota (7,5 no 1o bimestre) =====
if ($alunoId) {
  $nota1 = Invoke-JsonSend "PUT" "/api/professor/notas" @{ aluno_id = $alunoId; bimestre = 1; materia = "Matemática"; nota = "7,5" } $tokenProf
  Check "Professor lanca nota 7,5" ($nota1.code -eq 200) ("[HTTP " + $nota1.code + "]")

  # Nota invalida -> 400
  $notaErr = Invoke-JsonSend "PUT" "/api/professor/notas" @{ aluno_id = $alunoId; bimestre = 1; materia = "Matemática"; nota = "15" } $tokenProf
  Check "Nota 15 rejeitada -> 400" ($notaErr.code -eq 400) ("[HTTP " + $notaErr.code + "]")

  # Bimestre invalido -> 400
  $bimErr = Invoke-JsonSend "PUT" "/api/professor/notas" @{ aluno_id = $alunoId; bimestre = 9; materia = "Matemática"; nota = "8" } $tokenProf
  Check "Bimestre 9 rejeitado -> 400" ($bimErr.code -eq 400) ("[HTTP " + $bimErr.code + "]")

  # Verifica persistencia (7.5 no bimestre 1)
  $profAlunos2 = Invoke-GetAuth "/api/professor/alunos" $tokenProf
  $notaOk = $false
  if ($profAlunos2.code -eq 200) {
    foreach ($a in (($profAlunos2.body | ConvertFrom-Json).alunos)) {
      if ($a.id -eq $alunoId) {
        foreach ($n in $a.notas) {
          if ($n.bimestre -eq 1 -and [double]$n.nota -eq 7.5) { $notaOk = $true }
        }
      }
    }
  }
  Check "Nota persistida (1o bim = 7,5)" $notaOk ""

  # Acompanhamento do professor
  $acProf = Invoke-JsonSend "POST" "/api/professor/acompanhamentos" @{ aluno_id = $alunoId; texto = "Desempenho otimo no 1o bimestre (teste E2E)." } $tokenProf
  Check "Professor registra acompanhamento" ($acProf.code -eq 201) ("[HTTP " + $acProf.code + "]")
}

# ===== 9. Pai adiciona acompanhamento (doenca) =====
if ($alunoId) {
  $acPai = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{ aluno_id = $alunoId; texto = "Esta doente, faltara amanha (teste E2E)." } $tokenPai
  Check "Pai registra acompanhamento do filho" ($acPai.code -eq 201) ("[HTTP " + $acPai.code + "]")

  # SEGURANCA: pai NAO pode anotar em aluno alheio (Anthony nao e filho dele)
  if ($anthonyId) {
    $acAlheio = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{ aluno_id = $anthonyId; texto = "Tentativa nao autorizada (teste E2E)." } $tokenPai
    Check "Pai bloqueado em aluno alheio -> 403" ($acAlheio.code -eq 403) ("[HTTP " + $acAlheio.code + "]")
  } else {
    Check "Pai bloqueado em aluno alheio -> 403" $false "[aluno 101010 nao encontrado]"
  }

  # O pai ve as anotacoes do professor no painel
  $paiAlunos2 = Invoke-GetAuth "/api/painel/alunos" $tokenPai
  $veProf = $false
  if ($paiAlunos2.code -eq 200) {
    foreach ($f in (($paiAlunos2.body | ConvertFrom-Json).alunos)) {
      if ($f.id -eq $alunoId) {
        foreach ($ac in $f.acompanhamentos) {
          if ($ac.papel -eq "PROFESSOR") { $veProf = $true }
        }
      }
    }
  }
  Check "Pai ve acompanhamento do professor" $veProf ""
}

# ===== 10. Diretoria/Coordenador ve todas as anotações =====
$dirAnot = Invoke-GetAuth "/api/diretoria/acompanhamentos" $tokenCoord
$temDoente = ($dirAnot.body -match "doente")
$temProf = ($dirAnot.body -match "1o bimestre")
Check "Coordenador ve anotacoes (pai + professor)" (($dirAnot.code -eq 200) -and $temDoente -and $temProf) ("[HTTP " + $dirAnot.code + "]")

# Coordenador acessa o dashboard da diretoria
$dirDash = Invoke-GetAuth "/api/diretoria/dashboard" $tokenCoord
Check "Coordenador acessa dashboard da diretoria" ($dirDash.code -eq 200) ("[HTTP " + $dirDash.code + "]")

# Professor NAO acessa diretoria -> 403
$dirProf = Invoke-GetAuth "/api/diretoria/acompanhamentos" $tokenProf
Check "Professor em /api/diretoria -> 403" ($dirProf.code -eq 403) ("[HTTP " + $dirProf.code + "]")

# Sem token -> 401
$dirSem = Invoke-GetAuth "/api/diretoria/acompanhamentos" $null
Check "/api/diretoria/acompanhamentos sem token -> 401" ($dirSem.code -eq 401) ("[HTTP " + $dirSem.code + "]")

# Pai nao acessa rota de professor -> 403
$paiProf = Invoke-GetAuth "/api/professor/alunos" $tokenPai
Check "Pai em /api/professor -> 403" ($paiProf.code -eq 403) ("[HTTP " + $paiProf.code + "]")

# ===== 11. Limpeza: aluno de teste + usuarios de teste =====
if ($alunoId) {
  $delAluno = Invoke-DeleteAuth ("/api/admin/alunos/" + $alunoId) $tokenAdmin
  Check "Limpeza: aluno de teste removido" (($delAluno -eq 200) -or ($delAluno -eq 204)) ("[HTTP " + $delAluno + "]")
}

foreach ($uid in @($paiId, $profId, $coordId)) {
  if ($uid) {
    $del = Invoke-DeleteAuth ("/api/admin/usuarios/" + $uid) $tokenAdmin
    Check ("Limpeza: usuario " + $uid + " removido") (($del -eq 200) -or ($del -eq 204)) ("[HTTP " + $del + "]")
  }
}

# A sessao do pai removido nao vale mais
$paiApos = Invoke-GetAuth "/api/painel/alunos" $tokenPai
Check "Sessao do pai removido -> 401" ($paiApos.code -eq 401) ("[HTTP " + $paiApos.code + "]")

Write-Output ""
if ($script:failures -eq 0) {
  Write-Output "E2E NOTAS/ACOMPANHAMENTO: TUDO VERDE"
} else {
  Write-Output ("E2E NOTAS/ACOMPANHAMENTO: " + $script:failures + " FALHA(S)")
}
