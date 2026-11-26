// parte de IA do ANota
// se tiver IA_API_KEY no .env chama a API do Claude (Anthropic)
// se nao tiver chave ou der qualquer erro, usa a interpretacao simulada (busca de palavras)
// aqui so ENTENDE o texto. Juntar com o que ja tinha na conversa e decidir o que perguntar fica no conversa.js
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

// "pintura, pintei, Tinta" -> ['pintura', 'pintei', 'tinta'] (sem acento)
function listaPalavras(txt) {
  return String(txt || '').split(',').map(p => normaliza(p).trim()).filter(p => p != '');
}

// =============== VALOR (com numero ou por extenso) ===============
const NUMEROS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200,
  trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800,
  novecentos: 900
};
const MOEDA = ['reais', 'real', 'conto', 'contos', 'pila', 'pilas', 'pau', 'paus'];
const ANTES_DO_VALOR = ['ficou', 'cobrei', 'cobro', 'deu', 'valor', 'custou', 'por', 'foi', 'fechei', 'fechamos', 'total', 'recebi', 'paguei', 'r$'];

// "1.500" -> 1500, "1.500,50" -> 1500.5, "1,5" -> 1.5. Devolve null se nao for numero
function numeroDoTexto(tok) {
  if (!/^\d[\d.,]*$/.test(tok)) return null;
  // mais de 8 numeros seguidos e documento ou telefone, nao valor
  if (tok.replace(/\D/g, '').length > 8) return null;
  let n = tok;
  if (n.indexOf(',') >= 0) {
    n = n.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{3}($|\.)/.test(n)) {
    // "1.200" e mil e duzentos, nao 1 virgula 2
    n = n.replace(/\./g, '');
  }
  const v = parseFloat(n);
  return isNaN(v) ? null : v;
}

// ajustado com IA para melhorar o codigo
// acha o valor no texto: "1.500 reais", "R$ 1.200,50", "mil e oitocentos", "quatro mil e duzentos reais", "ficou 950"
// junta as palavras de numero seguidas e faz a conta (mil multiplica o que veio antes)
// aceitaSolto = true quando o ANota perguntou o valor (ai "1500" sozinho ja vale)
function achaValor(texto, aceitaSolto) {
  const t = normaliza(texto).replace(/r\$/g, ' r$ ').replace(/[^a-z0-9$.,\s]/g, ' ');
  // tira pontuacao do fim das palavras ("reais." -> "reais") mas mantem "1.500,00"
  const tokens = t.split(/\s+/).map(x => x.replace(/[.,]+$/, '')).filter(x => x != '');

  const candidatos = [];
  let i = 0;
  while (i < tokens.length) {
    const ehNumero = (tok) => NUMEROS[tok] != null || tok == 'mil' || numeroDoTexto(tok) != null;
    if (!ehNumero(tokens[i])) {
      i++;
      continue;
    }
    // achou o comeco de um numero, vai juntando ate acabar
    const inicio = i;
    let total = 0;
    let atual = 0;
    let soArtigo = true; // "um"/"uma" sozinho e artigo ("um muro"), nao valor
    let digitosSeguidos = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      const n = numeroDoTexto(tok);
      if (tok == 'e' && i + 1 < tokens.length && ehNumero(tokens[i + 1]) && i > inicio) {
        i++;
        continue;
      }
      if (n != null) {
        // dois numeros com digito seguidos ("529 982") nao e um valor so
        if (digitosSeguidos > 0) break;
        atual += n;
        digitosSeguidos++;
        soArtigo = false;
      } else if (tok == 'mil') {
        total += (atual || 1) * 1000;
        atual = 0;
        digitosSeguidos = 0;
        soArtigo = false;
      } else if (NUMEROS[tok] != null) {
        atual += NUMEROS[tok];
        digitosSeguidos = 0;
        if (tok != 'um' && tok != 'uma') soArtigo = false;
      } else {
        break;
      }
      i++;
    }
    const valor = total + atual;
    const antes = inicio > 0 ? tokens[inicio - 1] : '';
    const depois = i < tokens.length ? tokens[i] : '';
    let forca = 0;
    if (MOEDA.includes(depois) || antes == 'r$') forca = 3;
    else if (ANTES_DO_VALOR.includes(antes)) forca = 2;
    else if (aceitaSolto) forca = 1;
    if (soArtigo && forca < 3) forca = 0;
    if (valor > 0 && valor < 10000000 && forca > 0) {
      candidatos.push({ valor: Math.round(valor * 100) / 100, forca: forca });
    }
  }

  if (candidatos.length == 0) return null;
  // o mais "forte" ganha (com reais do lado > depois de "ficou" > solto)
  candidatos.sort((a, b) => b.forca - a.forca);
  return candidatos[0].valor;
}

