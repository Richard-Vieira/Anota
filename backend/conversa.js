// conversa da tela Nova nota (chat)
// cada mensagem do usuario completa a MESMA nota (o "rascunho") ate ter tudo pra emitir
// fluxo: acha CPF/CNPJ no texto -> a IA (ou a simulacao) entende o resto -> junta com o rascunho
//        -> ve o que falta -> monta UMA pergunta por vez
const val = require('./validacoes');
const ia = require('./ia');

// procura um CPF ou CNPJ no texto (com ou sem pontos, ou falado com espaco: "529 982 247 25")
// devolve o documento e o texto sem ele (pra nao confundir com o valor)
function achaDocumento(texto, aguardando) {
  const pedacos = String(texto).match(/\d[\d\s.\-/]*\d/g) || [];
  for (const p of pedacos) {
    const d = val.soNumeros(p);
    if (d.length == 11 || d.length == 14) {
      return { documento: d, resto: String(texto).replace(p, ' ') };
    }
  }
  // quando o ANota perguntou o documento, junta todos os numeros da resposta
  if (aguardando == 'documento') {
    const d = val.soNumeros(texto);
    if (d.length >= 9) {
      return { documento: d, resto: String(texto).replace(/[\d.\-/]/g, ' ') };
    }
  }
  return { documento: '', resto: String(texto) };
}

function formataDoc(d) {
  if (d.length == 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length == 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
}

// "pedro alves" -> "Pedro Alves"
function nomeBonito(txt) {
  return String(txt).trim().replace(/\s+/g, ' ').split(' ')
    .map(p => ['da', 'de', 'do', 'das', 'dos', 'e'].includes(p.toLowerCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

// ajustado com IA para melhorar o codigo
// junta o que o usuario acabou de falar com o que ja tinha (rascunho) e decide a proxima pergunta
// rascunho = { cliente_id, servico_id, valor, valor_do_cadastro, descricao, cliente_nome_falado, documento, aguardando, origem }
async function responder(texto, rascunho, clientes, servicos) {
  const ant = rascunho || {};
  const aguardando = ant.aguardando || '';

  // 1. CPF/CNPJ sai primeiro, o resto vai pra IA/simulacao
  const doc = achaDocumento(texto || '', aguardando);
  const resto = doc.resto.trim();
  let novo = { cliente: null, servico: null, valor: null, descricao: '', cliente_nome_falado: '', origem: ant.origem || 'simulacao' };
  if (resto != '' && /[a-zA-Z0-9]/.test(resto)) {
    novo = await ia.interpretar(resto, clientes, servicos, aguardando);
  }

  // 2. cliente: o que falou agora ganha do que ja tinha
  let cliente = novo.cliente || clientes.find(c => c.id == ant.cliente_id) || null;
  let nomeFalado = '';
  let documento = '';
  if (!cliente) {
    nomeFalado = novo.cliente_nome_falado || ant.cliente_nome_falado || '';
    // perguntou o cliente e a resposta foi so um nome que nao esta cadastrado ("Pedro Alves")
    const palavras = resto.split(/\s+/).filter(p => p != '');
    if (aguardando == 'cliente' && !novo.servico && !novo.valor && !/\d/.test(resto) && palavras.length >= 1 && palavras.length <= 5) {
      nomeFalado = nomeBonito(resto.replace(/[^A-Za-zÀ-ÿ' ]/g, ''));
    }
    documento = doc.documento || ant.documento || '';
    // ja tem um cliente com esse documento? entao e ele
    if (documento != '') {
      const achou = clientes.find(c => c.documento == documento);
      if (achou) {
        cliente = achou;
        nomeFalado = '';
        documento = '';
      }
    }
  }

  // 3. servico
  const servico = novo.servico || servicos.find(s => s.id == ant.servico_id) || null;

  // 4. valor: o falado agora > o falado antes > o valor cadastrado do servico
  let valor = null;
  let valorDoCadastro = false;
  if (novo.valor) {
    valor = novo.valor;
  } else if (ant.valor && !ant.valor_do_cadastro) {
    valor = Number(ant.valor);
  } else if (servico && Number(servico.valor) > 0) {
    // so usa o do cadastro se o servico tiver valor padrao; senao o chat pergunta
    valor = Number(servico.valor);
    valorDoCadastro = true;
  }

  // 5. descricao: a nova se veio junto com o servico, senao mantem a antiga (se o servico nao mudou)
  let descricao = '';
  if (novo.servico && novo.descricao) {
    descricao = novo.descricao;
  } else if (ant.descricao && servico && ant.servico_id == servico.id) {
    descricao = ant.descricao;
  } else if (servico) {
    descricao = servico.descricao;
  }

  // 6. o que falta e qual a pergunta (uma por vez, nessa ordem)
  const faltando = [];
  if (!cliente) faltando.push('cliente');
  if (!servico) faltando.push('servico');
  if (!valor) faltando.push('valor');

  let pergunta = '';
  let proximo = '';
  let acao = '';
  let sugestoes = [];

  if (!cliente) {
    if (documento != '' && !val.validarDocumento(documento)) {
      pergunta = 'O CPF/CNPJ ' + formataDoc(documento) + ' não é válido. Pode conferir e mandar de novo?';
      documento = '';
      proximo = 'documento';
    } else if (nomeFalado != '' && documento != '') {
      pergunta = 'Não encontrei ' + nomeFalado + ' nos seus clientes. Quer cadastrar agora com o ' +
        (documento.length == 11 ? 'CPF ' : 'CNPJ ') + formataDoc(documento) + '?';
      proximo = 'cadastro';
      acao = 'cadastrar_cliente';
    } else if (nomeFalado != '') {
      pergunta = (aguardando == 'documento' ? 'Não achei um CPF ou CNPJ na sua resposta. ' : 'Não encontrei ' + nomeFalado + ' nos seus clientes. ') +
        'Qual o CPF ou CNPJ de ' + nomeFalado + '? Com ele eu já cadastro.';
      proximo = 'documento';
    } else if (documento != '') {
      pergunta = 'Não tenho cliente com o ' + (documento.length == 11 ? 'CPF ' : 'CNPJ ') + formataDoc(documento) + '. Qual o nome dele?';
      proximo = 'cliente';
    } else {
      pergunta = 'Para qual cliente foi o serviço?';
      proximo = 'cliente';
      sugestoes = clientes.slice(0, 6).map(c => c.nome);
    }
  } else if (!servico) {
    pergunta = 'Qual serviço você fez para ' + cliente.nome.split(' ')[0] + '?';
    proximo = 'servico';
    sugestoes = servicos.slice(0, 6).map(s => s.descricao);
  } else if (!valor) {
    pergunta = 'Quanto você cobrou?';
    proximo = 'valor';
  }

  return {
    cliente: cliente,
    servico: servico,
    valor: valor,
    valor_do_cadastro: valorDoCadastro,
    descricao: descricao.substring(0, 500),
    cliente_nome_falado: cliente ? '' : nomeFalado,
    documento: cliente ? '' : documento,
    faltando: faltando,
    pergunta: pergunta,
    aguardando: proximo,
    acao: acao,
    sugestoes: sugestoes,
    origem: novo.origem || ant.origem || 'simulacao'
  };
}

module.exports = { responder, achaDocumento };
