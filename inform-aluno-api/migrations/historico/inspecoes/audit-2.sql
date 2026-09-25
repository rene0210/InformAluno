SELECT
 (SELECT COUNT(*) FROM alunos a
   LEFT JOIN responsaveis r1 ON r1.id = a.responsavel_id
   LEFT JOIN responsaveis r2 ON r2.id = a.responsavel2_id
   LEFT JOIN responsaveis r3 ON r3.id = a.responsavel3_id
   WHERE (a.responsavel_id IS NOT NULL AND r1.id IS NULL)
      OR (a.responsavel2_id IS NOT NULL AND r2.id IS NULL)
      OR (a.responsavel3_id IS NOT NULL AND r3.id IS NULL)) AS alunos_orfaos,
 (SELECT COUNT(*) FROM responsaveis WHERE cpf LIKE '99100002%') AS resp_e2e_residual,
 (SELECT COUNT(*) FROM alunos WHERE matricula LIKE '9902%') AS alunos_e2e_residual;
