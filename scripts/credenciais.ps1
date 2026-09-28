# ============================================================
# CREDENCIAIS DE TESTE — nunca versionadas
#
# Vem de inform-aluno-api/.dev.vars (gitignored, o MESMO arquivo que ja
# guarda RESEND_API_KEY e SMTP_PASS) ou das variaveis de ambiente (CI).
#
# Setup de um clone novo:
#   1) copie inform-aluno-api/.dev.vars.example para .dev.vars
#   2) preencha ADMIN_SENHA e ELENCO_SENHA
#
# Uso no script chamador (fica no MESMO escopo, por ser dot-source):
#   . (Join-Path $PSScriptRoot "..\credenciais.ps1")
# ============================================================

$credenciaisArquivo = Join-Path $PSScriptRoot "..\inform-aluno-api\.dev.vars"

function Ler-Credencial([string]$chave) {
  $v = [Environment]::GetEnvironmentVariable($chave)
  if ($v -and $v.Trim()) { return $v.Trim() }

  if (Test-Path $credenciaisArquivo) {
    foreach ($linha in Get-Content $credenciaisArquivo -Encoding UTF8) {
      $i = $linha.IndexOf("=")
      if ($i -gt 0 -and $linha.Substring(0, $i).Trim() -eq $chave) {
        $valor = $linha.Substring($i + 1).Trim()
        if ($valor) { return $valor }
      }
    }
  }
  return $null
}

# Credencial obrigatoria para todo e2e: encerra aqui com instrucoes claras,
# em vez de deixar o login falhar com "senha incorreta".
$senhaAdmin = Ler-Credencial "ADMIN_SENHA"
if (-not $senhaAdmin) {
  Write-Output "[credenciais] ADMIN_SENHA nao encontrada em inform-aluno-api/.dev.vars"
  Write-Output "  Copie .dev.vars.example para .dev.vars e preencha ADMIN_SENHA (arquivo local, nao vai para o Git)."
  exit 1
}
