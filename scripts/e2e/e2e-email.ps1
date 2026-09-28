# E2E — Notificacoes por e-mail (modo log OU SMTP real + gatilhos)
$ErrorActionPreference = "Continue"
$base = if ($env:API_URL) { $env:API_URL } else { "http://127.0.0.1:8787" }
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
  if (Test-Path $bodyFile) { $body = Get-Content $bodyFile -Raw -Encoding UTF8 }
  return @{ code = (Read-Code $code); body = $body }
}

function Invoke-GetAuth($rota, $token) {
  if ($token) {
    $code = curl.exe -s -o $bodyFile -w "%{http_code}" -H ("Authorization: Bearer " + $token) ($base + $rota)
  } else {
    $code = curl.exe -s -o $bodyFile -w "%{http_code}" ($base + $rota)
  }
  $body = ""
  if (Test-Path $bodyFile) { $body = Get-Content $bodyFile -Raw -Encoding UTF8 }
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
# Credenciais de teste: so em .dev.vars (gitignored) — nada versionado.
. (Join-Path $PSScriptRoot "..\credenciais.ps1")
$loginAdmin = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "admin@informaluno.com"; senha = $senhaAdmin } $null
$tokenAdmin = $null
if ($loginAdmin.code -eq 200) { $tokenAdmin = ($loginAdmin.body | ConvertFrom-Json).token }
Check "Login admin" ($tokenAdmin -ne $null) ("[HTTP " + $loginAdmin.code + "]")
if (-not $tokenAdmin) { Write-Output "SEM TOKEN ADMIN - abortando"; exit 1 }

# ===== 2. Rota de teste exige sessao =====
$semTok = Invoke-JsonSend "POST" "/api/admin/testar-email" @{} $null
Check "POST /api/admin/testar-email sem token -> 401" ($semTok.code -eq 401) ("[HTTP " + $semTok.code + "]")

# ===== 3. Destino invalido -> 400 =====
$paraRuim = Invoke-JsonSend "POST" "/api/admin/testar-email" @{ para = "nao-e-email" } $tokenAdmin
Check "Destino invalido -> 400" ($paraRuim.code -eq 400) ("[HTTP " + $paraRuim.code + "]")

# ===== 4. Envio de teste (modo log, SMTP ou Resend) + prova =====
# Destino configurável: a Resend em modo teste (sem domínio verificado)
# só aceita enviar para o e-mail verificado da conta — use
# E2E_EMAIL_DESTINO=seu.email@gmail.com para ter um envio real de ponta a ponta.
$destinoTeste = if ($env:E2E_EMAIL_DESTINO) { $env:E2E_EMAIL_DESTINO } else { "e2e.email.destino@x.com" }
$tst = Invoke-JsonSend "POST" "/api/admin/testar-email" @{ para = $destinoTeste } $tokenAdmin
$tstData = $null
if ($tst.code -eq 200) { $tstData = $tst.body | ConvertFrom-Json }
Check "Teste de e-mail responde 200" ($tst.code -eq 200) ("[HTTP " + $tst.code + "]")
# O modo depende do ambiente: com credencial (.dev.vars / secret) ele ENVIA,
# sem credencial fica em log. O e2e valida o comportamento do modo ativo.
$credencial = ($tstData -ne $null) -and ($tstData.configurado -eq $true)
# Resend em modo teste (conta sem domínio verificado) recusa terceiros com 403
# e orienta a verificar um domínio — comportamento documentado do provedor.
$restritoResend = ($tstData -ne $null) -and ($tstData.transporte -eq "resend") -and ("$($tstData.erro)" -match "verify a domain")
if ($credencial) {
  Check "Credencial de e-mail ativa -> configurado=true" ($tstData.configurado -eq $true) ("transporte=" + $tstData.transporte)
  if ($restritoResend) {
    Check "Resend em modo teste: terceiros exigem dominio verificado" $true $tstData.erro
  } else {
    Check "Credencial de e-mail ativa -> modo=enviado" ($tstData.modo -eq "enviado") ("modo=" + $tstData.modo + " erro=" + $tstData.erro)
  }
} else {
  Check "Sem credencial -> configurado=false" (($tstData -ne $null) -and (-not $tstData.configurado)) ("" + $tstData.configurado)
  Check "Sem credencial -> modo=log" (($tstData -ne $null) -and ($tstData.modo -eq "log")) ("" + $tstData.modo)
}
$provaEnvio = if ($restritoResend) {
  "Restricao da conta Resend (sem dominio verificado) — nao e falha do sistema"
} else {
  "" + $tstData.conexao
}
Check "Prova de envio (SMTP 220 ou aceite da Resend)" (($tstData -ne $null) -and (($tstData.conexao -like "OK*") -or $restritoResend)) $provaEnvio

