// Abre um data URL (PDF/imagem) em outra aba usando Blob — evita o bloqueio
// de navegação do navegador para "data:..." e os limites de tamanho de URL.
// Função em arquivo próprio (fora do .tsx) para não quebrar o fast refresh.
export const abrirEmNovaAba = (dataUrl: string, rotulo: string): void => {
  const janela = window.open("", "_blank");
  if (janela) {
    janela.document.write(
      `<p style='font-family:sans-serif;padding:20px'>Carregando ${rotulo.toLowerCase()}...</p>`
    );
    janela.document.title = rotulo;
  }
  fetch(dataUrl)
    .then((res) => res.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      if (janela && !janela.closed) {
        janela.location.href = url;
      } else {
        window.open(url, "_blank");
      }
      // Dá tempo do navegador abrir/baixar antes de liberar a memória
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    })
    .catch(() => {
      if (janela && !janela.closed) janela.close();
    });
};