// =============== NOME DO CLIENTE QUE NAO ESTA CADASTRADO ===============
// palavras que aparecem depois de "casa da", "para o"... mas nao sao nome de gente
const NAO_E_NOME = ['a', 'o', 'e', 'da', 'do', 'de', 'das', 'dos', 'que', 'ficou', 'foi', 'cobrei', 'reais', 'real', 'mil',
  'casa', 'dele', 'dela', 'por', 'com', 'no', 'na', 'em', 'um', 'uma', 'hoje', 'ontem', 'semana', 'mes', 'valor', 'servico',
  'deu', 'custou', 'ele', 'ela', 'meu', 'minha', 'sua', 'seu', 'toda', 'todo', 'inteira', 'inteiro', 'nova', 'novo', 'rua',
  'centro', 'bairro', 'cidade', 'cliente', 'frente', 'fundos', 'sala', 'cozinha', 'banheiro', 'quarto', 'area', 'mais',
  'pintura', 'piso', 'reboco', 'muro', 'telhado', 'porta', 'parede', 'janela', 'obra', 'reforma', 'conserto', 'trabalho', 'r', 'cpf', 'cnpj'];

// ajustado com IA para melhorar o codigo
// tenta achar o nome de alguem que nao esta nos clientes ("pintei a casa do Pedro Alves" -> "Pedro Alves")
// procura depois de "casa do", "loja da", "para o", "pra dona"... e devolve com a letra maiuscula
function achaNomeFalado(texto, servicos) {
  const t = normaliza(texto).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ');
  const lugares = 'casa|apartamento|apto|loja|obra|escritorio|sala|empresa|predio|terreno|muro|banheiro|cozinha|quarto|garagem|fachada|telhado|consultorio|mercado|restaurante|chacara|sitio|oficina|clinica|salao|padaria|igreja';
  const padroes = [
    new RegExp('\\b(?:' + lugares + ') d[aoe]s? ((?:dona |seu |senhor |senhora )?[a-z]+(?: [a-z]+){0,3})'),
    new RegExp('\\b(?:para|pra|pro|cliente) (?:a |o )?((?:dona |seu |senhor |senhora )?[a-z]+(?: [a-z]+){0,3})')
  ];
  // palavras dos servicos tambem nao sao nome ("pra pintura")
  const ignorar = NAO_E_NOME.concat(Object.keys(NUMEROS));
  for (const s of servicos) {
    ignorar.push(...normaliza(s.descricao).split(/\s+/));
    ignorar.push(...listaPalavras(s.palavras_chave));
  }

  for (const re of padroes) {
    const m = t.match(re);
    if (!m) continue;
    const palavras = m[1].split(' ').filter(p => !['dona', 'seu', 'senhor', 'senhora'].includes(p));
    const nome = [];
    for (let i = 0; i < palavras.length && nome.length < 4; i++) {
      const p = palavras[i];
      // "da", "de", "do" no meio do nome vale ("Maria da Silva"), no fim nao
      const proxima = palavras[i + 1];
      if (['da', 'de', 'do', 'das', 'dos'].includes(p) && nome.length > 0 && proxima && proxima.length >= 3 && !ignorar.includes(proxima)) {
        nome.push(p);
        continue;
      }
      if (p.length < 2 || ignorar.includes(p)) break;
      nome.push(p);
    }
    if (nome.length > 0 && nome[0].length >= 3) {
      return recuperaAcentos(texto, nome);
    }
  }
  return '';
}