# ===== 5. Auto-cadastro do pai -> gatilho boas-vindas =====
$rPai = Invoke-JsonSend "POST" "/api/auth/registro" @{ nome = "Pai Teste Email"; email = "e2e.email.pai@x.com"; senha = "SenhaPai#12" } $null
Check "Registro pai (gatilho boas-vindas)" ($rPai.code -eq 201) ("[HTTP " + $rPai.code + "]")
$paiId = $null
if ($rPai.code -eq 201) { $paiId = ($rPai.body | ConvertFrom-Json).usuario.id }

$loginPai = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.email.pai@x.com"; senha = "SenhaPai#12" } $null
$tokenPai = $null
if ($loginPai.code -eq 200) { $tokenPai = ($loginPai.body | ConvertFrom-Json).token }
Check "Login pai (senha original)" ($tokenPai -ne $null) ("[HTTP " + $loginPai.code + "]")

# ===== 6. Recuperacao de senha =====
# Sem credencial a API devolve o link na resposta (modo log puro). Com
# credencial o link NUNCA volta na resposta — sai por e-mail e, se o envio
# for recusado (ex.: Resend em modo teste), o e2e lê o token gravado no
# banco local (scripts/ler-token-reset.mjs) para concluir a troca.
$rec = Invoke-JsonSend "POST" "/api/recuperar-senha" @{ email = "e2e.email.pai@x.com" } $null
Check "Recuperar-senha responde 200" ($rec.code -eq 200) ("[HTTP " + $rec.code + "]")
$temLink = $false
$linkToken = $null
$origemToken = "sem token"
if ($rec.body -match "linkSimulado") {
  $temLink = $true
  $origemToken = "linkSimulado na resposta (modo log)"
  $m = [regex]::Match($rec.body, 'redefinir-senha/([0-9a-fA-F\-]+)')
  if ($m.Success) { $linkToken = $m.Groups[1].Value }
}
if (-not $linkToken) {
  $lido = @(node (Join-Path $PSScriptRoot "..\ler-token-reset.mjs") "e2e.email.pai@x.com" 2>$null)
  $cand = $lido | Where-Object { $_ -and $_.ToString().Trim() -ne "" } | Select-Object -Last 1
  if ($cand) {
    $linkToken = $cand.ToString().Trim()
    $temLink = $true
    $origemToken = "token lido do banco local (link saiu por e-mail)"
  }
}
Check "Token do reset obtido" ($temLink -and ($linkToken -ne $null)) $origemToken
Check "Link aponta para /redefinir-senha/<token>" (($linkToken -ne $null) -and ($linkToken.Length -gt 10)) ("" + $linkToken)

# ===== 7. Conclusao da troca -> gatilho confirmacao =====
if ($linkToken) {
  $troca = Invoke-JsonSend "POST" ("/api/recuperar-senha/" + $linkToken) @{
    nome     = "Pai Teste Email"
    cpf      = "95511122297"
    perguntas = @(
      @{ id = 1; resposta = "Roma" },
      @{ id = 2; resposta = "Berlim" },
      @{ id = 3; resposta = "Amarelo" }
    )
    novaSenha = "NovaSenha#45"
  } $null
  Check "Troca de senha concluida (gatilho confirmacao)" ($troca.code -eq 200) ("[HTTP " + $troca.code + "]")

  $loginNova = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.email.pai@x.com"; senha = "NovaSenha#45" } $null
  Check "Login com a NOVA senha" ($loginNova.code -eq 200) ("[HTTP " + $loginNova.code + "]")
  if ($loginNova.code -eq 200) { $tokenPai = ($loginNova.body | ConvertFrom-Json).token }
} else {
  Check "Troca de senha concluida (gatilho confirmacao)" $false "sem token de link"
}

# ===== 8. Usuario descartavel: gatilhos admin (senha + cargo) =====
$rUser = Invoke-JsonSend "POST" "/api/auth/registro" @{ nome = "User Teste Email"; email = "e2e.email.user@x.com"; senha = "SenhaUser#12" } $null
Check "Registro usuario descartavel" ($rUser.code -eq 201) ("[HTTP " + $rUser.code + "]")
$userId = $null
if ($rUser.code -eq 201) { $userId = ($rUser.body | ConvertFrom-Json).usuario.id }

