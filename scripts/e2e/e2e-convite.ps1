# E2E — Link temporario de cadastro de TERCEIRO RESPONSAVEL (12h + aprovacao)
$ErrorActionPreference = "Continue"
$base = "http://127.0.0.1:8787"
$tmp = "C:\Users\Rene Silva\AppData\Local\Temp\opencode"
$bodyFile = Join-Path $tmp "e2e-body.json"
$payloadFile = Join-Path $tmp "e2e-payload.json"
$d1File = Join-Path $tmp "e2e-d1.sql"
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

# Leitura pontual no D1 local (sequencial - nunca em paralelo com outro execute)
function Invoke-D1Select($sql) {
  try {
    [System.IO.File]::WriteAllText($d1File, $sql)
    $errFile = Join-Path $tmp "e2e-d1-err.txt"
    Push-Location "E:\New Project\InformAluno\InformAluno\inform-aluno-api"
    $out = & npx wrangler d1 execute inform-aluno-db --local --json --file $d1File 2>$errFile
    Pop-Location
    $all = ($out | Out-String)
    if ([string]::IsNullOrWhiteSpace($all)) {
      $errTxt = ""
      if (Test-Path $errFile) { $errTxt = (Get-Content $errFile -Raw) }
      Write-Host ("INFO  d1 sem stdout. stderr: " + $errTxt.Substring(0, [Math]::Min(300, $errTxt.Length)))
      return $null
    }
    # Acha o '[' que INICIA uma linha (evita avisos tipo "▲ [WARN] ..." no meio)
    $ms = [regex]::Matches($all, '(?m)^[ \t]*\[')
    $startIdx = -1
    if ($ms.Count -gt 0) {
      $m = $ms[$ms.Count - 1]
      $startIdx = $m.Index + ($m.Value.Length - 1)
    }
    if ($startIdx -lt 0) { $startIdx = $all.IndexOf("[") }
    $j = $all.LastIndexOf("]")
    if ($startIdx -lt 0 -or $j -le $startIdx) {
      Write-Host ("INFO  d1 sem JSON. stdout: " + $all.Substring(0, [Math]::Min(300, $all.Length)))
      return $null
    }
    $json = $all.Substring($startIdx, $j - $startIdx + 1)
    $arr = $json | ConvertFrom-Json
    $first = $arr
    if ($arr -is [array]) { $first = $arr[0] }
    if ($first -and ($null -ne $first.results)) {
      # Virgula unaria: preserva o array (inclusive VAZIO) no retorno
      return ,@($first.results)
    }
    return $null
  } catch {
    Write-Host ("INFO  d1 parse falhou: " + $_.Exception.Message)
    return $null
  }
}

function Extract-Token($link) {
  if (-not $link) { return $null }
  $m = [regex]::Match([string]$link, "/convite/([0-9a-fA-F\-]+)")
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

$foto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

# ===== 1. Login admin =====
$loginAdmin = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "admin@informaluno.com"; senha = "admin123" } $null
$tokenAdmin = $null
if ($loginAdmin.code -eq 200) { $tokenAdmin = ($loginAdmin.body | ConvertFrom-Json).token }
Check "Login admin" ($tokenAdmin -ne $null) ("[HTTP " + $loginAdmin.code + "]")
if (-not $tokenAdmin) { Write-Output "SEM TOKEN ADMIN - abortando"; exit 1 }

# ===== 2. Pai vinculado + outro usuario sem vinculo =====
$regPai = Invoke-JsonSend "POST" "/api/auth/registro" @{
  nome = "Pai Teste Convite"; email = "e2e.convite.pai@x.com"; senha = "SenhaConv123"
} $null
$paiId = $null
if ($regPai.code -eq 201) { $paiId = ($regPai.body | ConvertFrom-Json).usuario.id }
elseif ($regPai.code -eq 400) { Write-Output "INFO  pai ja existe (reuso)" }
$loginPai = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.convite.pai@x.com"; senha = "SenhaConv123" } $null
$tokenPai = $null
if ($loginPai.code -eq 200) { $tokenPai = ($loginPai.body | ConvertFrom-Json).token }
Check "Login pai" ($tokenPai -ne $null) ("[HTTP " + $loginPai.code + "]")

$regOutro = Invoke-JsonSend "POST" "/api/auth/registro" @{
  nome = "Outro Teste Convite"; email = "e2e.convite.outro@x.com"; senha = "SenhaOut123"
} $null
$outroId = $null
if ($regOutro.code -eq 201) { $outroId = ($regOutro.body | ConvertFrom-Json).usuario.id }
$loginOutro = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.convite.outro@x.com"; senha = "SenhaOut123" } $null
$tokenOutro = $null
if ($loginOutro.code -eq 200) { $tokenOutro = ($loginOutro.body | ConvertFrom-Json).token }
Check "Login outro usuario" ($tokenOutro -ne $null) ("[HTTP " + $loginOutro.code + "]")

