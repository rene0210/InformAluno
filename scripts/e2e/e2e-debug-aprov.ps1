# Debug puntual: reproduz a aprovacao 500 e imprime o corpo do erro
$ErrorActionPreference = "Continue"
$base = if ($env:API_URL) { $env:API_URL } else { "http://127.0.0.1:8787" }
$tmp = "C:\Users\Rene Silva\AppData\Local\Temp\opencode"
$bodyFile = Join-Path $tmp "e2e-body.json"
$payloadFile = Join-Path $tmp "e2e-payload.json"

function Invoke-JsonSend($metodo, $rota, $obj, $token) {
  $json = ConvertTo-Json $obj -Compress -Depth 8
  [System.IO.File]::WriteAllText($payloadFile, $json)
  $reqArgs = @("-s", "-o", $bodyFile, "-w", "%{http_code}", "-X", $metodo,
               "-H", "Content-Type: application/json", "-d", "@$payloadFile")
  if ($token) { $reqArgs += @("-H", ("Authorization: Bearer " + $token)) }
  $code = curl.exe @reqArgs ($base + $rota)
  $body = ""
  if (Test-Path $bodyFile) { $body = Get-Content $bodyFile -Raw -Encoding UTF8 }
  return @{ code = [int]$code; body = $body }
}
function Invoke-GetAuth($rota, $token) {
  $code = curl.exe -s -o $bodyFile -w "%{http_code}" -H ("Authorization: Bearer " + $token) ($base + $rota)
  $body = ""
  if (Test-Path $bodyFile) { $body = Get-Content $bodyFile -Raw -Encoding UTF8 }
  return @{ code = [int]$code; body = $body }
}

$foto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

# Login admin
# Credenciais de teste: so em .dev.vars (gitignored) — nada versionado.
. (Join-Path $PSScriptRoot "..\credenciais.ps1")
$la = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "admin@informaluno.com"; senha = $senhaAdmin } $null
$tokenAdmin = ($la.body | ConvertFrom-Json).token

# Pai
$rp = Invoke-JsonSend "POST" "/api/auth/registro" @{ nome = "Pai Debug Aprov"; email = "e2e.debug.pai@x.com"; senha = "SenhaDbg#12" } $null
$paiId = $null
if ($rp.code -eq 201) { $paiId = ($rp.body | ConvertFrom-Json).usuario.id }
$lp = Invoke-JsonSend "POST" "/api/auth/login" @{ email = "e2e.debug.pai@x.com"; senha = "SenhaDbg#12" } $null
$tokenPai = ($lp.body | ConvertFrom-Json).token
Write-Output ("paiId=" + $paiId + " login=" + $lp.code)

# Aluno
$cad = Invoke-JsonSend "POST" "/api/cadastro" @{
  nome = "Aluno Debug Aprov"; matricula = "990301"; cpfAluno = "99100001562"
  responsavelNome = "Pai Debug Aprov"; cpf = "99100001643"
  responsavel2Nome = "Mae Debug Aprov"; cpf2 = "99100001724"
  status = "PENDENTE_VALIDACAO"; usuario_id = $paiId
} $tokenPai
Write-Output ("cadastro=" + $cad.code + " body=" + $cad.body)

$alunoId = $null
$al = Invoke-GetAuth "/api/admin/alunos" $tokenAdmin
$arr = $al.body | ConvertFrom-Json
if ($arr -isnot [array]) { if ($arr.alunos) { $arr = $arr.alunos } else { $arr = @($arr) } }
foreach ($a in $arr) { if ($a -and $a.matricula -eq "990301") { $alunoId = $a.id } }
Write-Output ("alunoId=" + $alunoId)

# Gera e preenche
$g = Invoke-JsonSend "POST" "/api/convite/gerar" @{ aluno_id = $alunoId } $tokenPai
Write-Output ("gerar=" + $g.code + " body=" + $g.body)
$tok = $null
if ($g.code -eq 201) {
  $m = [regex]::Match((($g.body | ConvertFrom-Json).link), "/convite/([0-9a-fA-F\-]+)")
  if ($m.Success) { $tok = $m.Groups[1].Value }
}
$c = Invoke-JsonSend "POST" ("/api/convite/" + $tok + "/cadastrar") @{ nome = "Terceiro Debug"; cpf = "99100001805"; foto = $foto } $null
Write-Output ("cadastrar=" + $c.code + " body=" + $c.body)

# Painel de convites (duplicacao?)
$pc = Invoke-GetAuth "/api/painel/convites" $tokenPai
Write-Output ("convites=" + $pc.code + " body=" + $pc.body)

# Aprova com corpo cheio
$ap = Invoke-JsonSend "POST" ("/api/convite/" + $tok + "/aprovar") @{ decisao = "APROVAR" } $tokenPai
Write-Output ("APROVAR=" + $ap.code + " body=" + $ap.body)

# Candidatos
$cd = Invoke-GetAuth "/api/verificar/candidatos" $tokenPai
$cdArr = $cd.body | ConvertFrom-Json
if ($cdArr -isnot [array]) { $cdArr = @($cdArr) }
foreach ($x in $cdArr) { if ($x -and $x.matricula -eq "990301") { Write-Output ("candidato terceiro=" + $x.terceiro_nome) } }

# Limpeza
Invoke-JsonSend "DELETE" ("/api/admin/alunos/" + $alunoId) @{} $tokenAdmin | Out-Null
Invoke-JsonSend "DELETE" ("/api/admin/usuarios/" + $paiId) @{} $tokenAdmin | Out-Null
Write-Output "fim"