if ($userId) {
  $aSenha = Invoke-JsonSend "PATCH" ("/api/admin/usuarios/" + $userId + "/senha") @{ novaSenha = "SenhaNova#78" } $tokenAdmin
  Check "Admin redefinir senha (gatilho)" ($aSenha.code -eq 200) ("[HTTP " + $aSenha.code + "]")

  $aRole = Invoke-JsonSend "PATCH" ("/api/admin/usuarios/" + $userId + "/role") @{ novoRole = "COORDENADOR" } $tokenAdmin
  Check "Admin alterar cargo (gatilho)" ($aRole.code -eq 200) ("[HTTP " + $aRole.code + "]")
}

$loginCoord = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.email.user@x.com"; senha = "SenhaNova#78" } $null
$tokenCoord = $null
if ($loginCoord.code -eq 200) { $tokenCoord = ($loginCoord.body | ConvertFrom-Json).token }
Check "Login coordenador (senha do admin funciona)" ($tokenCoord -ne $null) ("[HTTP " + $loginCoord.code + "]")

# ===== 9. Pre-cadastro vinculado ao pai -> gatilho pre-cadastro =====
$cad = Invoke-JsonSend "POST" "/api/cadastro" @{
  nome             = "Aluno Teste Email"
  matricula        = "990088"
  cpfAluno         = "95577788803"
  responsavelNome  = "Pai Teste Email"
  cpf              = "95511122297"
  responsavel2Nome = "Mae Teste Email"
  cpf2             = "95544455554"
  status           = "PENDENTE_VALIDACAO"
  usuario_id       = $paiId
} $tokenPai
Check "Pre-cadastro com vinculo (gatilho)" ($cad.code -eq 201) ("[HTTP " + $cad.code + "]")

# Acha o aluno de teste pelo admin
$alunoId = $null
$admLista = Invoke-GetAuth "/api/admin/alunos" $tokenAdmin
if ($admLista.code -eq 200) {
  $arr = $admLista.body | ConvertFrom-Json
  if ($arr -isnot [array]) {
    if ($arr.alunos) { $arr = $arr.alunos } else { $arr = @($arr) }
  }
  foreach ($a in $arr) {
    if ($a -and ($a.matricula -eq "990088")) { $alunoId = $a.id }
  }
}
Check "Admin lista pre-cadastros e acha o aluno" (($admLista.code -eq 200) -and ($alunoId -ne $null)) ("[HTTP " + $admLista.code + "]")

# ===== 10. Foto ajustada -> gatilho (helper compartilhado) =====
if ($alunoId) {
  $foto = Invoke-JsonSend "PATCH" ("/api/admin/alunos/" + $alunoId + "/foto") @{ alvo = "aluno"; foto = "data:image/jpeg;base64,E2EMAILFOTO001" } $tokenAdmin
  Check "Foto ajustada (gatilho foto)" ($foto.code -eq 200) ("[HTTP " + $foto.code + "]")
}

# ===== 11. Professor: notas + acompanhamento =====
$rProf = Invoke-JsonSend "POST" "/api/auth/registro" @{ nome = "Prof Teste Email"; email = "e2e.email.prof@x.com"; senha = "SenhaProf#12" } $null
Check "Registro professor" ($rProf.code -eq 201) ("[HTTP " + $rProf.code + "]")
$profId = $null
if ($rProf.code -eq 201) { $profId = ($rProf.body | ConvertFrom-Json).usuario.id }

if ($profId) {
  $promo = Invoke-JsonSend "PATCH" ("/api/admin/usuarios/" + $profId + "/role") @{ novoRole = "PROFESSOR" } $tokenAdmin
  Check "Promocao para PROFESSOR" ($promo.code -eq 200) ("[HTTP " + $promo.code + "]")
}

$loginProf = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.email.prof@x.com"; senha = "SenhaProf#12" } $null
$tokenProf = $null
if ($loginProf.code -eq 200) { $tokenProf = ($loginProf.body | ConvertFrom-Json).token }
Check "Login professor" ($tokenProf -ne $null) ("[HTTP " + $loginProf.code + "]")

