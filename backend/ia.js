// parte de IA do ANota
// se tiver IA_API_KEY no .env chama a API do Claude (Anthropic)
// se nao tiver chave ou der qualquer erro, usa a interpretacao simulada (busca de palavras)
require('dotenv').config();

const URL_API = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2026-10-21';

function temChave() {
  return !!(process.env.IA_API_KEY && process.env.IA_API_KEY.trim() != '');
}

function modelo() {
  return process.env.IA_MODELO || 'claude-opus-5-5';
}

// tira acento e deixa minusculo pra comparar os textos
function normaliza(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ajustado com IA para melhorar o codigo
// tenta achar o valor no texto, tipo "500 reais", "R$ 1.200,50", "350 conto"
function achaValor(texto) {
  var m = texto.match(/r\$\s*([\d.,]+)/);
  if (!m) {
    m = texto.match(/([\d.,]+)\s*(reais|real|conto|pila)/);
  }
  if (!m) return null;

  var numero = m[1];
  // "1.200,50" -> 1200.50
  if (numero.indexOf(',') >= 0) {
    numero = numero.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{3}$/.test(numero)) {
    // "1.200" e mil e duzentos, nao 1 virgula 2
    numero = numero.replace(/\./g, '');
  }
  var v = parseFloat(numero);
  if (isNaN(v) || v <= 0) return null;
  return v;
}

// monta a pergunta pro usuario quando falta alguma coisa
function montaPergunta(faltando) {
  if (faltando.length == 0) return '';
  const nomes = { cliente: 'para qual cliente foi', servico: 'qual serviço foi feito', valor: 'quanto você cobrou' };
  const partes = faltando.map(f => nomes[f]);
  return 'Não entendi ' + partes.join(', ') + '. Pode escolher abaixo?';
}

// =============== INTERPRETACAO SIMULADA ===============
// e a mesma busca de palavras da etapa 2, so mudei de arquivo
function interpretarSimulado(texto, clientes, servicos) {
  const t = normaliza(texto);

  // procura o cliente: nome completo vale mais que so o primeiro nome
  let clienteAchado = null;
  let melhorPonto = 0;
  for (let i = 0; i < clientes.length; i++) {
    const c = clientes[i];
    const nome = normaliza(c.nome);
    const primeiroNome = nome.split(' ')[0];
    let pontos = 0;
    if (t.includes(nome)) {
      pontos = 10;
    } else if (primeiroNome.length >= 3 && new RegExp('\\b' + primeiroNome + '\\b').test(t)) {
      pontos = 5;
      // se tiver mais partes do nome soma mais
      const partes = nome.split(' ');
      for (let j = 1; j < partes.length; j++) {
        if (partes[j].length >= 3 && t.includes(partes[j])) pontos++;
      }
    }
    if (pontos > melhorPonto) {
      melhorPonto = pontos;
      clienteAchado = c;
    }
  }

  // procura o servico: ve se as palavras da descricao aparecem no texto
  // usa so o comeco da palavra pra pegar "pintei" -> "pintura", "rebocar" -> "reboco"
  const ignorar = ['de', 'da', 'do', 'e', 'em', 'com', 'para', 'pequenos', 'servico'];
  let servicoAchado = null;
  let melhor = 0;
  for (const s of servicos) {
    const desc = normaliza(s.descricao);
    let pontos = 0;
    if (t.includes(desc)) {
      pontos = 100;
    } else {
      const palavras = desc.split(/\s+/);
      for (const p of palavras) {
        if (p.length < 4 || ignorar.includes(p)) continue;
        const pedaco = p.substring(0, 4);
        if (t.includes(pedaco)) pontos++;
      }
    }
    if (pontos > melhor) {
      melhor = pontos;
      servicoAchado = s;
    }
  }

  let valor = achaValor(t);
  let valorDoCadastro = false;
  // se a pessoa nao falou o valor usa o valor cadastrado do servico
  if (valor == null && servicoAchado) {
    valor = Number(servicoAchado.valor);
    valorDoCadastro = true;
  }

  const faltando = [];
  if (!clienteAchado) faltando.push('cliente');
  if (!servicoAchado) faltando.push('servico');
  if (valor == null) faltando.push('valor');

  // monta uma descricao pra nota
  let descricao = '';
  if (servicoAchado) {
    descricao = servicoAchado.descricao;
    if (clienteAchado) descricao += ' - ' + clienteAchado.nome;
  }

  return {
    cliente: clienteAchado,
    servico: servicoAchado,
    valor: valor,
    valor_do_cadastro: valorDoCadastro,
    descricao: descricao,
    faltando: faltando,
    pergunta: montaPergunta(faltando),
    origem: 'simulacao'
  };
}

// =============== CHAMADA DA API DO CLAUDE ===============
// manda o pedido com fetch (sem SDK) e devolve o texto da resposta
async function chamarClaude(sistema, mensagem, formatoJson) {
  const corpo = {
    model: modelo(),
    max_tokens: 16000,
    system: sistema,
    messages: [{ role: 'user', content: mensagem }],
    output_config: { effort: 'low' } // tarefa simples, nao precisa pensar muito
  };
  // se passar um schema a API garante que a resposta vem nesse formato de JSON
  if (formatoJson) {
    corpo.output_config.format = { type: 'json_schema', schema: formatoJson };
  }

  const resp = await fetch(URL_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.IA_API_KEY,
      'anthropic-version': VERSAO_API
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(60000) // 1 minuto no maximo
  });

  const dados = await resp.json();
  if (!resp.ok) {
    throw new Error('API da IA respondeu ' + resp.status + ': ' + (dados.error ? dados.error.message : ''));
  }
  if (dados.stop_reason == 'refusal') {
    throw new Error('a IA recusou o pedido');
  }

  // a resposta vem numa lista de blocos, pode ter bloco de "thinking" antes, entao pega so os de texto
  let texto = '';
  for (const bloco of dados.content) {
    if (bloco.type == 'text') texto += bloco.text;
  }
  console.log('IA respondeu:', texto);
  return texto;
}

