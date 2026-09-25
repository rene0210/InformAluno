# E2E — Atestado anexado pelo responsavel (upload + visualizacao escolar)
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
  $json = ConvertTo-Json $obj -Compress -Depth 8
  [System.IO.File]::WriteAllText($payloadFile, $json)
  $reqArgs = @("-s", "-o", $bodyFile, "-w", "%{http_code}", "-X", $metodo,
               "-H", "Content-Type: application/json", "-d", "@$payloadFile")
  if ($token) { $reqArgs += @("-H", ("Authorization: Bearer " + $token)) }
  $code = curl.exe @reqArgs ($base + $rota)
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

# Constantes de teste
$png1px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
$pdfTeste = "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrpOg0MTGCg=="

# ===== 1. Login admin =====
$loginAdmin = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "admin@informaluno.com"; senha = "admin123" } $null
$tokenAdmin = $null
if ($loginAdmin.code -eq 200) { $tokenAdmin = ($loginAdmin.body | ConvertFrom-Json).token }
Check "Login admin" ($tokenAdmin -ne $null) ("[HTTP " + $loginAdmin.code + "]")
if (-not $tokenAdmin) { Write-Output "SEM TOKEN ADMIN - abortando"; exit 1 }

# ===== 2. Responsavel (pai) descartavel =====
$registroPai = Invoke-JsonSend "POST" "/api/auth/registro" @{
  nome = "Pai Teste Atestado"; email = "e2e.atestado.pai@x.com"; senha = "SenhaAtest123"
} $null
$paiId = $null
if ($registroPai.code -eq 201) {
  $paiId = ($registroPai.body | ConvertFrom-Json).usuario.id
} elseif ($registroPai.code -eq 400) {
  Write-Output "INFO  pai ja existe de execucao anterior (reuso)"
}
$loginPai = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.atestado.pai@x.com"; senha = "SenhaAtest123" } $null
$tokenPai = $null
if ($loginPai.code -eq 200) { $tokenPai = ($loginPai.body | ConvertFrom-Json).token }
Check "Login pai" ($tokenPai -ne $null) ("[HTTP " + $loginPai.code + "]")

# ===== 3. Pre-cadastro vinculado =====
$cad = Invoke-JsonSend "POST" "/api/cadastro" @{
  nome             = "Aluno Teste Atestado"
  matricula        = "990101"
  cpfAluno         = "99100000167"
  responsavelNome  = "Pai Teste Atestado"
  cpf              = "99100000248"
  responsavel2Nome = "Mae Teste Atestado"
  cpf2             = "99100000329"
  status           = "PENDENTE_VALIDACAO"
  usuario_id       = $paiId
} $null
Check "Pre-cadastro atestado" (($cad.code -eq 201) -or ($cad.code -eq 400)) ("[HTTP " + $cad.code + "]")

# Acha o aluno pela matricula
$alunoId = $null
$admLista = Invoke-GetAuth "/api/admin/alunos" $tokenAdmin
if ($admLista.code -eq 200) {
  $arr = $admLista.body | ConvertFrom-Json
  if ($arr -isnot [array]) {
    if ($arr.alunos) { $arr = $arr.alunos } else { $arr = @($arr) }
  }
  foreach ($a in $arr) {
    if ($a -and ($a.matricula -eq "990101")) { $alunoId = $a.id }
  }
}
Check "Aluno de teste localizado" ($alunoId -ne $null) ("[HTTP " + $admLista.code + "]")