if ($alunoId -and $tokenProf) {
  $n1 = Invoke-JsonSend "PUT" "/api/professor/notas" @{ aluno_id = $alunoId; bimestre = 1; materia = "Matemática"; nota = "7,5" } $tokenProf
  Check "Nota lancada 7,5 (gatilho nota)" ($n1.code -eq 200) ("[HTTP " + $n1.code + "]")

  $n2 = Invoke-JsonSend "PUT" "/api/professor/notas" @{ aluno_id = $alunoId; bimestre = 1; materia = "Matemática"; nota = "8,5" } $tokenProf
  Check "Nota corrigida 8,5 (gatilho correcao)" ($n2.code -eq 200) ("[HTTP " + $n2.code + "]")

  $nRuim = Invoke-JsonSend "PUT" "/api/professor/notas" @{ aluno_id = $alunoId; bimestre = 1; materia = "Matemática"; nota = "15" } $tokenProf
  Check "Nota 15 -> 400" ($nRuim.code -eq 400) ("[HTTP " + $nRuim.code + "]")

  $nBim = Invoke-JsonSend "PUT" "/api/professor/notas" @{ aluno_id = $alunoId; bimestre = 9; materia = "Matemática"; nota = "8" } $tokenProf
  Check "Bimestre 9 -> 400" ($nBim.code -eq 400) ("[HTTP " + $nBim.code + "]")

  $aProf = Invoke-JsonSend "POST" "/api/professor/acompanhamentos" @{ aluno_id = $alunoId; texto = "Dificuldade em matematica, refazer exercicios." } $tokenProf
  Check "Acomp. professor (gatilho responsavel)" ($aProf.code -eq 201) ("[HTTP " + $aProf.code + "]")
}

# ===== 12. Painel do pai: ve o filho (vinculo) =====
$paLista = Invoke-GetAuth "/api/painel/alunos" $tokenPai
$filhoOk = $false
if ($paLista.code -eq 200) {
  $arrP = $paLista.body | ConvertFrom-Json
  if ($arrP -isnot [array]) {
    if ($arrP.alunos) { $arrP = $arrP.alunos } else { $arrP = @($arrP) }
  }
  foreach ($a in $arrP) { if ($a -and ($a.matricula -eq "990088")) { $filhoOk = $true } }
}
Check "Pai lista o filho no painel" (($paLista.code -eq 200) -and $filhoOk) ("[HTTP " + $paLista.code + "]")

# ===== 13. Acompanhamento do pai -> gatilho professores+diretoria =====
if ($alunoId) {
  $aPai = Invoke-JsonSend "POST" "/api/painel/acompanhamentos" @{ aluno_id = $alunoId; texto = "Aluno acordou gripado hoje." } $tokenPai
  Check "Acomp. pai (gatilho escola)" ($aPai.code -eq 201) ("[HTTP " + $aPai.code + "]")

  # Feed da diretoria contem o aviso do pai
  $feed = Invoke-GetAuth "/api/diretoria/acompanhamentos" $tokenCoord
  Check "Coordenador ve o feed" ($feed.code -eq 200) ("[HTTP " + $feed.code + "]")
  Check "Feed contem o aviso do pai" (($feed.body -match "acordado gripado") -or ($feed.body -match "gripado")) ""

  # Regressao de permissoes
  $feedProf = Invoke-GetAuth "/api/diretoria/acompanhamentos" $tokenProf
  Check "Professor em /api/diretoria -> 403" ($feedProf.code -eq 403) ("[HTTP " + $feedProf.code + "]")

  $feedPai = Invoke-GetAuth "/api/diretoria/acompanhamentos" $tokenPai
  Check "Pai em /api/diretoria -> 403" ($feedPai.code -eq 403) ("[HTTP " + $feedPai.code + "]")
}

# ===== 14. Limpeza =====
if ($alunoId) {
  $delAluno = Invoke-DeleteAuth ("/api/admin/alunos/" + $alunoId) $tokenAdmin
  Check "Limpeza: aluno removido" (($delAluno -eq 200) -or ($delAluno -eq 204)) ("[HTTP " + $delAluno + "]")
}
foreach ($uid in @($profId, $userId, $paiId)) {
  if ($uid) {
    $del = Invoke-DeleteAuth ("/api/admin/usuarios/" + $uid) $tokenAdmin
    Check ("Limpeza: usuario " + $uid + " removido") (($del -eq 200) -or ($del -eq 204)) ("[HTTP " + $del + "]")
  }
}
$paDepois = Invoke-GetAuth "/api/painel/alunos" $tokenPai
Check "Sessao do pai encerrada apos exclusao -> 401" ($paDepois.code -eq 401) ("[HTTP " + $paDepois.code + "]")

Write-Output ""
if ($script:failures -eq 0) {
  Write-Output "E2E EMAIL/NOTIFICACOES: TUDO VERDE"
} else {
  Write-Output ("E2E EMAIL/NOTIFICACOES: " + $script:failures + " FALHA(S)")
}
