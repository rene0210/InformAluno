-- Limpeza de resíduo do E2E de e-mail (usuários de teste já excluídos via API)
DELETE FROM notas WHERE aluno_id NOT IN (SELECT id FROM alunos);
DELETE FROM acompanhamentos WHERE aluno_id NOT IN (SELECT id FROM alunos);
DELETE FROM responsavel_usuario WHERE usuario_id IS NOT NULL AND usuario_id NOT IN (SELECT id FROM usuarios);
DELETE FROM seguranca_usuario WHERE usuario_id IS NOT NULL AND usuario_id NOT IN (SELECT id FROM usuarios);
DELETE FROM redefinicao_senha WHERE usuario_id IS NOT NULL AND usuario_id NOT IN (SELECT id FROM usuarios);
DELETE FROM sessoes WHERE usuario_id IS NOT NULL AND usuario_id NOT IN (SELECT id FROM usuarios);
DELETE FROM responsaveis WHERE cpf IN ('95511122297', '95544455554');