# ===== 3. Tres pre-cadastros (A: aprovacao via painel, B: rejeicao publica, C: aprovacao publica) =====
$matriculas = @{ A = "990201"; B = "990202"; C = "990203" }
$nomes = @{ A = "Aluno Convite A"; B = "Aluno Convite B"; C = "Aluno Convite C" }
$cpfs = @{
  A = @("99100000400", "99100000590", "99100000671")
  B = @("99100000752", "99100000833", "99100000914")
  C = @("99100001058", "99100001139", "99100001210")
}
$cadResp = @{}
foreach ($k in @("A", "B", "C")) {
  $r = Invoke-JsonSend "POST" "/api/cadastro" @{
    nome             = $nomes[$k]
    matricula        = $matriculas[$k]
    cpfAluno         = $cpfs[$k][0]
    responsavelNome  = "Pai Teste Convite"
    cpf              = $cpfs[$k][1]
    responsavel2Nome = "Mae Teste Convite"
    cpf2             = $cpfs[$k][2]
    status           = "PENDENTE_VALIDACAO"
    usuario_id       = $paiId
    # Regressao: o campo terceiro NAO deve mais ser aceito no cadastro —
    # convite de 3o existe apenas pelo botao + do hub (POST /api/convite/terceiro)
    terceiro         = @{ nome = "Terceiro Ignorado"; cpf = "99100002615"; foto = "data:image/jpeg;base64,AAAA" }
  } $null
  $cadResp[$k] = $r
  Check ("Pre-cadastro " + $k) (($r.code -eq 201) -or ($r.code -eq 400)) ("[HTTP " + $r.code + "]")
}

# A resposta nao sinaliza mais terceiro_solicitado (fluxo removido do form)
$cadAData = $null
if ($cadResp.A) { $cadAData = $cadResp.A.body | ConvertFrom-Json }
Check "Cadastro ignora bloco terceiro (convite so pelo +)" (($cadAData -ne $null) -and (-not $cadAData.terceiro_solicitado)) ("" + $cadAData.terceiro_solicitado)

# Localiza os 3 alunos
$alunoIds = @{}
$admLista = Invoke-GetAuth "/api/admin/alunos" $tokenAdmin
if ($admLista.code -eq 200) {
  $arr = $admLista.body | ConvertFrom-Json
  if ($arr -isnot [array]) {
    if ($arr.alunos) { $arr = $arr.alunos } else { $arr = @($arr) }
  }
  foreach ($a in $arr) {
    if ($a) {
      foreach ($k in @("A", "B", "C")) {
        if ($a.matricula -eq $matriculas[$k]) { $alunoIds[$k] = $a.id }
      }
    }
  }
}
Check "3 alunos localizados" (($alunoIds.A -ne $null) -and ($alunoIds.B -ne $null) -and ($alunoIds.C -ne $null)) ("" + $alunoIds.A + "," + $alunoIds.B + "," + $alunoIds.C)

# ===== 4. Permissoes de geracao =====
$gSemTok = Invoke-JsonSend "POST" "/api/convite/gerar" @{ aluno_id = $alunoIds.A } $null
Check "Gerar sem token -> 401" ($gSemTok.code -eq 401) ("[HTTP " + $gSemTok.code + "]")

$gOutro = Invoke-JsonSend "POST" "/api/convite/gerar" @{ aluno_id = $alunoIds.A } $tokenOutro
Check "Gerar sem vinculo -> 403" ($gOutro.code -eq 403) ("[HTTP " + $gOutro.code + "]")

# ===== 5. Geracao do link (12h) =====
$gA = Invoke-JsonSend "POST" "/api/convite/gerar" @{ aluno_id = $alunoIds.A } $tokenPai
$tokenA1 = $null; $linkA = $null
if ($gA.code -eq 201) {
  $gd = $gA.body | ConvertFrom-Json
  $linkA = $gd.link
  $tokenA1 = Extract-Token $gd.link
}
Check "Gerar link aluno A -> 201" ($gA.code -eq 201) ("[HTTP " + $gA.code + "]")
Check "Link aponta para /convite/<token>" ($tokenA1 -ne $null) ("" + $linkA)
$gAData = $null
if ($gA.code -eq 201) { $gAData = $gA.body | ConvertFrom-Json }
Check "Resposta informa 12 horas" (($gAData -ne $null) -and ($gAData.valido_por -eq "12 horas")) ("" + $gAData.valido_por)

