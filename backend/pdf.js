// gera o PDF da nota com o pdfkit
// e um PDF simples, so pra mandar pro cliente (nao e o DANFSe oficial do governo)
// o visual copia o do app (App.css): menu do topo, cards com borda, status e valor grande
const PDFDocument = require('pdfkit');

// mesmas cores do App.css
const cor = {
  verde: '#0F6E56',
  texto: '#333333',
  cinza: '#888888',
  borda: '#dddddd',
  linha: '#eeeeee',
  fundoCinza: '#f7f7f7',
  avisoTexto: '#8a6d00',
  avisoFundo: '#fff8e1'
};

// cor de cada status (igual as classes .status do App.css)
const coresStatus = {
  emitida: { fundo: '#e6f4ef', texto: '#0F6E56' },
  enviada: { fundo: '#0F6E56', texto: '#ffffff' },
  pendente: { fundo: '#fff8e1', texto: '#8a6d00' },
  cancelada: { fundo: '#eeeeee', texto: '#777777' }
};

function dinheiro(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "2026-06-05" -> "05/06/2026"
function dataBr(d) {
  if (!d) return '';
  const p = String(d).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

// cpf ou cnpj com pontinhos
function formataDoc(doc) {
  doc = String(doc || '');
  if (doc.length == 11) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (doc.length == 14) return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}

// recebe a nota (com os dados do prestador e do cliente juntos) e devolve o PDF num Buffer
function gerarPdf(nota) {
  return new Promise((resolve, reject) => {
    // Helvetica e a mesma familia do Arial que o app usa
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const pedacos = [];
    doc.on('data', p => pedacos.push(p));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    const esq = 48; // margem
    const larg = doc.page.width - esq * 2; // largura do conteudo
    let y = 0;

    // ---------- menu do topo (.menu / .logo) ----------
    doc.font('Helvetica-Bold').fontSize(20).fillColor(cor.verde).text('ANota', esq, 22);
    doc.font('Helvetica').fontSize(11).fillColor(cor.texto)
      .text(nota.prestador_nome, esq, 28, { width: larg, align: 'right' });
    y = 58;
    doc.moveTo(0, y).lineTo(doc.page.width, y).lineWidth(1).strokeColor(cor.borda).stroke();

    // ---------- titulo (h2) + status ----------
    y += 24;
    const titulo = 'Nota fiscal nº ' + (nota.numero_nfse || '-');
    doc.font('Helvetica-Bold').fontSize(20).fillColor(cor.texto).text(titulo, esq, y);
    badge(nota.status, esq + doc.widthOfString(titulo) + 10, y + 3);
    y += 28;
    doc.font('Helvetica').fontSize(10).fillColor(cor.cinza)
      .text('Nota Fiscal de Serviço eletrônica (NFS-e) · emitida em ' + dataBr(nota.data_emissao), esq, y);
    y += 22;

    // ---------- aviso (.aviso) ----------
    const avisoTxt = 'Documento gerado em ambiente de testes (simulação) - sem validade fiscal.';
    doc.fontSize(10);
    const avisoAlt = doc.heightOfString(avisoTxt, { width: larg - 16 }) + 16;
    doc.roundedRect(esq, y, larg, avisoAlt, 4).fill(cor.avisoFundo);
    doc.fillColor(cor.avisoTexto).text(avisoTxt, esq + 8, y + 8, { width: larg - 16 });
    y += avisoAlt + 16;

    // ---------- cards de prestador e cliente lado a lado ----------
    const meio = 16;
    const metade = (larg - meio) / 2;
    const prestador = [
      ['Nome', nota.prestador_nome],
      ['CNPJ', formataDoc(nota.prestador_cnpj)],
      ['Email', nota.prestador_email]
    ];
    const cliente = [
      ['Nome', nota.cliente_nome],
      ['CPF/CNPJ', formataDoc(nota.cliente_documento)],
      ['Email', nota.cliente_email],
      ['Telefone', nota.cliente_telefone]
    ].filter(c => c[1]);
    // os dois cards com a mesma altura
    const altCards = Math.max(alturaCard(prestador, metade), alturaCard(cliente, metade));
    card('Prestador do serviço', prestador, esq, y, metade, altCards);
    card('Tomador do serviço (cliente)', cliente, esq + metade + meio, y, metade, altCards);
    y += altCards + 16;

    // ---------- card do servico com tabela (table / th / td) ----------
    const colValor = 120;
    const colDesc = larg - 32 - colValor;
    doc.font('Helvetica').fontSize(11);
    const descricao = nota.descricao || '';
    const altLinha = Math.max(doc.heightOfString(nota.servico_descricao, { width: colDesc - 16 }) +
      doc.heightOfString(descricao, { width: colDesc - 16 }) + 4, 14) + 16;
    const altServico = 16 + 22 + 28 + altLinha + 16;
    caixa(esq, y, larg, altServico);
    tituloCard('Serviço', esq + 16, y + 16);
    let ty = y + 16 + 22;
    const tx = esq + 16;
    // cabecalho da tabela
    doc.rect(tx, ty, larg - 32, 28).fill(cor.fundoCinza);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(cor.texto)
      .text('Descrição', tx + 8, ty + 9)
      .text('Valor', tx + colDesc, ty + 9, { width: colValor - 8, align: 'right' });
    ty += 28;
    // linha do servico
    doc.font('Helvetica-Bold').fontSize(11).fillColor(cor.texto)
      .text(nota.servico_descricao, tx + 8, ty + 8, { width: colDesc - 16 });
    doc.font('Helvetica').fillColor(cor.cinza).text(descricao, { width: colDesc - 16 });
    doc.font('Helvetica').fillColor(cor.texto)
      .text(dinheiro(nota.valor), tx + colDesc, ty + 8, { width: colValor - 8, align: 'right' });
    ty += altLinha;
    doc.moveTo(tx, ty).lineTo(tx + larg - 32, ty).strokeColor(cor.linha).stroke();
    y += altServico + 16;

    // ---------- total (.valor-grande) ----------
    const altTotal = 76;
    caixa(esq, y, larg, altTotal);
    doc.font('Helvetica').fontSize(10).fillColor(cor.texto).text('Valor total da nota', esq + 16, y + 16);
    doc.font('Helvetica-Bold').fontSize(28).fillColor(cor.verde).text(dinheiro(nota.valor), esq + 16, y + 32);

    // ---------- rodape ----------
    doc.font('Helvetica').fontSize(9).fillColor(cor.cinza)
      .text('Gerado pelo ANota', esq, doc.page.height - 40, { width: larg, align: 'center', lineBreak: false });

    doc.end();

    // ===== funcoes de desenho =====

    // borda cinza com canto arredondado (.card)
    function caixa(x, yy, w, h) {
      doc.roundedRect(x, yy, w, h, 6).lineWidth(1).strokeColor(cor.borda).stroke();
    }

    function tituloCard(t, x, yy) {
      doc.font('Helvetica-Bold').fontSize(13).fillColor(cor.texto).text(t, x, yy);
    }

    // cada campo e um rotulo pequeno cinza (como o label) e o valor embaixo
    function alturaCard(campos, w) {
      let h = 16 + 22; // padding + titulo
      doc.font('Helvetica').fontSize(11);
      for (const c of campos) h += 13 + doc.heightOfString(String(c[1]), { width: w - 32 }) + 8;
      return h + 8;
    }

    function card(t, campos, x, yy, w, h) {
      caixa(x, yy, w, h);
      tituloCard(t, x + 16, yy + 16);
      let cy = yy + 16 + 22;
      for (const c of campos) {
        doc.font('Helvetica').fontSize(9).fillColor(cor.cinza).text(c[0], x + 16, cy);
        cy += 13;
        doc.fontSize(11).fillColor(cor.texto).text(String(c[1]), x + 16, cy, { width: w - 32 });
        cy = doc.y + 8;
      }
    }

    // etiqueta de status arredondada (.status)
    function badge(status, x, yy) {
      const c = coresStatus[status] || coresStatus.cancelada;
      doc.font('Helvetica').fontSize(10);
      const w = doc.widthOfString(status) + 16;
      doc.roundedRect(x, yy, w, 18, 9).fill(c.fundo);
      doc.fillColor(c.texto).text(status, x + 8, yy + 4, { lineBreak: false });
    }
  });
}

module.exports = { gerarPdf };