if ($alunoId) {
  # ===== 4. Regressao: sem anexo continua funcionando =====
  $semAnexo = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{
    aluno_id = $alunoId; texto = "Anotacao sem anexo (regressao)."
  } $tokenPai
  Check "Acompanhamento sem anexo -> 201" ($semAnexo.code -eq 201) ("[HTTP " + $semAnexo.code + "]")

  # ===== 5. Validacoes do anexo =====
  $tipoRuim = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{
    aluno_id = $alunoId; texto = "Tipo invalido."; atestado = "data:text/plain;base64,SGVsbG8="
  } $tokenPai
  Check "Anexo texto simples -> 400" ($tipoRuim.code -eq 400) ("[HTTP " + $tipoRuim.code + "]")

  $grande = "data:application/pdf;base64," + [string]::new([char]65, 2900000)
  $anexoGrande = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{
    aluno_id = $alunoId; texto = "Anexo gigante."; atestado = $grande
  } $tokenPai
  Check "Anexo >2MB -> 400" ($anexoGrande.code -eq 400) ("[HTTP " + $anexoGrande.code + "]")

  # ===== 6. Anexo PDF valido =====
  $pdfOk = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{
    aluno_id = $alunoId; texto = "Filho com atestado medico (pdf)."
    atestado = $pdfTeste; atestado_nome = "atestado-e2e.pdf"
  } $tokenPai
  Check "Anexo PDF valido -> 201" ($pdfOk.code -eq 201) ("[HTTP " + $pdfOk.code + "]")

  # ===== 7. Anexo de imagem valido =====
  $pngOk = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{
    aluno_id = $alunoId; texto = "Filho com atestado (foto)."
    atestado = $png1px; atestado_nome = "atestado-e2e.png"
  } $tokenPai
  Check "Anexo PNG valido -> 201" ($pngOk.code -eq 201) ("[HTTP " + $pngOk.code + "]")

  # ===== 8. Painel do pai ve os anexos =====
  $painel = Invoke-GetAuth "/api/painel/alunos" $tokenPai
  $temPdf = $false; $temPng = $false
  if ($painel.code -eq 200) {
    $pd = $painel.body | ConvertFrom-Json
    $lista = @()
    if ($pd.alunos) { $lista = @($pd.alunos) }
    foreach ($f in $lista) {
      if ($f -and ($f.matricula -eq "990101") -and $f.acompanhamentos) {
        foreach ($ac in @($f.acompanhamentos)) {
          if ($ac.atestado_nome -eq "atestado-e2e.pdf" -and $ac.atestado_base64 -like "data:application/pdf*") { $temPdf = $true }
          if ($ac.atestado_nome -eq "atestado-e2e.png" -and $ac.atestado_base64 -like "data:image/png*") { $temPng = $true }
        }
      }
    }
  }
  Check "Painel do pai ve anexo PDF" ($painel.code -eq 200 -and $temPdf) ("[HTTP " + $painel.code + "]")
  Check "Painel do pai ve anexo PNG" ($painel.code -eq 200 -and $temPng) ("[HTTP " + $painel.code + "]")

  # ===== 9. Feed do professor ve os anexos =====
  $profFeed = Invoke-GetAuth "/api/professor/alunos" $tokenAdmin
  Check "Feed professor contem atestado-e2e.pdf" (($profFeed.code -eq 200) -and ($profFeed.body -match "atestado-e2e\.pdf")) ("[HTTP " + $profFeed.code + "]")
  Check "Feed professor traz atestado_base64" ($profFeed.body -match "atestado_base64") ""

  # ===== 10. Diretoria ve os anexos =====
  $dirFeed = Invoke-GetAuth "/api/diretoria/acompanhamentos" $tokenAdmin
  Check "Feed diretoria contem atestado-e2e.pdf" (($dirFeed.code -eq 200) -and ($dirFeed.body -match "atestado-e2e\.pdf")) ("[HTTP " + $dirFeed.code + "]")
  Check "Feed diretoria traz atestado_base64" ($dirFeed.body -match "atestado_base64") ""

  # ===== 11. Secretaria lista os atestados =====
  $secAt = Invoke-GetAuth "/api/secretaria/atestados" $tokenAdmin
  $secTemPdf = $false; $secTemPng = $false; $secCount = 0
  if ($secAt.code -eq 200) {
    $sd = $secAt.body | ConvertFrom-Json
    if ($sd.atestados) {
      $listaAt = @($sd.atestados)
      $secCount = $listaAt.Count
      foreach ($at in $listaAt) {
        if ($at.atestado_nome -eq "atestado-e2e.pdf") { $secTemPdf = $true }
        if ($at.atestado_nome -eq "atestado-e2e.png") { $secTemPng = $true }
      }
    }
  }
  Check "Secretaria lista os 2 atestados" (($secAt.code -eq 200) -and $secTemPdf -and $secTemPng) ("count=" + $secCount)
}

# ===== 12. Permissoes =====
$atSemTok = Invoke-GetAuth "/api/secretaria/atestados" $null
Check "GET atestados sem token -> 401" ($atSemTok.code -eq 401) ("[HTTP " + $atSemTok.code + "]")

$atPai = Invoke-GetAuth "/api/secretaria/atestados" $tokenPai
Check "GET atestados como pai -> 403" ($atPai.code -eq 403) ("[HTTP " + $atPai.code + "]")

$acSemTok = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{ aluno_id = 1; texto = "x" } $null
Check "POST acompanhamento sem token -> 401" ($acSemTok.code -eq 401) ("[HTTP " + $acSemTok.code + "]")

# ===== 13. Intruso (sem vinculo) nao anexa =====
$regIntr = Invoke-JsonSend "POST" "/api/auth/registro" @{
  nome = "Intruso Teste Atestado"; email = "e2e.atestado.intruso@x.com"; senha = "SenhaIntr123"
} $null
$intrusoId = $null
if ($regIntr.code -eq 201) { $intrusoId = ($regIntr.body | ConvertFrom-Json).usuario.id }
$loginIntr = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.atestado.intruso@x.com"; senha = "SenhaIntr123" } $null
$tokenIntruso = $null
if ($loginIntr.code -eq 200) { $tokenIntruso = ($loginIntr.body | ConvertFrom-Json).token }

if ($alunoId -and $tokenIntruso) {
  $intr = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{
    aluno_id = $alunoId; texto = "Vou tentar anexar."; atestado = $pdfTeste
  } $tokenIntruso
  Check "Intruso sem vinculo -> 403" ($intr.code -eq 403) ("[HTTP " + $intr.code + "]")
}

# ===== 14. Limpeza =====
if ($alunoId) {
  $delAluno = Invoke-DeleteAuth ("/api/admin/alunos/" + $alunoId) $tokenAdmin
  Check "Limpeza: aluno removido" (($delAluno -eq 200) -or ($delAluno -eq 204)) ("[HTTP " + $delAluno + "]")
}
foreach ($uid in @($paiId, $intrusoId)) {
  if ($uid) {
    $del = Invoke-DeleteAuth ("/api/admin/usuarios/" + $uid) $tokenAdmin
    Check ("Limpeza: usuario " + $uid + " removido") (($del -eq 200) -or ($del -eq 204)) ("[HTTP " + $del + "]")
  }
}
$paDepois = Invoke-GetAuth "/api/painel/alunos" $tokenPai
Check "Sessao do pai encerrada apos exclusao -> 401" ($paDepois.code -eq 401) ("[HTTP " + $paDepois.code + "]")

Write-Output ""
if ($script:failures -eq 0) {
  Write-Output "E2E ATESTADO: TUDO VERDE"
} else {
  Write-Output ("E2E ATESTADO: " + $script:failures + " FALHA(S)")
}
