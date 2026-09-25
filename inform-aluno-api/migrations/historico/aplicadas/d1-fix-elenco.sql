-- 1. Restaura a senha unica do elenco de apresentacao (contrato: informaluno123)
UPDATE usuarios SET senha = 'informaluno123'
WHERE email IN (
  'diretor@informaluno.com',
  'coordenador@informaluno.com',
  'secretaria@informaluno.com',
  'portaria@informaluno.com',
  'responsavel.bruno@informaluno.com'
);

-- 2. Remove residuo do smoke (dados descartaveis de teste)
DELETE FROM autorizacoes_temporarias WHERE aluno_id IN (SELECT id FROM alunos WHERE matricula = '990207');
DELETE FROM notas WHERE aluno_id IN (SELECT id FROM alunos WHERE matricula = '990207');
DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE 'smoke.%');
DELETE FROM responsavel_usuario WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE 'smoke.%');
DELETE FROM log_acessos WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE 'smoke.%');
DELETE FROM usuarios WHERE email LIKE 'smoke.%';
DELETE FROM alunos WHERE matricula = '990207';
DELETE FROM responsaveis WHERE cpf IN ('99100002701', '99100002702', '99100002703', '99100002704');

-- 3. Remove logs de usuarios ja excluidos (E2E e smoke)
DELETE FROM log_acessos WHERE usuario_id IS NULL OR usuario_id NOT IN (SELECT id FROM usuarios);

-- 4. Verificacao final: elenco completo
SELECT id, email, role, senha FROM usuarios
WHERE email LIKE '%@informaluno.com'
ORDER BY id;
