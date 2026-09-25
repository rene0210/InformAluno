// ============================================================
// TEMPLATES DE E-MAIL DO INFORMALUNO (HTML, pt-BR)
//
// Regra: todo texto vindo de usuário/banco (nomes, anotações)
// passa por esc() antes de entrar no HTML — evita injeção de
// marcação nas mensagens.
// ============================================================

const esc = (valor: unknown): string =>
  String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Rótulos amigáveis dos cargos do sistema
const rotuloCargo = (role: string): string => {
  const mapa: Record<string, string> = {
    ADMIN: "Administrador",
    DIRETOR: "Diretor",
    COORDENADOR: "Coordenador Pedagógico",
    PROFESSOR: "Professor",
    SECRETARIA: "Secretaria",
    PORTARIA: "Portaria",
    MOTORISTA: "Motorista da Van",
    RESPONSAVEL: "Pai / Responsável",
    GESTOR: "Gestor / Coordenação",
    ALUNO: "Aluno",
  };
  return mapa[role] || role;
};

// Layout comum: cabeçalho com marca, corpo e rodapé institucional
const layout = (
  titulo: string,
  corpo: string,
  botao?: { texto: string; url: string }
): string => `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="background:linear-gradient(135deg,#2563eb,#1e3a8a);padding:22px 28px;">
            <div style="color:#ffffff;font-size:20px;font-weight:bold;">&#127891; InformAluno</div>
            <div style="color:#bfdbfe;font-size:12px;margin-top:4px;">Comunicação escolar</div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px;color:#0f172a;font-size:15px;line-height:1.6;">
            <h1 style="margin:0 0 14px;font-size:18px;color:#1e3a8a;">${esc(titulo)}</h1>
            ${corpo}
            ${
              botao
                ? `<p style="text-align:center;margin:26px 0 8px;">
                    <a href="${esc(botao.url)}" style="background:#2563eb;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">${esc(botao.texto)}</a>
                  </p>
                  <p style="text-align:center;font-size:12px;color:#64748b;word-break:break-all;">Ou copie o link:<br>${esc(botao.url)}</p>`
                : ""
            }
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 28px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
            Mensagem automática do <strong>InformAluno</strong> — não responda este e-mail.<br>
            Se você não reconhece esta ação, entre em contato com a secretaria da unidade.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// Criação de conta (auto-cadastro)
export const emailBoasVindas = (nome: string, email: string, cargo: string): string =>
  layout(
    "Bem-vindo ao InformAluno!",
    `<p>Olá, <strong>${esc(nome)}</strong>! Sua conta foi criada com sucesso.</p>
     <table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;">
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">E-mail</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong>${esc(email)}</strong></td></tr>
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Cargo</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong>${esc(rotuloCargo(cargo))}</strong></td></tr>
     </table>
     <p>Já pode entrar no sistema usando este e-mail e a senha que você definiu.</p>`
  );

// Link de redefinição de senha (esqueci a senha)
export const emailResetSenha = (nome: string, link: string): string =>
  layout(
    "Redefinição de senha",
    `<p>Olá, <strong>${esc(nome)}</strong>.</p>
     <p>Recebemos um pedido para redefinir sua senha no InformAluno. Para escolher uma nova, clique no botão abaixo:</p>
     <p style="font-size:13px;color:#64748b;">O link é válido por <strong>30 minutos</strong> e só pode ser usado uma vez.</p>
     <p style="font-size:13px;color:#64748b;">Se não foi você quem pediu, ignore este e-mail — sua senha continua a mesma.</p>`,
    { texto: "Redefinir minha senha", url: link }
  );

// Confirmação após o próprio usuário trocar a senha
export const emailSenhaAlteradaPeloUsuario = (nome: string): string =>
  layout(
    "Sua senha foi alterada",
    `<p>Olá, <strong>${esc(nome)}</strong>.</p>
     <p>Sua senha foi redefinida com sucesso no InformAluno. Você já pode entrar com a nova senha.</p>
     <p style="font-size:13px;color:#64748b;"><strong>Não foi você?</strong> Entre em contato imediatamente com a secretaria da unidade.</p>`
  );

// Aviso quando a administração redefine a senha do usuário
export const emailSenhaRedefinidaPeloAdmin = (nome: string): string =>
  layout(
    "Sua senha foi redefinida pela administração",
    `<p>Olá, <strong>${esc(nome)}</strong>.</p>
     <p>A administração do InformAluno redefiniu a senha da sua conta. Use a nova senha que lhe foi informada para entrar.</p>
     <p style="font-size:13px;color:#64748b;">Por segurança, recomendamos trocar a senha após o primeiro acesso.</p>`
  );

// Aviso de mudança de cargo/perfil
export const emailCargoAlterado = (nome: string, de: string, para: string): string =>
  layout(
    "Seu cargo foi atualizado",
    `<p>Olá, <strong>${esc(nome)}</strong>.</p>
     <p>Seu cargo no InformAluno foi alterado:</p>
     <table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;">
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Antes</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong>${esc(rotuloCargo(de))}</strong></td></tr>
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Agora</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong>${esc(rotuloCargo(para))}</strong></td></tr>
     </table>
     <p>Da próxima vez que entrar, você terá acesso às telas do novo cargo.</p>`
  );

// Nota lançada ou corrigida pelo professor (aviso ao responsável)
export const emailNota = (
  aluno: string,
  bimestre: number,
  materia: string,
  nota: string,
  anterior: string | null
): string =>
  layout(
    anterior !== null
      ? `Nota corrigida — ${bimestre}º bimestre · ${esc(materia)}`
      : `Nova nota — ${bimestre}º bimestre · ${esc(materia)}`,
    `<p>Olá! Uma atualização de nota do(a) aluno(a) <strong>${esc(aluno)}</strong>:</p>
     <table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;">
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Bimestre</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong>${bimestre}º bimestre</strong></td></tr>
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Matéria</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong>${esc(materia)}</strong></td></tr>
       ${
         anterior !== null
           ? `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Anterior</td>
                 <td style="border:1px solid #e2e8f0;padding:8px 12px;">${esc(anterior)}</td></tr>
              <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Nova nota</td>
                 <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong style="color:#1e3a8a;font-size:17px;">${esc(nota)}</strong></td></tr>`
           : `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Nota</td>
                 <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong style="color:#1e3a8a;font-size:17px;">${esc(nota)}</strong></td></tr>`
       }
     </table>`
  );

// Acompanhamento do professor → responsável
export const emailAcompanhamentoResponsavel = (
  aluno: string,
  autor: string,
  texto: string,
  urlPainel: string
): string =>
  layout(
    "Observação do professor(a)",
    `<p>Olá! O(a) professor(a) <strong>${esc(autor)}</strong> registrou uma observação sobre
       <strong>${esc(aluno)}</strong>:</p>
     <blockquote style="margin:14px 0;padding:12px 16px;background:#f8fafc;border-left:4px solid #2563eb;border-radius:6px;color:#0f172a;">${esc(texto)}</blockquote>
     <p style="font-size:13px;color:#64748b;">Acompanhe notas e observações de todos os filhos no seu painel do responsável.</p>`,
    { texto: "Abrir meu painel", url: urlPainel }
  );

// Acompanhamento do pai → professores + diretoria
export const emailAcompanhamentoEscola = (
  aluno: string,
  autor: string,
  texto: string,
  urlPainel: string
): string =>
  layout(
    `Aviso do responsável — ${aluno}`,
    `<p>O(a) responsável <strong>${esc(autor)}</strong> registrou um aviso sobre
       <strong>${esc(aluno)}</strong>:</p>
     <blockquote style="margin:14px 0;padding:12px 16px;background:#f8fafc;border-left:4px solid #f59e0b;border-radius:6px;color:#0f172a;">${esc(texto)}</blockquote>
     <p style="font-size:13px;color:#64748b;">Consulte as demais anotações no painel da escola.</p>`,
    { texto: "Abrir painel da escola", url: urlPainel }
  );

// Foto ajustada pela secretaria/administração
export const emailFotoAtualizada = (aluno: string, alvo: string): string =>
  layout(
    "Foto atualizada",
    `<p>Informamos que a imagem ${esc(alvo)} do(a) aluno(a) <strong>${esc(aluno)}</strong>
       foi atualizada no sistema (cadastro/biometria da portaria).</p>
     <p style="font-size:13px;color:#64748b;">Se a imagem não está correta, procure a secretaria da unidade.</p>`
  );

// Dados do pai/mãe editados pelo card da tela de cadastro
// (pelos próprios pais ou pela secretaria) — avisa os responsáveis
export const emailDadosResponsavelAlterado = (
  aluno: string,
  editadoPor: string,
  alteracoes: string[]
): string => {
  const linhas = alteracoes
    .map(
      (a) =>
        `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px;">${esc(a)}</td></tr>`
    )
    .join("");
  return layout(
    "Dados do responsável atualizados",
    `<p>Os dados de contato do(a) aluno(a) <strong>${esc(aluno)}</strong> foram
       atualizados no InformAluno por <strong>${esc(editadoPor)}</strong>:</p>
     <table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;">${linhas}</table>
     <p style="font-size:13px;color:#64748b;">Se você não reconhece esta alteração, procure a secretaria da unidade.</p>`
  );
};

