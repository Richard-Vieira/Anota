// consultas em APIs publicas (gratis e sem chave)
// - ViaCEP: endereco pelo CEP
// - BrasilAPI: dados da empresa pelo CNPJ (vem da Receita)
// o front nao chama elas direto, passa pelo backend (rotas /consulta/cep e /consulta/cnpj)

// erro "conhecido" pra rota saber qual status devolver
class ErroConsulta extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

// fetch com tempo maximo, se a API demorar demais desiste
async function buscaJson(url) {
  let resp;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  } catch (err) {
    console.log('API externa nao respondeu:', url, err.message);
    throw new ErroConsulta(502, 'O serviço de consulta não respondeu. Tente de novo ou preencha à mão.');
  }
  let dados = null;
  try {
    dados = await resp.json();
  } catch (err) {
    dados = null;
  }
  return { status: resp.status, dados: dados };
}

async function consultaCep(cep) {
  const r = await buscaJson('https://viacep.com.br/ws/' + cep + '/json/');
  if (r.status == 400) {
    throw new ErroConsulta(400, 'CEP inválido');
  }
  if (r.status == 429) {
    throw new ErroConsulta(429, 'Muitas consultas seguidas no ViaCEP. Espere um minuto e tente de novo.');
  }
  if (r.status != 200 || !r.dados) {
    throw new ErroConsulta(502, 'O serviço de CEP não respondeu. Tente de novo ou preencha à mão.');
  }
  // quando o CEP nao existe o ViaCEP responde 200 com { erro: true }
  if (r.dados.erro) {
    throw new ErroConsulta(404, 'CEP não encontrado');
  }
  return {
    cep: cep,
    endereco: r.dados.logradouro || '',
    bairro: r.dados.bairro || '',
    municipio: r.dados.localidade || '',
    uf: r.dados.uf || '',
    codigo_ibge: r.dados.ibge || ''
  };
}

// a Receita manda tudo em maiusculo, deixa so a primeira letra maiuscula pra ficar bonito
function arrumaMaiusculas(txt) {
  const minusculas = ['de', 'da', 'do', 'das', 'dos', 'e'];
  return String(txt || '').toLowerCase().split(' ').map((p, i) => {
    if (i > 0 && minusculas.includes(p)) return p;
    // siglas do tipo de empresa ficam em maiusculo
    if (['sa', 'me', 'epp', 'mei', 'ltda'].includes(p)) return p == 'ltda' ? 'Ltda' : p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' ');
}

async function consultaCnpj(cnpj) {
  const r = await buscaJson('https://brasilapi.com.br/api/cnpj/v1/' + cnpj);
  if (r.status == 404) {
    throw new ErroConsulta(404, 'CNPJ não encontrado na Receita');
  }
  if (r.status == 400) {
    throw new ErroConsulta(400, 'CNPJ inválido');
  }
  // a BrasilAPI tem limite de consultas por minuto
  if (r.status == 429) {
    throw new ErroConsulta(429, 'Muitas consultas seguidas na BrasilAPI. Espere um minuto e tente de novo.');
  }
  if (r.status != 200 || !r.dados) {
    throw new ErroConsulta(502, 'O serviço de CNPJ não respondeu. Tente de novo ou preencha à mão.');
  }
  const d = r.dados;
  // o logradouro vem sem o tipo (RUA, AVENIDA...), junta os dois
  let endereco = d.logradouro || '';
  if (d.descricao_tipo_de_logradouro && !endereco.toUpperCase().startsWith(d.descricao_tipo_de_logradouro.toUpperCase())) {
    endereco = d.descricao_tipo_de_logradouro + ' ' + endereco;
  }
  let telefone = String(d.ddd_telefone_1 || '').replace(/\D/g, '');
  if (telefone.length >= 10) {
    telefone = '(' + telefone.substring(0, 2) + ') ' + telefone.substring(2, telefone.length - 4) + '-' + telefone.substring(telefone.length - 4);
  }
  return {
    cnpj: cnpj,
    nome: arrumaMaiusculas(d.razao_social),
    nome_fantasia: arrumaMaiusculas(d.nome_fantasia),
    email: d.email ? String(d.email).toLowerCase() : '',
    telefone: telefone,
    cep: String(d.cep || '').replace(/\D/g, ''),
    endereco: arrumaMaiusculas(endereco),
    numero: d.numero || '',
    bairro: arrumaMaiusculas(d.bairro),
    municipio: arrumaMaiusculas(d.municipio),
    uf: d.uf || '',
    codigo_ibge: d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : '',
    situacao: d.descricao_situacao_cadastral || '',
    mei: d.opcao_pelo_mei === true
  };
}

module.exports = { consultaCep, consultaCnpj, ErroConsulta };