# ===== 6. Le GET do convite =====
$getA1 = Invoke-GetAuth ("/api/convite/" + $tokenA1) $null
$getA1Data = $null
if ($getA1.code -eq 200) { $getA1Data = $getA1.body | ConvertFrom-Json }
Check "GET convite A -> 200" ($getA1.code -eq 200) ("[HTTP " + $getA1.code + "]")
Check "GET convite A traz tipo TERCEIRO_RESPONSAVEL" (($getA1Data -ne $null) -and ($getA1Data.tipo -eq "TERCEIRO_RESPONSAVEL")) ("" + $getA1Data.tipo)
Check "GET convite A traz o aluno" (($getA1Data -ne $null) -and ($getA1Data.aluno_nome -eq "Aluno Convite A")) ("" + $getA1Data.aluno_nome)

# ===== 7. Geracao de novo link substitui o anterior =====
$gA2 = Invoke-JsonSend "POST" "/api/convite/gerar" @{ aluno_id = $alunoIds.A } $tokenPai
$tokenA2 = $null
if ($gA2.code -eq 201) { $tokenA2 = Extract-Token ($gA2.body | ConvertFrom-Json).link }
Check "Segunda geracao -> 201" ($gA2.code -eq 201) ("[HTTP " + $gA2.code + "]")
Check "Token novo diferente do antigo" (($tokenA2 -ne $null) -and ($tokenA2 -ne $tokenA1)) ("" + $tokenA2)
$getVelho = Invoke-GetAuth ("/api/convite/" + $tokenA1) $null
Check "Link antigo substituido -> 410" ($getVelho.code -eq 410) ("[HTTP " + $getVelho.code + "]")
$getA2 = Invoke-GetAuth ("/api/convite/" + $tokenA2) $null
Check "Link novo ativo -> 200" ($getA2.code -eq 200) ("[HTTP " + $getA2.code + "]")

# ===== 8. Painel so mostra apos o terceiro preencher =====
$pl1 = Invoke-GetAuth "/api/painel/convites" $tokenPai
$pl1Count = -1
if ($pl1.code -eq 200) {
  $pl1Data = $pl1.body | ConvertFrom-Json
  if ($pl1Data.convites) { $pl1Count = @($pl1Data.convites).Count } else { $pl1Count = 0 }
}
Check "Painel sem pendencia ainda -> 0" (($pl1.code -eq 200) -and ($pl1Count -eq 0)) ("count=" + $pl1Count)

# ===== 9. Validacoes do preenchimento do terceiro =====
$semFoto = Invoke-JsonSend "POST" ("/api/convite/" + $tokenA2 + "/cadastrar") @{
  nome = "Terceiro A"; cpf = "99100001309"
} $null
Check "Sem foto -> 400" ($semFoto.code -eq 400) ("[HTTP " + $semFoto.code + "]")

$cpfCurto = Invoke-JsonSend "POST" ("/api/convite/" + $tokenA2 + "/cadastrar") @{
  nome = "Terceiro A"; cpf = "123"; foto = $foto
} $null
Check "CPF curto -> 400" ($cpfCurto.code -eq 400) ("[HTTP " + $cpfCurto.code + "]")

# ===== 10. Preenchimento valido -> aguarda aprovacao por e-mail =====
$cadA = Invoke-JsonSend "POST" ("/api/convite/" + $tokenA2 + "/cadastrar") @{
  nome = "Terceiro A Teste"; cpf = "99100001309"; telefone = ""; foto = $foto
} $null
$cadAData = $null
if ($cadA.code -eq 201) { $cadAData = $cadA.body | ConvertFrom-Json }
Check "Preenchimento terceiro A -> 201" ($cadA.code -eq 201) ("[HTTP " + $cadA.code + "]")
Check "Resposta sinaliza TERCEIRO_RESPONSAVEL" (($cadAData -ne $null) -and ($cadAData.tipo -eq "TERCEIRO_RESPONSAVEL")) ("" + $cadAData.tipo)
Check "Mensagem fala em aprovacao" (($cadAData -ne $null) -and ($cadAData.message -match "aprov")) ""

$getDepois = Invoke-GetAuth ("/api/convite/" + $tokenA2) $null
Check "Link nao reabre apos preencher -> 410" ($getDepois.code -eq 410) ("[HTTP " + $getDepois.code + "]")

# ===== 11. Painel mostra a pendencia =====
$pl2 = Invoke-GetAuth "/api/painel/convites" $tokenPai
$pl2Count = 0; $pl2Aluno = ""
if ($pl2.code -eq 200) {
  $pl2Data = $pl2.body | ConvertFrom-Json
  if ($pl2Data.convites) {
    $itens = @($pl2Data.convites)
    $pl2Count = $itens.Count
    if ($pl2Count -gt 0) { $pl2Aluno = [string]$itens[0].aluno_nome }
  }
}
Check "Painel lista 1 pendencia" (($pl2.code -eq 200) -and ($pl2Count -eq 1)) ("count=" + $pl2Count)
Check "Pendencia aponta o aluno A" ($pl2Aluno -eq "Aluno Convite A") ("" + $pl2Aluno)