// Reconhecimento facial do aluno na VAN — avia responsáveis (pai/mãe),
// secretaria e coordenação com dia, hora e movimento (check-in/check-out).
export const emailReconhecimentoVan = (
  aluno: string,
  matricula: string,
  quando: string,
  movimento: string
): string =>
  layout(
    "Reconhecimento facial na van",
    `<p>O(a) aluno(a) <strong>${esc(aluno)}</strong> (matrícula ${esc(matricula)})
       realizou o reconhecimento facial e <strong>está na van</strong>.</p>
     <table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;">
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Movimento</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong>${
             movimento === "CHECKOUT" ? "Check-out (saída)" : "Check-in (entrada)"
           }</strong></td></tr>
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Data e hora</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong>${esc(quando)}</strong></td></tr>
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Local</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;">🚐 Van escolar</td></tr>
     </table>
     <p style="font-size:13px;color:#64748b;">Este aviso foi enviado aos responsáveis, à secretaria e à coordenação pedagógica.</p>`
  );

// Pré-cadastro de filho enviado pela conta do responsável
export const emailPreCadastro = (aluno: string, matricula: string): string =>
  layout(
    "Pré-cadastro enviado",
    `<p>Olá! O pré-cadastro do(a) aluno(a) <strong>${esc(aluno)}</strong> foi enviado com sucesso.</p>
     <table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;">
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Matrícula</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;"><strong>${esc(matricula)}</strong></td></tr>
       <tr><td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b;">Status</td>
           <td style="border:1px solid #e2e8f0;padding:8px 12px;">Aguardando validação na portaria</td></tr>
     </table>`
  );