// formato do JSON que a IA tem que devolver na interpretacao
// 0 = nao achou (mais facil que lidar com null)
const SCHEMA_NOTA = {
  type: 'object',
  properties: {
    cliente_id: { type: 'integer' },
    servico_id: { type: 'integer' },
    valor: { type: 'number' },
    descricao: { type: 'string' },
    faltando: { type: 'array', items: { type: 'string', enum: ['cliente', 'servico', 'valor'] } },
    pergunta: { type: 'string' }
  },
  required: ['cliente_id', 'servico_id', 'valor', 'descricao', 'faltando', 'pergunta'],
  additionalProperties: false
};

// ajustado com IA para melhorar o codigo
// confere o que a IA devolveu antes de usar: o id tem que estar na lista do usuario
// (a lista ja veio filtrada pelo usuario_id, entao se ta nela e dele) e o valor maior que zero
function validarRespostaIA(json, clientes, servicos) {
  if (!json || typeof json != 'object') {
    throw new Error('a IA nao devolveu um objeto');
  }

  const cliente = clientes.find(c => c.id == Number(json.cliente_id)) || null;
  const servico = servicos.find(s => s.id == Number(json.servico_id)) || null;
  if (json.cliente_id && !cliente) console.log('IA mandou cliente_id que nao existe:', json.cliente_id);
  if (json.servico_id && !servico) console.log('IA mandou servico_id que nao existe:', json.servico_id);

  let valor = Number(json.valor);
  if (isNaN(valor) || valor <= 0) valor = null;

  let valorDoCadastro = false;
  if (valor == null && servico) {
    valor = Number(servico.valor);
    valorDoCadastro = true;
  }

  // nao confia no "faltando" da IA, calcula de novo com o que sobrou
  const faltando = [];
  if (!cliente) faltando.push('cliente');
  if (!servico) faltando.push('servico');
  if (valor == null) faltando.push('valor');

  let descricao = typeof json.descricao == 'string' ? json.descricao.trim() : '';
  if (descricao == '' && servico) {
    descricao = servico.descricao + (cliente ? ' - ' + cliente.nome : '');
  }

  let pergunta = '';
  if (faltando.length > 0) {
    pergunta = typeof json.pergunta == 'string' && json.pergunta.trim() != '' ? json.pergunta.trim() : montaPergunta(faltando);
  }

  return {
    cliente: cliente,
    servico: servico,
    valor: valor,
    valor_do_cadastro: valorDoCadastro,
    descricao: descricao.substring(0, 500),
    faltando: faltando,
    pergunta: pergunta
  };
}