# ===== 12. 12h + token de aprovacao (leitura direta no banco) =====
$rows = Invoke-D1Select ("SELECT aprovacao_token, expira_em FROM autorizacoes_temporarias WHERE aluno_id = " + [string]$alunoIds.A + " AND tipo = 'TERCEIRO_RESPONSAVEL' AND status = 'AGUARDANDO_CONFIRMACAO';")
$aprovA = $null; $horasRestantes = -1
if ($rows -and ($rows.Count -gt 0)) {
  $aprovA = $rows[0].aprovacao_token
  $exp = [datetime]::ParseExact([string]$rows[0].expira_em, "yyyy-MM-dd HH:mm:ss", $null)
  $exp = [DateTime]::SpecifyKind($exp, [DateTimeKind]::Utc)
  $horasRestantes = ($exp - [DateTime]::UtcNow).TotalHours
}
Check "aprovacao_token gerado" ($aprovA -ne $null) ("" + $aprovA)
Check "Expiracao em ~12 horas" (($horasRestantes -gt 11.8) -and ($horasRestantes -lt 12.1)) ("restam " + [math]::Round($horasRestantes, 2) + "h")

# ===== 13. Pagina publica de aprovacao =====
$getApr = Invoke-GetAuth ("/api/aprovacao/" + $aprovA) $null
$getAprData = $null
if ($getApr.code -eq 200) { $getAprData = $getApr.body | ConvertFrom-Json }
Check "GET aprovacao -> 200" ($getApr.code -eq 200) ("[HTTP " + $getApr.code + "]")
Check "Aprovacao mostra solicitante" (($getAprData -ne $null) -and ($getAprData.terceiro_nome -eq "Terceiro A Teste")) ("" + $getAprData.terceiro_nome)
Check "Aprovacao mostra o aluno" (($getAprData -ne $null) -and ($getAprData.aluno_nome -eq "Aluno Convite A")) ("" + $getAprData.aluno_nome)

$getAprRuim = Invoke-GetAuth "/api/aprovacao/token-invalido-xyz" $null
Check "Token de aprovacao invalido -> 404" ($getAprRuim.code -eq 404) ("[HTTP " + $getAprRuim.code + "]")

# ===== 14. Regras de quem decide =====
$aprSemTok = Invoke-JsonSend "POST" ("/api/convite/" + $tokenA2 + "/aprovar") @{ decisao = "APROVAR" } $null
Check "Aprovar sem sessao -> 401" ($aprSemTok.code -eq 401) ("[HTTP " + $aprSemTok.code + "]")

$aprDecRuim = Invoke-JsonSend "POST" ("/api/convite/" + $tokenA2 + "/aprovar") @{ decisao = "TALVEZ" } $tokenPai
Check "Decisao invalida -> 400" ($aprDecRuim.code -eq 400) ("[HTTP " + $aprDecRuim.code + "]")

$aprOutro = Invoke-JsonSend "POST" ("/api/convite/" + $tokenA2 + "/aprovar") @{ decisao = "APROVAR" } $tokenOutro
Check "Outro responsavel (sem vinculo do aluno) -> 403" ($aprOutro.code -eq 403) ("[HTTP " + $aprOutro.code + "]")

# ===== 15. Aprovacao via painel do pai =====
$aprPai = Invoke-JsonSend "POST" ("/api/convite/" + $tokenA2 + "/aprovar") @{ decisao = "APROVAR" } $tokenPai
Check "Pai aprova -> 200" ($aprPai.code -eq 200) ("[HTTP " + $aprPai.code + "] " + $aprPai.body)

# ===== 16. Terceiro vira 3o responsavel =====
$cands = Invoke-GetAuth "/api/verificar/candidatos" $null
$tercA = $null
if ($cands.code -eq 200) {
  $arrC = $cands.body | ConvertFrom-Json
  if ($arrC -isnot [array]) { $arrC = @($arrC) }
  foreach ($cand in $arrC) {
    if ($cand -and ($cand.matricula -eq "990201")) { $tercA = $cand }
  }
}
Check "Aluno A reconhecido na portaria" ($tercA -ne $null) ""
Check "Terceiro A consta no candidato" (($tercA -ne $null) -and ($tercA.terceiro_nome -eq "Terceiro A Teste")) ("" + $tercA.terceiro_nome)
Check "Foto do terceiro disponivel" (($tercA -ne $null) -and ($tercA.foto_terceiro -like "data:image/png*")) ""

# ===== 17. Apos aprovar =====
$pl3 = Invoke-GetAuth "/api/painel/convites" $tokenPai
$pl3Count = -1
if ($pl3.code -eq 200) {
  $pl3Data = $pl3.body | ConvertFrom-Json
  if ($pl3Data.convites) { $pl3Count = @($pl3Data.convites).Count } else { $pl3Count = 0 }
}
Check "Pendencia some apos decisao -> 0" (($pl3.code -eq 200) -and ($pl3Count -eq 0)) ("count=" + $pl3Count)