// E-mail de teste disparado pelo painel do admin
export const emailTeste = (): string =>
  layout(
    "Teste de envio — InformAluno",
    `<p>Este é um e-mail de <strong>teste</strong> enviado pelo painel da administração do InformAluno.</p>
     <p>Se você está lendo isto, o SMTP está configurado e funcionando corretamente. ✅</p>`
  );

// Solicitação de APROVAÇÃO: o terceiro preencheu o cadastro pelo link
// temporário; pai e mãe recebem este e-mail para aprovar ou rejeitar.
export const emailConviteAprovacao = (
  aluno: string,
  terceiro: string,
  urlAprovacao: string
): string =>
  layout(
    "Aprovação pendente: terceiro responsável",
    `<p>Olá! <strong>${esc(terceiro)}</strong> preencheu um cadastro temporário para se tornar
       terceiro responsável do(a) aluno(a) <strong>${esc(aluno)}</strong>.</p>
     <p>Revise a solicitação e <strong>aprove ou rejeite</strong>:</p>
     <blockquote style="margin:14px 0;padding:12px 16px;background:#f8fafc;border-left:4px solid #f59e0b;border-radius:6px;color:#0f172a;">
       Solicitante: <strong>${esc(terceiro)}</strong><br>Aluno(a): <strong>${esc(aluno)}</strong>
     </blockquote>
     <p style="font-size:13px;color:#64748b;">O link do cadastro do solicitante expira em 12 horas —
       depois disso ele precisará pedir um novo.</p>`,
    { texto: "Aprovar ou Rejeitar", url: urlAprovacao }
  );

// Resultado da decisão (aprovado/rejeitado) para os responsáveis
export const emailConviteResultado = (
  aluno: string,
  terceiro: string,
  aprovado: boolean
): string =>
  layout(
    aprovado
      ? "Terceiro responsável aprovado"
      : "Solicitação de terceiro responsável rejeitada",
    aprovado
      ? `<p>A solicitação de <strong>${esc(terceiro)}</strong> foi <strong>aprovada</strong>.</p>
         <p>Agora ele consta como 3º responsável do(a) aluno(a) <strong>${esc(aluno)}</strong> no cadastro da unidade.</p>`
      : `<p>A solicitação de <strong>${esc(terceiro)}</strong> como terceiro responsável do(a)
         aluno(a) <strong>${esc(aluno)}</strong> foi <strong>rejeitada</strong>.</p>
         <p>Nada foi alterado no cadastro. Se isso não foi você, entre em contato com a secretaria.</p>`
  );