async function interpretarComIA(texto, clientes, servicos) {
  const sistema =
    'Você ajuda um MEI prestador de serviço a emitir nota fiscal. ' +
    'Ele vai dizer (por áudio transcrito) para quem fez o serviço, o que fez e quanto cobrou. ' +
    'Relacione o que ele disse com os clientes e serviços cadastrados dele. ' +
    'Regras: use só ids das listas; se não tiver certeza do cliente ou do serviço use 0; ' +
    'valor em reais como número (ex: "mil e oitocentos" = 1800), use 0 se ele não falou o valor; ' +
    'descricao é uma frase curta para a nota (ex: "Reboco da fachada"); ' +
    'faltando lista o que não deu para identificar (cliente, servico, valor); ' +
    'pergunta é uma pergunta curta e educada pedindo o que falta, ou "" se não falta nada.';

  const listaClientes = clientes.map(c => ({ id: c.id, nome: c.nome }));
  const listaServicos = servicos.map(s => ({ id: s.id, descricao: s.descricao, valor_padrao: Number(s.valor) }));

  const mensagem =
    'Clientes cadastrados:\n' + JSON.stringify(listaClientes) +
    '\n\nServiços cadastrados:\n' + JSON.stringify(listaServicos) +
    '\n\nO que o prestador disse:\n"' + texto + '"';

  const resposta = await chamarClaude(sistema, mensagem, SCHEMA_NOTA);
  const json = JSON.parse(resposta);
  return validarRespostaIA(json, clientes, servicos);
}

// funcao que o server.js usa: tenta a IA e se nao der usa a simulacao
async function interpretar(texto, clientes, servicos) {
  if (temChave()) {
    try {
      const r = await interpretarComIA(texto, clientes, servicos);
      r.origem = 'ia';
      return r;
    } catch (err) {
      console.log('erro na IA, usando a simulacao:', err.message);
    }
  }
  return interpretarSimulado(texto, clientes, servicos);
}

// =============== PERGUNTAS SOBRE O FATURAMENTO ===============
function formataReais(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// sem IA: responde sempre o total do ano e do mes atual
function responderSimulado(notas) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  let totalAno = 0;
  let totalMes = 0;
  let qtdAno = 0;
  for (const n of notas) {
    if (n.status != 'emitida' && n.status != 'enviada') continue;
    const partes = String(n.data_emissao).split('-'); // vem 'YYYY-MM-DD'
    if (Number(partes[0]) != ano) continue;
    totalAno += Number(n.valor);
    qtdAno++;
    if (Number(partes[1]) == mes) totalMes += Number(n.valor);
  }
  return 'Em ' + ano + ' você faturou ' + formataReais(totalAno) + ' em ' + qtdAno + (qtdAno == 1 ? ' nota. ' : ' notas. ') +
    'Neste mês o total é ' + formataReais(totalMes) + '. ' +
    '(Resposta automática: configure a IA para fazer outras perguntas.)';
}

async function responderFaturamento(pergunta, notas) {
  if (temChave()) {
    try {
      const sistema =
        'Você responde perguntas de um MEI sobre o faturamento dele, em português do Brasil. ' +
        'Use só as notas fiscais que estão na mensagem. Só contam como faturamento as notas com status "emitida" ou "enviada" ' +
        '(pendente ainda não foi emitida e cancelada não vale). O limite anual do MEI é R$ 81.000,00. ' +
        'Responda curto (no máximo 3 frases), em texto simples sem markdown, com os valores em reais no formato R$ 1.234,56. ' +
        'Se a pergunta não for sobre o faturamento ou as notas, diga educadamente que só responde sobre isso.';
      const lista = notas.map(n => ({
        data: n.data_emissao,
        cliente: n.cliente_nome,
        servico: n.servico_descricao,
        descricao: n.descricao,
        valor: Number(n.valor),
        status: n.status
      }));
      const hoje = new Date().toISOString().substring(0, 10);
      const mensagem = 'Hoje é ' + hoje + '.\n\nNotas fiscais:\n' + JSON.stringify(lista) + '\n\nPergunta: ' + pergunta;
      const texto = await chamarClaude(sistema, mensagem, null);
      if (texto.trim() != '') {
        return { resposta: texto.trim(), origem: 'ia' };
      }
    } catch (err) {
      console.log('erro na IA do faturamento, usando resposta simples:', err.message);
    }
  }
  return { resposta: responderSimulado(notas), origem: 'simulacao' };
}

module.exports = {
  temChave,
  interpretar,
  interpretarSimulado,
  validarRespostaIA,
  responderFaturamento
};