$gDepois = Invoke-JsonSend "POST" "/api/convite/gerar" @{ aluno_id = $alunoIds.A } $tokenPai
Check "Gerar novo link com 3o ja aprovado -> 409" ($gDepois.code -eq 409) ("[HTTP " + $gDepois.code + "]")

$aprDedois = Invoke-JsonSend "POST" ("/api/aprovacao/" + $aprovA) @{ decisao = "APROVAR" } $null
Check "Decisao duplicada -> 410" ($aprDedois.code -eq 410) ("[HTTP " + $aprDedois.code + "]")

# ===== 18. Aluno B: REJEICAO pela rota publica =====
$gB = Invoke-JsonSend "POST" "/api/convite/gerar" @{ aluno_id = $alunoIds.B } $tokenPai
$tokenB = $null
if ($gB.code -eq 201) { $tokenB = Extract-Token ($gB.body | ConvertFrom-Json).link }
Check "Gerar link aluno B -> 201" ($gB.code -eq 201) ("[HTTP " + $gB.code + "]")
if ($tokenB) {
  $cadB = Invoke-JsonSend "POST" ("/api/convite/" + $tokenB + "/cadastrar") @{
    nome = "Terceiro B Teste"; cpf = "99100001481"; foto = $foto
  } $null
  Check "Preenchimento terceiro B -> 201" ($cadB.code -eq 201) ("[HTTP " + $cadB.code + "]")

  $rowsB = Invoke-D1Select ("SELECT aprovacao_token FROM autorizacoes_temporarias WHERE aluno_id = " + [string]$alunoIds.B + " AND tipo = 'TERCEIRO_RESPONSAVEL' AND status = 'AGUARDANDO_CONFIRMACAO';")
  $aprovB = $null
  if ($rowsB -and ($rowsB.Count -gt 0)) { $aprovB = $rowsB[0].aprovacao_token }
  Check "Token de aprovacao B gerado" ($aprovB -ne $null) ("" + $aprovB)

  if ($aprovB) {
    $rejB = Invoke-JsonSend "POST" ("/api/aprovacao/" + $aprovB) @{ decisao = "REJEITAR" } $null
    Check "Rejeicao publica -> 200" ($rejB.code -eq 200) ("[HTTP " + $rejB.code + "]")

    $getAprB = Invoke-GetAuth ("/api/aprovacao/" + $aprovB) $null
    Check "Apos rejeicao -> 410" ($getAprB.code -eq 410) ("[HTTP " + $getAprB.code + "]")
  }
}

# ===== 19. Aluno C: APROVACAO pela rota publica =====
$gC = Invoke-JsonSend "POST" "/api/convite/gerar" @{ aluno_id = $alunoIds.C } $tokenAdmin
$tokenC = $null
if ($gC.code -eq 201) { $tokenC = Extract-Token ($gC.body | ConvertFrom-Json).link }
Check "Admin gera link do aluno C -> 201" ($gC.code -eq 201) ("[HTTP " + $gC.code + "]")
if ($tokenC) {
  $cadC = Invoke-JsonSend "POST" ("/api/convite/" + $tokenC + "/cadastrar") @{
    nome = "Terceiro C Teste"; cpf = "99100001481"; foto = $foto
  } $null
  Check "Preenchimento terceiro C -> 201" ($cadC.code -eq 201) ("[HTTP " + $cadC.code + "]")

  $rowsC = Invoke-D1Select ("SELECT aprovacao_token FROM autorizacoes_temporarias WHERE aluno_id = " + [string]$alunoIds.C + " AND tipo = 'TERCEIRO_RESPONSAVEL' AND status = 'AGUARDANDO_CONFIRMACAO';")
  $aprovC = $null
  if ($rowsC -and ($rowsC.Count -gt 0)) { $aprovC = $rowsC[0].aprovacao_token }
  Check "Token de aprovacao C gerado" ($aprovC -ne $null) ("" + $aprovC)

  if ($aprovC) {
    $aprC = Invoke-JsonSend "POST" ("/api/aprovacao/" + $aprovC) @{ decisao = "APROVAR" } $null
    Check "Aprovacao publica -> 200" ($aprC.code -eq 200) ("[HTTP " + $aprC.code + "]")
  }
}

$cands2 = Invoke-GetAuth "/api/verificar/candidatos" $null
$tercB = $null; $tercC = $null
if ($cands2.code -eq 200) {
  $arrC2 = $cands2.body | ConvertFrom-Json
  if ($arrC2 -isnot [array]) { $arrC2 = @($arrC2) }
  foreach ($cand in $arrC2) {
    if ($cand -and ($cand.matricula -eq "990202")) { $tercB = $cand }
    if ($cand -and ($cand.matricula -eq "990203")) { $tercC = $cand }
  }
}
Check "Aluno B rejeitado SEM 3o" (($tercB -ne $null) -and (-not $tercB.terceiro_nome)) ("" + $tercB.terceiro_nome)
Check "Aluno C aprovado COM 3o" (($tercC -ne $null) -and ($tercC.terceiro_nome -eq "Terceiro C Teste")) ("" + $tercC.terceiro_nome)

