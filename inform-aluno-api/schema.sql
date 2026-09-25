

CREATE TABLE IF NOT EXISTS responsaveis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  telefone TEXT,
  foto_base64 TEXT
);

CREATE TABLE IF NOT EXISTS alunos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  -- Série/turma do pré-cadastro (ex.: "6º Ano A"); vazio = "Sem série"
  serie TEXT NOT NULL DEFAULT '',
  foto_base64 TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE_VALIDACAO',
  responsavel_id INTEGER,
  responsavel2_id INTEGER,
  responsavel3_id INTEGER, -- 3º responsável aprovado via link temporário
  FOREIGN KEY (responsavel_id) REFERENCES responsaveis(id),
  FOREIGN KEY (responsavel2_id) REFERENCES responsaveis(id),
  FOREIGN KEY (responsavel3_id) REFERENCES responsaveis(id)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'RESPONSAVEL',
  -- Vínculo do cargo ALUNO com o registro em `alunos`:
  -- é o que permite ao aluno ver apenas as próprias notas/matérias.
  aluno_id INTEGER,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aluno_id) REFERENCES alunos(id)
);

-- Admin inicial: hash PBKDF2 pré-computado da senha padrão "admin123"
-- (formato pbkdf2$<iterações>$<salt>$<hash> — ver inform-aluno-api/src/senha.ts).
-- Troque a senha no primeiro acesso.
INSERT OR IGNORE INTO usuarios (nome, email, senha, role) 
VALUES ('Administrador Master', 'admin@informaluno.com', 'pbkdf2$jQ2ZBvlKOv0w3SSe7d8+ww==$9tUFxXjlnFmrtrSZssgWp2HFkfPPHXgsQswbZGJi6EQ=', 'ADMIN');

