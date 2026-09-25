import React from "react";
import { Modal, Button } from "react-bootstrap";

interface TermosModalProps {
  show: boolean;
  onHide: () => void;
}

// Modal "Termos e Condições de Uso" — compartilhado pela Home e pelo Registro.
export const TermosModal: React.FC<TermosModalProps> = ({ show, onHide }) => (
  <Modal show={show} onHide={onHide} size="lg" centered>
    <Modal.Header closeButton className="bg-light">
      <Modal.Title className="fw-bold fs-5">
        📄 Termos e Condições de Uso
      </Modal.Title>
    </Modal.Header>
    <Modal.Body className="p-4" style={{ maxHeight: "60vh", overflowY: "auto" }}>
      <h6>1. Aceitação dos Termos</h6>
      <p className="text-muted small">
        Ao utilizar o sistema InformAluno, o usuário declara ter lido e
        concordado integralmente com as regras de cadastro, autenticação e
        validação de acessos escolares. O uso continuado do sistema após a
        publicação de alterações significa a aceitação da nova versão.
      </p>

      <h6>2. Uso das Credenciais e Biometria</h6>
      <p className="text-muted small">
        O acesso ao painel de portaria e aos dados dos alunos é estritamente
        restrito a operadores e responsáveis autorizados. O envio de dados e
        imagens para o cadastro deve ser efetuado apenas pelo responsável legal
        do aluno. O usuário é responsável por manter suas credenciais (e-mail,
        senha e respostas de segurança) sigilosas e por toda atividade realizada
        em sua conta.
      </p>

      <h6>3. Uso Fraudulento — Proibições</h6>
      <p className="text-muted small">
        É terminantemente proibido: (a) cadastrar ou enviar imagens, CPFs ou
        matrículas de terceiros sem autorização; (b) forjar, alterar ou suprimir
        dados de cadastro; (c) compartilhar, emprestar ou vender credenciais de
        acesso; (d) utilizar o sistema para fins ilícitos, discriminatórios ou
        de perseguição; (e) tentar contornar mecanismos de verificação de
        identidade. Toda tentativa de fraude fica registrada com data, hora e
        identificação da conta.
      </p>

      <h6>4. Sanções por Fraude</h6>
      <p className="text-muted small">
        A comprovação de uso fraudulento acarretará, sem prévio aviso e conforme
        a gravidade: suspensão ou cancelamento imediato da conta; exclusão dos
        dados biométricos cadastrados; comunicação à administração escolar e,
        quando aplicável, às autoridades competentes e/ou responsáveis legais,
        sem que a administração responda por eventuais consequências civis ou
        penais do usuário infrator.
      </p>

      <h6>5. Responsabilidades</h6>
      <p className="text-muted small">
        A precisão dos dados informados (CPF, Matrícula e Imagens) é de
        responsabilidade exclusiva do cadastrante. Cadastros incorretos ou não
        validados serão recusados na etapa final de portaria. O sistema é
        fornecido "no estado em que se encontra": a administração não se
        responsabiliza por decisões tomadas com base em dados incorretos
        fornecidos pelo próprio usuário, nem por indiretos, lucros cessantes ou
        danos decorrentes de uso indevido das credenciais pelo usuário.
      </p>

      <h6>6. Legislação Aplicável e Foro</h6>
      <p className="text-muted small">
        Estes Termos são regidos pelas leis da República Federativa do Brasil.
        Fica eleito o foro da Comarca da sede da instituição de ensino para
        dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais
        privilegiado que seja.
      </p>

      <p className="text-muted small fst-italic mt-3 mb-0">
        Última atualização: setembro de 2026.
      </p>
    </Modal.Body>
    <Modal.Footer>
      <Button variant="secondary" onClick={onHide}>
        Fechar
      </Button>
    </Modal.Footer>
  </Modal>
);

// Modal "Política de Privacidade & LGPD" — compartilhado pela Home e pelo Registro.
export const PrivacidadeModal: React.FC<TermosModalProps> = ({ show, onHide }) => (
  <Modal show={show} onHide={onHide} size="lg" centered>
    <Modal.Header closeButton className="bg-light">
      <Modal.Title className="fw-bold fs-5">
        🔒 Política de Privacidade & Proteção de Dados (LGPD)
      </Modal.Title>
    </Modal.Header>
    <Modal.Body className="p-4" style={{ maxHeight: "60vh", overflowY: "auto" }}>
      <h6>1. Tratamento de Dados Biométricos e Pessoais</h6>
      <p className="text-muted small">
        Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº
        13.709/2018), as imagens faciais e dados de identificação (CPF,
        Matrícula) são coletados única e exclusivamente para a finalidade de
        <strong> segurança e validação de acesso físico </strong>
        na portaria escolar.
      </p>

      <h6>2. Base Legal (Dado Sensível)</h6>
      <p className="text-muted small">
        A imagem facial é dado pessoal sensível (art. 5º, II) e trata-se sobre a
        base legal do <strong>consentimento específico e destacado</strong> do
        titular ou de seu responsável legal (art. 11, I, "a" e art. 8º),
        manifestado no momento do aceite destes termos no ato do cadastro, para
        finalidade determinada de segurança escolar. O consentimento pode ser
        revogado a qualquer momento.
      </p>

      <h6>3. Armazenamento Seguro e Operadores</h6>
      <p className="text-muted small">
        Os dados são armazenados em ambiente seguro no banco Cloudflare D1,
        atuando como operador nos termos do art. 39 da LGPD, sob contrato de
        proteção de dados. Nenhuma informação visual ou dado pessoal é
        comercializado ou compartilhado com terceiros para finalidade diversa da
        descrita nesta política.
      </p>

      <h6>4. Prazo de Retenção</h6>
      <p className="text-muted small">
        Os dados biométricos e de cadastro são mantidos enquanto o aluno estiver
        vinculado à instituição. Após o vínculo, ou mediante solicitação, são
        excluídos de forma definitiva e irrecuperável no prazo de até 90
        (noventa) dias, salvo obrigação legal de guarda.
      </p>

      <h6>5. Direitos do Titular (art. 18)</h6>
      <p className="text-muted small">
        Os pais ou responsáveis legais podem, a qualquer momento: confirmar e
        acessar os dados; corrigir dados incompletos ou desatualizados; solicitar
        a eliminação dos dados biométricos (revogação do consentimento); e obter
        informação sobre compartilhamento. As solicitações devem ser dirigidas à
        administração escolar, que atuará como controladora.
      </p>

      <h6>6. Encarregado (DPO) e Contato</h6>
      <p className="text-muted small">
        Solicitações do titular podem ser protocoladas junto ao encarregado de
        proteção de dados da instituição, através do e-mail de contato oficial
        da escola, com assunto "Encarregado LGPD — Titular de Dados". Respostas
        serão prestadas em prazo razoável, nos termos do art. 19 da LGPD.
      </p>

      <p className="text-muted small fst-italic mt-3 mb-0">
        Última atualização: setembro de 2026.
      </p>
    </Modal.Body>
    <Modal.Footer>
      <Button variant="secondary" onClick={onHide}>
        Ciente e Fechar
      </Button>
    </Modal.Footer>
  </Modal>
);
