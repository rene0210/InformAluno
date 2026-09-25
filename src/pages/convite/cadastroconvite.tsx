import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Container, Card, Form, Button, Alert, Spinner } from "react-bootstrap";

export const CadastroConvidado: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  
  const [conviteInfo, setConviteInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Terceiro responsável: mesma base do formulário (nome, CPF, foto),
  // mas a aprovação vai por e-mail para o pai e a mãe (token separado).
  const ehTerceiro = conviteInfo?.tipo === "TERCEIRO_RESPONSAVEL";

  // Campos do Convidado
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [foto, setFoto] = useState<string | null>(null);

  useEffect(() => {
    const buscarConvite = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8787/api/convite/${token}`);
        const data = await res.json();

        if (res.ok) {
          setConviteInfo(data);
        } else {
          setErro(data.error || "Convite inválido.");
        }
      } catch {
        setErro("Erro de conexão com o servidor.");
      } finally {
        setLoading(false);
      }
    };

    if (token) buscarConvite();
  }, [token]);

  // Converter foto tirada no celular/upload para Base64
  const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foto) {
      setErro("É necessário enviar/tirar uma foto de rosto para identificação na portaria.");
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:8787/api/convite/${token}/cadastrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, cpf, telefone, foto }),
      });

      const data = await res.json();
      if (res.ok) {
        setSucesso(true);
        setMensagemSucesso(data.message || null);
      } else {
        setErro(data.error || "Falha ao enviar cadastro.");
      }
    } catch {
      setErro("Erro de comunicação com o servidor.");
    }
  };

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-2 text-muted">Validando convite...</p>
      </Container>
    );
  }

  if (erro) {
    return (
      <Container className="py-5" style={{ maxWidth: "500px" }}>
        <Button
          variant="outline-secondary"
          size="sm"
          className="mb-3"
          onClick={() =>
            window.history.length > 1 ? window.history.back() : (window.location.href = "/")
          }
        >
          ← Voltar
        </Button>
        <Alert variant="danger">
          <h5>⚠️ Convite Não Disponível</h5>
          <p className="m-0">{erro}</p>
        </Alert>
      </Container>
    );
  }

  if (sucesso) {
    return (
      <Container className="py-5" style={{ maxWidth: "500px" }}>
        <Card className="text-center p-4 shadow border-0">
          <div className="fs-1 text-success mb-2">✅</div>
          <h4 className="fw-bold">
            {ehTerceiro ? "Solicitação Enviada!" : "Cadastro Temporário Enviado!"}
          </h4>
          <p className="text-muted">
            {mensagemSucesso ||
              (ehTerceiro
                ? "O pai e a mãe receberam um e-mail para aprovar ou rejeitar a solicitação. Você será 3º responsável do aluno apenas após a aprovação."
                : "O responsável pelo aluno foi notificado para dar a confirmação final. Apresente seu CPF na portaria da escola no momento da retirada.")}
          </p>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: "500px" }}>
      <div className="mb-3 text-start">
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() =>
            window.history.length > 1 ? window.history.back() : (window.location.href = "/")
          }
        >
          ← Voltar
        </Button>
      </div>
      <Card className="shadow-lg border-0">
        <Card.Header className="bg-primary text-white text-center py-3">
          <h5 className="m-0 fw-bold">
            {ehTerceiro
              ? "Cadastro de Terceiro Responsável"
              : "Autorização de Retirada Escolar"}
          </h5>
          <small>
            {ehTerceiro
              ? "Solicitação válida por 12 horas — aguarda aprovação"
              : "Registro Temporário de Acompanhante (Válido por 12h)"}
          </small>
        </Card.Header>
        <Card.Body className="p-4">
          <Alert variant="info" className="py-2">
            {ehTerceiro ? (
              <>
                <strong>Aluno(a):</strong> {conviteInfo?.aluno_nome}
                {conviteInfo?.aluno_turma
                  ? ` (Matrícula: ${conviteInfo.aluno_turma})`
                  : ""}
                <br />
                <small>
                  Ao enviar, o pai e a mãe receberão um e-mail para{" "}
                  <strong>aprovar ou rejeitar</strong> sua solicitação.
                </small>
              </>
            ) : (
              <>
                <strong>Aluno a ser retirado:</strong> {conviteInfo?.aluno_nome}
                {conviteInfo?.aluno_turma
                  ? ` (Matrícula: ${conviteInfo.aluno_turma})`
                  : ""}
              </>
            )}
          </Alert>

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Seu Nome Completo</Form.Label>
              <Form.Control
                type="text"
                required
                placeholder="Ex: Maria das Dores (Babá / Tia)"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Seu CPF</Form.Label>
              <Form.Control
                type="text"
                required
                placeholder="000.000.000-00"
                inputMode="numeric"
                maxLength={11}
                value={cpf}
                onChange={(e) =>
                  setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))
                }
              />
            </Form.Group>

            {!ehTerceiro && (
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">Telefone de Contato</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="(71) 99999-9999"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
              </Form.Group>
            )}

            <Form.Group className="mb-4">
              <Form.Label className="fw-semibold">Sua Foto de Rosto (Obrigatório)</Form.Label>
              <Form.Control type="file" accept="image/*" capture="user" required onChange={handleFotoUpload} />
              <Form.Text className="text-muted">
                Tire uma foto legível do seu rosto. A portaria usará para liberar o aluno.
              </Form.Text>
            </Form.Group>

            {foto && (
              <div className="text-center mb-3">
                <img src={foto} alt="Pré-visualização" className="rounded-circle border" style={{ width: "90px", height: "90px", objectFit: "cover" }} />
              </div>
            )}

            <Button variant="success" type="submit" className="w-100 fw-bold py-2">
              {ehTerceiro
                ? "📨 Enviar para Aprovação do Pai e da Mãe"
                : "🔒 Enviar Dados para Aprovação do Pai"}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};