# ===== 20. Regressao do CONVIDADO de portaria (fluxo antigo) =====
if ($alunoIds.A -and $paiId) {
  $insSql = "INSERT INTO autorizacoes_temporarias (responsavel_id, aluno_id, token, tipo, status, expira_em) VALUES (" + [string]$paiId + ", " + [string]$alunoIds.A + ", 'e2e-convidado-legacy', 'CONVIDADO_PORTARIA', 'AGUARDANDO_CADASTRO', datetime('now','+12 hours'));"
  $rowsIns = Invoke-D1Select $insSql
  $insOk = $false
  if ($rowsIns -is [array]) { $insOk = $true }
  Check "Linha CONVIDADO inserida (d1 sequencial)" $insOk ""

  $getCv = Invoke-GetAuth "/api/convite/e2e-convidado-legacy" $null
  $getCvData = $null
  if ($getCv.code -eq 200) { $getCvData = $getCv.body | ConvertFrom-Json }
  Check "GET convidado -> 200" ($getCv.code -eq 200) ("[HTTP " + $getCv.code + "]")
  Check "Convidado mantem tipo CONVIDADO_PORTARIA" (($getCvData -ne $null) -and ($getCvData.tipo -eq "CONVIDADO_PORTARIA")) ("" + $getCvData.tipo)

  $cadCv = Invoke-JsonSend "POST" "/api/convite/e2e-convidado-legacy/cadastrar" @{
    nome = "Convidado Legado"; cpf = "99100000167"; telefone = "7199999"; foto = $foto
  } $null
  $cadCvData = $null
  if ($cadCv.code -eq 201) { $cadCvData = $cadCv.body | ConvertFrom-Json }
  Check "Cadastro convidado legado -> 201" ($cadCv.code -eq 201) ("[HTTP " + $cadCv.code + "]")
  Check "Convidado responde tipo CONVIDADO_PORTARIA" (($cadCvData -ne $null) -and ($cadCvData.tipo -eq "CONVIDADO_PORTARIA")) ("" + $cadCvData.tipo)
  Check "Convidado NAO dispara aprovacao" ($cadCv.body -notmatch "aprovacao") ""

  $getCv2 = Invoke-GetAuth "/api/convite/e2e-convidado-legacy" $null
  Check "Convidado nao reabre -> 410" ($getCv2.code -eq 410) ("[HTTP " + $getCv2.code + "]")

  $plCv = Invoke-GetAuth "/api/painel/convites" $tokenPai
  $plCvCount = -1
  if ($plCv.code -eq 200) {
    $plCvData = $plCv.body | ConvertFrom-Json
    if ($plCvData.convites) { $plCvCount = @($plCvData.convites).Count } else { $plCvCount = 0 }
  }
  Check "Convidado NAO aparece como pendencia de 3o -> 0" (($plCv.code -eq 200) -and ($plCvCount -eq 0)) ("count=" + $plCvCount)
}

# ===== 21. Hub: cartoes dos filhos + terceiro para aluno JA cadastrado =====
# Cartoes da conta do pai (formato usado na tela de cadastro)
$filhosRes = Invoke-GetAuth "/api/painel/filhos" $tokenPai
$filhosCount = -1; $achouCartaoA = $false; $paiCartao = ""; $maeCartao = ""
if ($filhosRes.code -eq 200) {
  $filhosData = $filhosRes.body | ConvertFrom-Json
  if ($filhosData.filhos) {
    $listaFilhos = @($filhosData.filhos)
    $filhosCount = $listaFilhos.Count
    foreach ($fl in $listaFilhos) {
      if ($fl -and ($fl.nome -eq "Aluno Convite A")) {
        $achouCartaoA = $true
        $paiCartao = [string]$fl.pai
        $maeCartao = [string]$fl.mae
      }
    }
  } else { $filhosCount = 0 }
}
Check "Cartoes: GET filhos -> 200" ($filhosRes.code -eq 200) ("[HTTP " + $filhosRes.code + "]")
Check "Cartoes: lista contem o aluno A" $achouCartaoA ("count=" + $filhosCount)
Check "Cartoes: traz o pai" ($paiCartao -eq "Pai Teste Convite") ("" + $paiCartao)
Check "Cartoes: traz a mae" ($maeCartao -eq "Mae Teste Convite") ("" + $maeCartao)

# Permissoes da nova rota
$tSemTok = Invoke-JsonSend "POST" "/api/convite/terceiro" @{
  aluno_id = $alunoIds.B; nome = "Terceiro Hub"; cpf = "99100002534"; foto = $foto
} $null
Check "Hub terceiro sem sessao -> 401" ($tSemTok.code -eq 401) ("[HTTP " + $tSemTok.code + "]")

