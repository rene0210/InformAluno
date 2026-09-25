SELECT
 (SELECT COUNT(*) FROM usuarios) AS usuarios,
 (SELECT COUNT(*) FROM alunos) AS alunos,
 (SELECT COUNT(*) FROM responsaveis) AS responsaveis,
 (SELECT COUNT(*) FROM autorizacoes_temporarias) AS convites_total,
 (SELECT COUNT(*) FROM autorizacoes_temporarias WHERE status IN ('AGUARDANDO_CADASTRO','AGUARDANDO_CONFIRMACAO')) AS convites_pendentes,
 (SELECT COUNT(*) FROM acompanhamentos) AS acompanhamentos;
