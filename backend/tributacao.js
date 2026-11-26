// busca do codigo de tributacao nacional (NFS-e) pela descricao do servico
// a tabela em dados/tributacao.json veio das planilhas oficiais do portal da NFS-e:
// - Anexo VI (aba MUN.INCID_INFO.SERV.): codigo de 6 numeros + descricao oficial
// - Anexo VIII (tabela de correlacao): quais codigos NBS combinam com cada subitem da LC 116
// a pessoa digita "pintura residencial" e a gente acha 07.05.01 (reforma de edificios) com NBS de pintura

const tabela = require('./dados/tributacao.json');

// "Construção" -> "construcao"
function normaliza(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const ignorar = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os', 'para', 'pra', 'com', 'por',
  'um', 'uma', 'servico', 'servicos', 'criacao', 'realizacao', 'prestacao', 'fazer', 'feito', 'trabalho', 'outros', 'outras', 'geral', 'congeneres'];

// o jeito que as pessoas falam -> as palavras que aparecem na tabela oficial
// (a tabela fala "edificios", ninguem fala isso)
const sinonimos = {
  residencial: ['edificios', 'imoveis'], residencia: ['edificios', 'imoveis'], casa: ['edificios', 'imoveis'],
  apartamento: ['edificios', 'imoveis'], predio: ['edificios'], banheiro: ['edificios', 'hidraulica'], cozinha: ['edificios'], telhado: ['edificios', 'reforma'],
  muro: ['construcao', 'edificios'], calcada: ['construcao'], comercial: ['edificios'], parede: ['edificios', 'pintura'],
  pintor: ['pintura'], pintar: ['pintura'], pintei: ['pintura'], pinturas: ['pintura'], tinta: ['pintura'], textura: ['pintura'],
  pedreiro: ['construcao', 'reforma'], obra: ['construcao'], alvenaria: ['construcao'], reboco: ['construcao', 'reforma'],
  conserto: ['reparacao', 'conserto'], consertar: ['reparacao', 'conserto'], arrumar: ['reparacao', 'conserto'],
  encanador: ['hidraulica'], encanamento: ['hidraulica'], cano: ['hidraulica'], vazamento: ['hidraulica'],
  eletricista: ['eletrica'], fiacao: ['eletrica'], tomada: ['eletrica'],
  faxina: ['limpeza'], diarista: ['limpeza'], faxineira: ['limpeza'],
  jardineiro: ['jardinagem'], grama: ['jardinagem'], poda: ['jardinagem', 'poda'],
  gesseiro: ['gesso'], drywall: ['gesso', 'divisorias'], piso: ['pisos', 'revestimentos'], azulejo: ['revestimentos'],
  cabelo: ['cabeleireiros'], cabeleireira: ['cabeleireiros'], unha: ['manicure'], manicure: ['manicure'],
  sobrancelha: ['estetica'], maquiagem: ['estetica', 'maquiagem'],
  site: ['paginas', 'eletronicas'], sites: ['paginas', 'eletronicas'], aplicativo: ['programas', 'aplicativos'],
  app: ['programas', 'aplicativos'], software: ['programas', 'sistemas'], computador: ['informatica'], ti: ['informatica'],
  formatacao: ['informatica', 'suporte'], celular: ['aparelhos'], notebook: ['informatica', 'maquinas'],
  aula: ['instrucao', 'treinamento'], aulas: ['instrucao', 'treinamento'], professor: ['instrucao', 'treinamento'],
  curso: ['instrucao', 'treinamento'], reforco: ['instrucao', 'pedagogica'],
  personal: ['ginastica', 'fisicas'], academia: ['ginastica', 'fisicas'], danca: ['danca'],
  foto: ['fotografia'], fotos: ['fotografia'], fotografo: ['fotografia'], video: ['filmagem', 'videos'], filmagem: ['filmagem'],
  frete: ['transporte', 'municipal'], mudanca: ['transporte', 'mudanca'], motorista: ['transporte'], entrega: ['transporte', 'entrega'],
  mecanico: ['veiculos', 'manutencao'], carro: ['veiculos'], moto: ['veiculos'],
  contador: ['contabilidade'], contabil: ['contabilidade'], advogado: ['advocacia'], juridico: ['advocacia'],
  marketing: ['publicidade', 'propaganda'], anuncio: ['publicidade', 'propaganda'], designer: ['desenho', 'design'], design: ['desenho', 'design'],
  arte: ['desenho', 'design'], logo: ['desenho', 'design'], logotipo: ['desenho', 'design'],
  festa: ['festas', 'eventos'], evento: ['eventos'], buffet: ['bufe', 'eventos'], dj: ['musica', 'eventos'],
  costura: ['costura', 'confeccao'], costureira: ['costura', 'confeccao'], lavanderia: ['lavanderia', 'limpeza'],
  dedetizacao: ['dedetizacao'], cupim: ['dedetizacao', 'imunizacao'], piscina: ['piscinas'],
  traducao: ['traducao', 'interpretacao'], psicologo: ['psicologia'], nutricionista: ['nutricao'], fisioterapeuta: ['fisioterapia'],
  massagem: ['massagem'], veterinario: ['veterinaria'], banho: ['banho', 'tosa'], tosa: ['tosa'], pet: ['animais'],
  consultor: ['consultoria'], assessor: ['assessoria'], instalar: ['instalacao'], instalador: ['instalacao'],
  montador: ['montagem'], moveis: ['montagem', 'moveis'], ar: ['refrigeracao', 'ar'], condicionado: ['refrigeracao']
};