-- Cadastro de segurança do usuário: CPF +3 perguntas/respostas
-- usado para validar a identidade antes de liberar a troca de senha.
CREATE TABLE IF NOT EXISTS seguranca_usuario (
  usuario_id INTEGER PRIMARY KEY,
  cpf TEXT NOT NULL,
  pergunta1 INTEGER NOT NULL,
  resposta1 TEXT NOT NULL,
  pergunta2 INTEGER NOT NULL,
  resposta2 TEXT NOT NULL,
  pergunta3 INTEGER NOT NULL,
  resposta3 TEXT NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Sessões de login (token enviado no login e exigido nas rotas protegidas)
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  expira_em DATETIME NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Log de acessos: gravado a cada login bem-sucedido.
-- Exibido no painel do admin (histórico completo) e na diretoria
-- (últimos 30 dias), junto com os acessos temporários de terceiros.
CREATE TABLE IF NOT EXISTS log_acessos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL DEFAULT 'LOGIN',
  usuario_id INTEGER,
  usuario_nome TEXT NOT NULL,
  usuario_email TEXT NOT NULL,
  papel TEXT NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tokens de link de redefinição de senha (enviados por e-mail)
CREATE TABLE IF NOT EXISTS redefinicao_senha (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  usuario_id INTEGER NOT NULL,
  expira_em DATETIME NOT NULL,
  usado_em DATETIME,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Entradas validadas na portaria (alunos/professores) e base do dashboard de diretoria
CREATE TABLE IF NOT EXISTS registros_entrada (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pessoa_id INTEGER,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  detalhe TEXT,
  metodo_validacao TEXT NOT NULL DEFAULT 'BIOMETRIA_FACIAL',
  movimento TEXT, -- 'CHECKIN' ou 'CHECKOUT' — alterna por pessoa/dia em cada reconhecimento facial
  data_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Professores com Foto, CPF, Matrícula e Matéria
CREATE TABLE IF NOT EXISTS professores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  matricula TEXT UNIQUE NOT NULL,
  materia TEXT NOT NULL, -- Ex: "Matemática", "Física"
  foto TEXT, -- URL ou Base64 da foto
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS autorizacoes_temporarias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  responsavel_id INTEGER NOT NULL,
  aluno_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,

  -- Tipo do link: convidado de portaria (padrão) ou terceiro responsável
  -- (cadastro de terceiro com expiração de 12h e aprovação por e-mail)
  tipo TEXT NOT NULL DEFAULT 'CONVIDADO_PORTARIA',
  -- Token separado enviado SÓ aos e-mails dos responsáveis para aprovarem
  -- (quem tem o link do convidado não pode se aprovar)
  aprovacao_token TEXT,

  -- Dados preenchidos pelo Convidado (Tio, Babá, Motorista)
  convidado_nome TEXT,
  convidado_cpf TEXT,
  convidado_telefone TEXT,
  convidado_foto TEXT, -- Foto tirada pelo celular para validação visual na portaria

  -- Status: 'AGUARDANDO_CADASTRO', 'AGUARDANDO_CONFIRMACAO', 'APROVADO',
  -- 'REJEITADO', 'UTILIZADO', 'EXPIRADO'
  status TEXT DEFAULT 'AGUARDANDO_CADASTRO',
  
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  expira_em DATETIME NOT NULL,
  confirmado_em DATETIME,
  utilizado_em DATETIME,

  FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE
);

-- ============================================================
-- NOTAS E ACOMPANHAMENTO (papo professor / pai / diretoria)
-- ============================================================

-- Notas bimestrais do aluno (1º ao 4º bimestre, escala 0 a 10).
-- Uma nota por aluno por matéria por bimestre (última edição prevalece) —
-- a grade escolar permite distinguir a nota de cada disciplina.
-- `materia` vazia ('') marca notas antigas lançadas antes da grade.
CREATE TABLE IF NOT EXISTS notas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id INTEGER NOT NULL,
  materia TEXT NOT NULL DEFAULT '',
  bimestre INTEGER NOT NULL,
  nota REAL NOT NULL,
  professor_id INTEGER,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME,
  UNIQUE (aluno_id, bimestre, materia),
  FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE,
  FOREIGN KEY (professor_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Grade escolar: catálogo das matérias da escola (o professor escolhe a
-- matéria ao lançar a nota e o responsável vê a grade inteira por bimestre)
CREATE TABLE IF NOT EXISTS materias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT UNIQUE NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);

-- Seed do catálogo da grade escolar (OR IGNORE: já existente é preservado)
INSERT OR IGNORE INTO materias (nome, ordem) VALUES
  ('Português', 1),
  ('Matemática', 2),
  ('Ciências', 3),
  ('História', 4),
  ('Geografia', 5),
  ('Inglês', 6),
  ('Educação Física', 7),
  ('Artes', 8);

-- Acompanhamentos: anotações de pais e professores sobre o aluno
-- (ex.: "filho doente e faltará", "dificuldade em matemática").
CREATE TABLE IF NOT EXISTS acompanhamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id INTEGER NOT NULL,
  autor_id INTEGER NOT NULL,
  papel TEXT NOT NULL, -- PERFIL de quem escreveu: PROFESSOR, RESPONSAVEL...
  texto TEXT NOT NULL,
  -- Atestado anexado pelo responsável (data URL: application/pdf ou image/*)
  atestado_base64 TEXT,
  atestado_nome TEXT, -- nome original do arquivo (ex.: atestado.pdf)
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Vínculo entre a conta logada (usuário) e o responsável legal.
-- É o que permite ao pai/mãe encontrar os filhos no painel de notas:
-- conta que faz o pré-cadastro vira "dono" daqueles responsaveis.
CREATE TABLE IF NOT EXISTS responsavel_usuario (
  responsavel_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  PRIMARY KEY (responsavel_id, usuario_id),
  FOREIGN KEY (responsavel_id) REFERENCES responsaveis(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ============================================================
-- CHAT DA PLATAFORMA (conversas individuais)
-- ============================================================
-- Três tipos de fio (coluna `conversa`):
--   DIRETORIA       — um fio por professor com a equipe da diretoria;
--   FAMILIA         — um fio por par professor × família de um aluno
--                     (o pai seleciona professores, o professor seleciona alunos);
--   CORRESPONDENCIA — fio do responsável com uma equipe da escola; o cargo
--                     de destino fica em `destino` (SECRETARIA, COORDENADOR,
--                     DIRETOR ou GESTOR) e `professor_id` guarda o usuário
--                     do responsável dono do fio.
-- `aluno_id` = 0 quando não for fio de família. Participam /professor,
-- /diretoria, /secretaria e o painel do responsável.
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  autor_id INTEGER NOT NULL,
  texto TEXT NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  conversa TEXT NOT NULL DEFAULT 'DIRETORIA',
  professor_id INTEGER NOT NULL DEFAULT 0,
  aluno_id INTEGER NOT NULL DEFAULT 0,
  destino TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Última mensagem lida por usuário em cada fio — é a base das bolinhas
-- de notificação (não lidas = mensagens dos outros acima do último lido).
CREATE TABLE IF NOT EXISTS chat_leituras (
  usuario_id INTEGER NOT NULL,
  conversa TEXT NOT NULL,
  professor_id INTEGER NOT NULL,
  aluno_id INTEGER NOT NULL DEFAULT 0,
  destino TEXT NOT NULL DEFAULT '',
  ultimo_lido_id INTEGER NOT NULL DEFAULT 0,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, conversa, professor_id, aluno_id, destino),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
