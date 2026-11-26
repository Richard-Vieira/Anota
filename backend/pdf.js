// gera o PDF da nota com o pdfkit, no formato do DANFSe
// (Documento Auxiliar da NFS-e, blocos da Nota Tecnica 008/2026 da NFS-e Nacional)
// a nota e SIMULADA, entao o ambiente sai como "Producao Restrita (simulacao)" e tem o aviso de sem validade
const PDFDocument = require('pdfkit');

// mesmas cores do App.css
const cor = {
  verde: '#0F6E56',
  texto: '#16201C',
  rotulo: '#5A6560',
  borda: '#C9D1CD',
  fundoTitulo: '#F3F6F4',
  avisoTexto: '#6B4300',
  avisoFundo: '#FDF3DC'
};

const SIMPLES_NACIONAL = 'Optante - Microempreendedor Individual (MEI)';
const INFO_COMPLEMENTAR = 'Documento gerado em ambiente de simulação, sem validade fiscal. ISS recolhido pelo regime do MEI (DAS).';

function dinheiro(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// cpf ou cnpj com pontinhos
function formataDoc(doc) {
  doc = String(doc || '');
  if (doc.length == 11) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (doc.length == 14) return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}

function formataCodigo(c) {
  c = String(c || '');
  return c.length == 6 ? c.replace(/(\d{2})(\d{2})(\d{2})/, '$1.$2.$3') : c;
}

function formataNBS(c) {
  c = String(c || '');
  return c.length == 9 ? c.replace(/(\d)(\d{4})(\d{2})(\d{2})/, '$1.$2.$3.$4') : c;
}

// "2026-11" -> "11/2026"
function formataCompetencia(c) {
  if (!c) return '';
  const p = String(c).split('-');
  return p[1] + '/' + p[0];
}

// chave de 50 numeros em grupos de 4 pra ficar legivel
function formataChave(ch) {
  return String(ch || '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

// "Rua X, 123 - Centro - CEP 89801-140"
function endereco(rua, numero, bairro, cep) {
  let t = rua || '';
  if (t && numero) t += ', ' + numero;
  if (t && bairro) t += ' - ' + bairro;
  if (t && cep) t += ' - CEP ' + String(cep).replace(/(\d{5})(\d{3})/, '$1-$2');
  return t;
}

function municipioUF(m, uf) {
  if (!m) return '';
  return m + (uf ? '/' + uf : '');
}

// recebe a nota completa (buscaNotaCompleta do server.js) e devolve o PDF num Buffer
function gerarPdf(nota) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'DANFSe - NFS-e ' + (nota.numero_nfse || '') } });
    const pedacos = [];
    doc.on('data', p => pedacos.push(p));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    const esq = 32; // margem
    const larg = doc.page.width - esq * 2; // largura do conteudo
    const col = larg / 4; // o DANFSe e montado numa grade de 4 colunas
    let y = 32;

    // ---------- cabecalho ----------
    const altCab = 64;
    doc.rect(esq, y, larg, altCab).lineWidth(0.8).strokeColor(cor.borda).stroke();
    doc.font('Helvetica-Bold').fontSize(18).fillColor(cor.texto).text('DANFSe', esq + 12, y + 12);
    doc.font('Helvetica').fontSize(9).fillColor(cor.rotulo).text('Documento Auxiliar da NFS-e', esq + 12, y + 34);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(cor.verde).text('ANota', esq + 12, y + 47);
    const ladoDir = esq + larg / 2;
    doc.font('Helvetica').fontSize(8).fillColor(cor.rotulo).text('MUNICÍPIO DO PRESTADOR', ladoDir, y + 12, { width: larg / 2 - 12, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(cor.texto)
      .text(municipioUF(nota.prestador_municipio, nota.prestador_uf) || '-', ladoDir, y + 23, { width: larg / 2 - 12, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(cor.rotulo).text('AMBIENTE', ladoDir, y + 38, { width: larg / 2 - 12, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(cor.avisoTexto)
      .text('Produção Restrita (simulação)', ladoDir, y + 48, { width: larg / 2 - 12, align: 'right' });
    y += altCab + 8;

    // ---------- blocos ----------
    // cada linha e uma lista de celulas [rotulo, valor, quantas colunas ocupa]
    bloco('DADOS DA NFS-e', [
      [['Chave de acesso', formataChave(nota.chave_acesso), 4, true]],
      [
        ['Número da NFS-e', nota.numero_nfse, 1],
        ['Competência', formataCompetencia(nota.competencia), 1],
        ['Data e hora da emissão', nota.data_hora_emissao, 1],
        ['Número / série da DPS', nota.numero_dps ? nota.numero_dps + ' / ' + nota.serie_dps : '', 1]
      ]
    ]);

    bloco('PRESTADOR / FORNECEDOR', [
      [
        ['CNPJ', formataDoc(nota.prestador_cnpj), 1],
        ['Inscrição municipal', nota.prestador_inscricao_municipal, 1],
        ['Telefone', nota.prestador_telefone, 2]
      ],
      [
        ['Nome / nome empresarial', nota.prestador_nome, 2],
        ['Município/UF', municipioUF(nota.prestador_municipio, nota.prestador_uf), 1],
        ['E-mail', nota.prestador_email, 1]
      ],
      [['Endereço', endereco(nota.prestador_endereco, nota.prestador_numero, nota.prestador_bairro, nota.prestador_cep), 4]],
      [['Simples Nacional na data de competência', SIMPLES_NACIONAL, 4]]
    ]);

    bloco('TOMADOR / ADQUIRENTE', [
      [
        ['CPF/CNPJ', formataDoc(nota.cliente_documento), 1],
        ['Telefone', nota.cliente_telefone, 1],
        ['Nome / nome empresarial', nota.cliente_nome, 2]
      ],
      [
        ['Município/UF', municipioUF(nota.cliente_municipio, nota.cliente_uf), 1],
        ['Endereço', endereco(nota.cliente_endereco, nota.cliente_numero, nota.cliente_bairro, nota.cliente_cep), 2],
        ['E-mail', nota.cliente_email, 1]
      ]
    ]);

    // local da prestacao: onde o servico foi feito (o municipio do cliente; se nao tiver, o do prestador)
    const local = nota.cliente_municipio
      ? municipioUF(nota.cliente_municipio, nota.cliente_uf)
      : municipioUF(nota.prestador_municipio, nota.prestador_uf);
    bloco('SERVIÇO PRESTADO', [
      [
        ['Cód. tributação nacional', formataCodigo(nota.codigo_tributacao), 1],
        ['Código da NBS', formataNBS(nota.codigo_nbs), 1],
        ['Local da prestação', local, 2]
      ],
      [['Descrição do código de tributação nacional', nota.descricao_codigo, 4]],
      [['Descrição do serviço', nota.descricao, 4]]
    ]);

    // ---------- valor total ----------
    tituloBloco('VALOR TOTAL DA NFS-E');
    const altValor = 46;
    doc.rect(esq, y, larg, altValor).lineWidth(0.8).strokeColor(cor.borda).stroke();
    celula('Valor do serviço', dinheiro(nota.valor), esq, y, col);
    celula('Desconto', dinheiro(0), esq + col, y, col);
    doc.moveTo(esq + col, y).lineTo(esq + col, y + altValor).stroke();
    doc.moveTo(esq + col * 2, y).lineTo(esq + col * 2, y + altValor).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(cor.rotulo).text('VALOR LÍQUIDO DA NFS-E', esq + col * 2 + 8, y + 7);
    doc.font('Helvetica-Bold').fontSize(18).fillColor(cor.verde).text(dinheiro(nota.valor), esq + col * 2 + 8, y + 19, { width: col * 2 - 16 });
    y += altValor + 8;

    // ---------- informacoes complementares ----------
    tituloBloco('INFORMAÇÕES COMPLEMENTARES');
    doc.font('Helvetica').fontSize(9);
    const altInfo = doc.heightOfString(INFO_COMPLEMENTAR, { width: larg - 16 }) + 16;
    doc.rect(esq, y, larg, altInfo).fill(cor.avisoFundo);
    doc.rect(esq, y, larg, altInfo).lineWidth(0.8).strokeColor(cor.borda).stroke();
    doc.fillColor(cor.avisoTexto).text(INFO_COMPLEMENTAR, esq + 8, y + 8, { width: larg - 16 });
    y += altInfo;

    // ---------- rodape ----------
    doc.font('Helvetica').fontSize(8).fillColor(cor.rotulo)
      .text('Gerado pelo ANota - NFS-e simulada, sem envio ao Sistema Nacional da NFS-e', esq, doc.page.height - 36,
        { width: larg, align: 'center', lineBreak: false });

    doc.end();

    // ===== funcoes de desenho =====

    function tituloBloco(t) {
      doc.rect(esq, y, larg, 16).fill(cor.fundoTitulo);
      doc.rect(esq, y, larg, 16).lineWidth(0.8).strokeColor(cor.borda).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(cor.texto).text(t, esq + 8, y + 4.5, { lineBreak: false });
      y += 16;
    }

    // altura que uma celula precisa (rotulo + valor quebrando linha)
    function alturaCelula(valor, w, grande) {
      doc.font(grande ? 'Courier-Bold' : 'Helvetica').fontSize(grande ? 10 : 9);
      return 7 + 9 + doc.heightOfString(String(valor || '-'), { width: w - 16 }) + 7;
    }

    function celula(rotulo, valor, x, yy, w, grande) {
      doc.font('Helvetica').fontSize(7).fillColor(cor.rotulo).text(rotulo.toUpperCase(), x + 8, yy + 7, { width: w - 16, lineBreak: false });
      doc.font(grande ? 'Courier-Bold' : 'Helvetica').fontSize(grande ? 10 : 9).fillColor(cor.texto)
        .text(String(valor || '-'), x + 8, yy + 16, { width: w - 16 });
    }

    function bloco(titulo, linhas) {
      tituloBloco(titulo);
      for (const linha of linhas) {
        // a linha tem a altura da celula mais alta
        let alt = 0;
        for (const c of linha) alt = Math.max(alt, alturaCelula(c[1], col * c[2], c[3]));
        doc.rect(esq, y, larg, alt).lineWidth(0.8).strokeColor(cor.borda).stroke();
        let x = esq;
        for (let i = 0; i < linha.length; i++) {
          const c = linha[i];
          celula(c[0], c[1], x, y, col * c[2], c[3]);
          x += col * c[2];
          if (i < linha.length - 1) doc.moveTo(x, y).lineTo(x, y + alt).strokeColor(cor.borda).stroke();
        }
        y += alt;
      }
      y += 8;
    }
  });
}

module.exports = { gerarPdf };