// a busca compara pelo comeco da palavra ("pintei" acha "pintura", "eletricista" acha "eletrica")
function raiz(p) {
  if (p.length <= 5) return p;
  return p.substring(0, Math.max(5, p.length - 3));
}

function palavras(txt) {
  return normaliza(txt).split(' ').filter(p => p.length > 1 && !ignorar.includes(p));
}

// monta uma vez so quando o servidor sobe
const indice = tabela.map(item => ({
  item: item,
  palavrasCodigo: palavras(item.descricao),
  nbs: item.nbs.map(n => ({ nbs: n, palavras: palavras(n.descricao) }))
}));

// cada termo: { raiz, sinonimos }
// se a palavra tem sinonimo cadastrado, o sinonimo e o que a pessoa quis dizer (vale 1) e a palavra em si vale 0.6
// ("faxina" e limpeza, nao a hospedagem "com servicos diarios de faxina")
function bate(termos, lista) {
  let n = 0;
  for (const t of termos) {
    const naPalavra = lista.some(p => p.startsWith(t.raiz));
    const noSinonimo = lista.some(p => t.sinonimos.some(s => p.startsWith(s)));
    if (t.sinonimos.length == 0) n += naPalavra ? 1 : 0;
    else n += noSinonimo ? 1 : (naPalavra ? 0.6 : 0);
  }
  return n;
}

// devolve os codigos mais provaveis pra descricao digitada (o primeiro e o melhor)
// cada resultado: { codigo, descricao, nbs: { codigo, descricao } | null, nbs_opcoes: [...] }
function buscaCodigos(texto, limite = 8) {
  const numeros = String(texto || '').replace(/\D/g, '');
  const soNumero = numeros.length > 0 && normaliza(texto).replace(/[0-9 ]/g, '') == '';

  // digitou o codigo (ou o comeco dele): busca pelo numero
  if (soNumero) {
    return indice
      .filter(x => x.item.codigo.startsWith(numeros))
      .slice(0, limite)
      .map(x => resultado(x, x.nbs[0] ? x.nbs[0].nbs : null));
  }

  const ditas = palavras(texto);
  if (ditas.length == 0) return [];
  // cada termo vira a raiz dele + os sinonimos (os sinonimos ja sao palavras da tabela, nao corta)
  const termos = ditas.map(p => ({ raiz: raiz(p), sinonimos: sinonimos[p] || [] }));

  const achados = [];
  for (const x of indice) {
    const noCodigo = bate(termos, x.palavrasCodigo);
    // o NBS que mais combina (as descricoes do NBS sao mais especificas: "Servicos de pintura")
    // no empate fica o de descricao mais curta (mais especifico)
    let melhorNbs = null;
    let noNbs = 0;
    for (const n of x.nbs) {
      const q = bate(termos, n.palavras) - n.palavras.length * 0.01;
      if (q > noNbs) {
        noNbs = q;
        melhorNbs = n.nbs;
      }
    }
    // quantos termos aparecem em pelo menos um dos dois
    let cobertos = 0;
    for (const t of termos) {
      cobertos += Math.max(bate([t], x.palavrasCodigo), ...x.nbs.map(n => bate([t], n.palavras)), 0);
    }
    if (cobertos == 0) continue;
    const pontos = cobertos * 10 + noNbs * 3 + noCodigo * 2 - x.palavrasCodigo.length * 0.05;
    achados.push({ x: x, pontos: pontos, nbs: melhorNbs || (x.nbs[0] ? x.nbs[0].nbs : null) });
  }
  achados.sort((a, b) => b.pontos - a.pontos);
  return achados.slice(0, limite).map(a => resultado(a.x, a.nbs));
}

function resultado(x, nbs) {
  return {
    codigo: x.item.codigo,
    descricao: x.item.descricao,
    nbs: nbs,
    nbs_opcoes: x.item.nbs
  };
}

// pra validar o que veio do formulario
function pegaCodigo(codigo) {
  return tabela.find(item => item.codigo == codigo) || null;
}

module.exports = { buscaCodigos, pegaCodigo };