// o nome foi achado sem acento, pega do texto original pra manter "João" em vez de "joao"
function recuperaAcentos(original, palavrasNome) {
  const originais = String(original).split(/[^A-Za-zÀ-ÿ]+/).filter(p => p != '');
  return palavrasNome.map(p => {
    if (['da', 'de', 'do', 'das', 'dos'].includes(p)) return p;
    const achou = originais.find(o => normaliza(o) == p);
    const w = achou || p;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

// =============== INTERPRETACAO SIMULADA ===============
// busca de palavras: nome do cliente, palavras-chave do servico e o valor
// aguardando = o que o ANota tinha perguntado antes ('cliente', 'servico', 'valor'...) ou ''
function interpretarSimulado(texto, clientes, servicos, aguardando) {
  const t = normaliza(texto);
  const palavrasTexto = t.split(/[^a-z0-9]+/).filter(p => p != '');

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
    } else if (primeiroNome.length >= 3 && palavrasTexto.includes(primeiroNome)) {
      pontos = 5;
      // se tiver mais partes do nome soma mais
      const partes = nome.split(' ');
      for (let j = 1; j < partes.length; j++) {
        if (partes[j].length >= 3 && palavrasTexto.includes(partes[j])) pontos++;
      }
    }
    if (pontos > melhorPonto) {
      melhorPonto = pontos;
      clienteAchado = c;
    }
  }

  // procura o servico pelas palavras-chave cadastradas e pela descricao
  // palavra-chave inteira vale 5, comeco parecido ("assentamos" ~ "assentamento") vale 2,
  // palavra da descricao vale 1 (usa so o comeco pra pegar "pintei" -> "pintura")
  const ignorar = ['de', 'da', 'do', 'e', 'em', 'com', 'para', 'pequenos', 'servico'];
  let servicoAchado = null;
  let melhor = 0;
  for (const s of servicos) {
    const desc = normaliza(s.descricao);
    let pontos = 0;
    if (t.includes(desc)) {
      pontos = 100;
    }
    for (const chave of listaPalavras(s.palavras_chave)) {
      if (chave.includes(' ')) {
        if (t.includes(chave)) pontos += 5;
      } else if (palavrasTexto.includes(chave)) {
        pontos += 5;
      } else if (chave.length >= 5 && palavrasTexto.some(p => p.length >= 5 && p.substring(0, 5) == chave.substring(0, 5))) {
        pontos += 2;
      }
    }
    for (const p of desc.split(/\s+/)) {
      if (p.length < 4 || ignorar.includes(p)) continue;
      if (palavrasTexto.some(x => x.substring(0, 4) == p.substring(0, 4))) pontos++;
    }
    if (pontos > melhor) {
      melhor = pontos;
      servicoAchado = s;
    }
  }

  // descricao da nota: o nome do servico (a pessoa pode mudar no "Editar dados")
  const descricao = servicoAchado ? servicoAchado.descricao : '';

  return {
    cliente: clienteAchado,
    servico: servicoAchado,
    valor: achaValor(texto, aguardando == 'valor'),
    descricao: descricao,
    cliente_nome_falado: clienteAchado ? '' : achaNomeFalado(texto, servicos),
    origem: 'simulacao'
  };
}

// =============== CHAMADA DA API DO CLAUDE ===============
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
    cliente_nome_falado: { type: 'string' },
    servico_id: { type: 'integer' },
    valor: { type: 'number' },
    descricao: { type: 'string' }
  },
  required: ['cliente_id', 'cliente_nome_falado', 'servico_id', 'valor', 'descricao'],
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
  if (isNaN(valor) || valor <= 0 || valor >= 10000000) valor = null;

  let nomeFalado = '';
  if (!cliente && typeof json.cliente_nome_falado == 'string') {
    // so letras e espaco, no maximo 60 letras
    nomeFalado = json.cliente_nome_falado.replace(/[^A-Za-zÀ-ÿ' ]/g, '').trim().substring(0, 60);
  }

  let descricao = typeof json.descricao == 'string' ? json.descricao.trim() : '';
  if (descricao == '' && servico) descricao = servico.descricao;

  return {
    cliente: cliente,
    servico: servico,
    valor: valor,
    descricao: descricao.substring(0, 500),
    cliente_nome_falado: nomeFalado
  };
}

// o que o ANota tinha perguntado, pra IA entender a resposta curta ("1500", "Pedro")
const PERGUNTAS_CONTEXTO = {
  cliente: 'para qual cliente foi o serviço',
  servico: 'qual serviço foi feito',
  valor: 'quanto foi cobrado',
  documento: 'o CPF ou CNPJ do cliente'
};

async function interpretarComIA(texto, clientes, servicos, aguardando) {
  const sistema =
    'Você ajuda um MEI prestador de serviço a emitir nota fiscal. ' +
    'Ele vai dizer (por áudio transcrito) para quem fez o serviço, o que fez e quanto cobrou. ' +
    'Relacione o que ele disse com os clientes e serviços cadastrados dele. ' +
    'Use as palavras-chave de cada serviço para reconhecer o serviço. ' +
    'Regras: use só ids das listas; se não tiver certeza do cliente ou do serviço use 0; ' +
    'cliente_nome_falado é o nome da pessoa ou empresa que ele falou quando ela NÃO está na lista de clientes (senão ""); ' +
    'valor em reais como número (ex: "mil e oitocentos" = 1800), use 0 se ele não falou o valor; ' +
    'descricao é uma frase curta para a nota descrevendo o serviço (ex: "Reboco da fachada"), sem o nome do cliente e sem o valor.';

  const listaClientes = clientes.map(c => ({ id: c.id, nome: c.nome }));
  const listaServicos = servicos.map(s => ({
    id: s.id,
    descricao: s.descricao,
    codigo_tributacao: s.codigo_tributacao,
    palavras_chave: s.palavras_chave || '',
    valor_padrao: Number(s.valor)
  }));

  let mensagem =
    'Clientes cadastrados:\n' + JSON.stringify(listaClientes) +
    '\n\nServiços cadastrados:\n' + JSON.stringify(listaServicos);
  if (aguardando && PERGUNTAS_CONTEXTO[aguardando]) {
    mensagem += '\n\nO sistema tinha perguntado ' + PERGUNTAS_CONTEXTO[aguardando] + '. O texto abaixo é a resposta.';
  }
  mensagem += '\n\nO que o prestador disse:\n"' + texto + '"';

  const resposta = await chamarClaude(sistema, mensagem, SCHEMA_NOTA);
  const json = JSON.parse(resposta);
  return validarRespostaIA(json, clientes, servicos);
}

// funcao que o conversa.js usa: tenta a IA e se nao der usa a simulacao
async function interpretar(texto, clientes, servicos, aguardando) {
  if (temChave()) {
    try {
      const r = await interpretarComIA(texto, clientes, servicos, aguardando);
      r.origem = 'ia';
      return r;
    } catch (err) {
      console.log('erro na IA, usando a simulacao:', err.message);
    }
  }
  return interpretarSimulado(texto, clientes, servicos, aguardando);
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
  normaliza,
  achaValor,
  achaNomeFalado,
  interpretar,
  interpretarSimulado,
  validarRespostaIA,
  responderFaturamento
};