$tSemVinc = Invoke-JsonSend "POST" "/api/convite/terceiro" @{
  aluno_id = $alunoIds.B; nome = "Terceiro Hub"; cpf = "99100002534"; foto = $foto
} $tokenOutro
Check "Hub terceiro sem vinculo -> 403" ($tSemVinc.code -eq 403) ("[HTTP " + $tSemVinc.code + "]")

$tAlunoRuim = Invoke-JsonSend "POST" "/api/convite/terceiro" @{
  aluno_id = 999999; nome = "Terceiro Hub"; cpf = "99100002534"; foto = $foto
} $tokenPai
Check "Hub terceiro aluno inexistente -> 404" ($tAlunoRuim.code -eq 404) ("[HTTP " + $tAlunoRuim.code + "]")

# Validacoes do preenchimento
$tSemFoto = Invoke-JsonSend "POST" "/api/convite/terceiro" @{
  aluno_id = $alunoIds.B; nome = "Terceiro Hub"; cpf = "99100002534"
} $tokenPai
Check "Hub terceiro sem foto -> 400" ($tSemFoto.code -eq 400) ("[HTTP " + $tSemFoto.code + "]")

$tCpfCurto = Invoke-JsonSend "POST" "/api/convite/terceiro" @{
  aluno_id = $alunoIds.B; nome = "Terceiro Hub"; cpf = "123"; foto = $foto
} $tokenPai
Check "Hub terceiro CPF curto -> 400" ($tCpfCurto.code -eq 400) ("[HTTP " + $tCpfCurto.code + "]")

$tCpfPai = Invoke-JsonSend "POST" "/api/convite/terceiro" @{
  aluno_id = $alunoIds.B; nome = "Terceiro Hub"; cpf = "99100000833"; foto = $foto
} $tokenPai
Check "Hub terceiro CPF igual ao do pai -> 400" ($tCpfPai.code -eq 400) ("[HTTP " + $tCpfPai.code + "]")

$tCpfDup = Invoke-JsonSend "POST" "/api/convite/terceiro" @{
  aluno_id = $alunoIds.B; nome = "Terceiro Hub"; cpf = "99100000590"; foto = $foto
} $tokenPai
Check "Hub terceiro CPF ja cadastrado -> 409" ($tCpfDup.code -eq 409) ("[HTTP " + $tCpfDup.code + "]")

$tCom3 = Invoke-JsonSend "POST" "/api/convite/terceiro" @{
  aluno_id = $alunoIds.A; nome = "Terceiro Hub"; cpf = "99100002534"; foto = $foto
} $tokenPai
Check "Hub terceiro para aluno que ja tem 3o -> 409" ($tCom3.code -eq 409) ("[HTTP " + $tCom3.code + "]")

# Solicitacao valida no aluno B (foi rejeitado no fluxo de link antes)
$tOk = Invoke-JsonSend "POST" "/api/convite/terceiro" @{
  aluno_id = $alunoIds.B; nome = "Terceiro Hub Teste"; cpf = "99100002534"; foto = $foto
} $tokenPai
Check "Hub terceiro valido no aluno B -> 201" ($tOk.code -eq 201) ("[HTTP " + $tOk.code + "] " + $tOk.body)

$plHub = Invoke-GetAuth "/api/painel/convites" $tokenPai
$plHubCount = -1; $plHubAluno = ""; $plHubConvidado = ""; $plHubToken = $null
if ($plHub.code -eq 200) {
  $plHubData = $plHub.body | ConvertFrom-Json
  if ($plHubData.convites) {
    $itensHub = @($plHubData.convites)
    $plHubCount = $itensHub.Count
    if ($plHubCount -gt 0) {
      $plHubAluno = [string]$itensHub[0].aluno_nome
      $plHubConvidado = [string]$itensHub[0].convidado_nome
      $plHubToken = $itensHub[0].token
    }
  }
}
Check "Hub: painel lista 1 pendencia" (($plHub.code -eq 200) -and ($plHubCount -eq 1)) ("count=" + $plHubCount)
Check "Hub: pendencia do aluno B" ($plHubAluno -eq "Aluno Convite B") ("" + $plHubAluno)
Check "Hub: convidado preenchido" ($plHubConvidado -eq "Terceiro Hub Teste") ("" + $plHubConvidado)

