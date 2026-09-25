SELECT 'usuarios' AS t, COUNT(*) AS n FROM usuarios
UNION ALL SELECT 'alunos', COUNT(*) FROM alunos
UNION ALL SELECT 'responsaveis', COUNT(*) FROM responsaveis
UNION ALL SELECT 'convites_pendentes', COUNT(*) FROM autorizacoes_temporarias WHERE status IN ('AGUARDANDO_CADASTRO','AGUARDANDO_CONFIRMACAO')
UNION ALL SELECT 'convites_total', COUNT(*) FROM autorizacoes_temporarias
UNION ALL SELECT 'acompanhamentos', COUNT(*) FROM acompanhamentos
UNION ALL SELECT 'alunos_orfaos', COUNT(*) FROM alunos a
  LEFT JOIN responsaveis r1 ON r1.id = a.responsavel_id
  LEFT JOIN responsaveis r2 ON r2.id = a.responsavel2_id
  LEFT JOIN responsaveis r3 ON r3.id = a.responsavel3_id
  WHERE (a.responsavel_id IS NOT NULL AND r1.id IS NULL)
     OR (a.responsavel2_id IS NOT NULL AND r2.id IS NULL)
     OR (a.responsavel3_id IS NOT NULL AND r3.id IS NULL)
UNION ALL SELECT 'resp_e2e_residual', COUNT(*) FROM responsaveis WHERE cpf LIKE '99100002%'
UNION ALL SELECT 'alunos_e2e_residual', COUNT(*) FROM alunos WHERE matricula LIKE '9902%'