# Banco: linha pronta + 12h + token de aprovacao
$rowsHub = Invoke-D1Select ("SELECT aprovacao_token, expira_em FROM autorizacoes_temporarias WHERE aluno_id = " + [string]$alunoIds.B + " AND tipo = 'TERCEIRO_RESPONSAVEL' AND status = 'AGUARDANDO_CONFIRMACAO';")
$aprovHub = $null; $horasHub = -1
if ($rowsHub -and ($rowsHub.Count -gt 0)) {
  $aprovHub = $rowsHub[0].aprovacao_token
  $expHub = [datetime]::ParseExact([string]$rowsHub[0].expira_em, "yyyy-MM-dd HH:mm:ss", $null)
  $expHub = [DateTime]::SpecifyKind($expHub, [DateTimeKind]::Utc)
  $horasHub = ($expHub - [DateTime]::UtcNow).TotalHours
}
Check "Hub: aprovacao_token gerado" ($aprovHub -ne $null) ("" + $aprovHub)
Check "Hub: expiracao ~12 horas" (($horasHub -gt 11.8) -and ($horasHub -lt 12.1)) ("restam " + [math]::Round($horasHub, 2) + "h")

$getAprHub = Invoke-GetAuth ("/api/aprovacao/" + $aprovHub) $null
$getAprHubData = $null
if ($getAprHub.code -eq 200) { $getAprHubData = $getAprHub.body | ConvertFrom-Json }
Check "Hub: GET aprovacao -> 200" ($getAprHub.code -eq 200) ("[HTTP " + $getAprHub.code + "]")
Check "Hub: aprovacao mostra o terceiro" (($getAprHubData -ne $null) -and ($getAprHubData.terceiro_nome -eq "Terceiro Hub Teste")) ("" + $getAprHubData.terceiro_nome)

# Aprovacao via painel e reconhecimento na portaria
$aprHub = Invoke-JsonSend "POST" ("/api/convite/" + $plHubToken + "/aprovar") @{ decisao = "APROVAR" } $tokenPai
Check "Hub: pai aprova -> 200" ($aprHub.code -eq 200) ("[HTTP " + $aprHub.code + "] " + $aprHub.body)

$candsHub = Invoke-GetAuth "/api/verificar/candidatos" $null
$tercHub = $null
if ($candsHub.code -eq 200) {
  $arrHub = $candsHub.body | ConvertFrom-Json
  if ($arrHub -isnot [array]) { $arrHub = @($arrHub) }
  foreach ($cand in $arrHub) {
    if ($cand -and ($cand.matricula -eq "990202")) { $tercHub = $cand }
  }
}
Check "Hub: aluno B reconhecido com 3o na portaria" (($tercHub -ne $null) -and ($tercHub.terceiro_nome -eq "Terceiro Hub Teste")) ("" + $tercHub.terceiro_nome)

$plHub2 = Invoke-GetAuth "/api/painel/convites" $tokenPai
$plHub2Count = -1
if ($plHub2.code -eq 200) {
  $plHub2Data = $plHub2.body | ConvertFrom-Json
  if ($plHub2Data.convites) { $plHub2Count = @($plHub2Data.convites).Count } else { $plHub2Count = 0 }
}
Check "Hub: pendencia some apos decisao -> 0" (($plHub2.code -eq 200) -and ($plHub2Count -eq 0)) ("count=" + $plHub2Count)

# ===== 22. Limpeza =====
if ($alunoIds.A -and $alunoIds.B -and $alunoIds.C) {
  $delSql = "DELETE FROM autorizacoes_temporarias WHERE aluno_id IN (" + [string]$alunoIds.A + "," + [string]$alunoIds.B + "," + [string]$alunoIds.C + ");"
  $delRows = Invoke-D1Select $delSql
  $delOk = $false
  if ($delRows -is [array]) { $delOk = $true }
  Check "Limpeza: convites removidos (d1 sequencial)" $delOk ""
} else {
  Check "Limpeza: convites removidos (d1 sequencial)" $false "ids de aluno incompletos"
}

foreach ($k in @("A", "B", "C")) {
  if ($alunoIds[$k]) {
    $del = Invoke-DeleteAuth ("/api/admin/alunos/" + $alunoIds[$k]) $tokenAdmin
    Check ("Limpeza: aluno " + $k + " removido") (($del -eq 200) -or ($del -eq 204)) ("[HTTP " + $del + "]")
  }
}
foreach ($uid in @($paiId, $outroId)) {
  if ($uid) {
    $del = Invoke-DeleteAuth ("/api/admin/usuarios/" + $uid) $tokenAdmin
    Check ("Limpeza: usuario " + $uid + " removido") (($del -eq 200) -or ($del -eq 204)) ("[HTTP " + $del + "]")
  }
}
$paDepois = Invoke-GetAuth "/api/painel/alunos" $tokenPai
Check "Sessao do pai encerrada apos exclusao -> 401" ($paDepois.code -eq 401) ("[HTTP " + $paDepois.code + "]")

Write-Output ""
if ($script:failures -eq 0) {
  Write-Output "E2E CONVITE 12H / TERCEIRO: TUDO VERDE"
} else {
  Write-Output ("E2E CONVITE 12H / TERCEIRO: " + $script:failures + " FALHA(S)")
}
