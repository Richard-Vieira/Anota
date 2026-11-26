// API do ANota
// projeto integrador - ADS
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const val = require('./validacoes');
const { gerarToken, verificaToken } = require('./auth');
const ia = require('./ia');
const conversa = require('./conversa');
const { gerarPdf } = require('./pdf');
const { enviarEmail } = require('./email');
const cripto = require('./cripto');
const { consultaCep, consultaCnpj, ErroConsulta } = require('./consultas');

const app = express();
app.use(cors());
app.use(express.json());

// ajustado com IA para melhorar o codigo
// funcao pra nao repetir o tratamento de erro do banco em todas as rotas
function trataErro(res, err) {
  console.log('ERRO:', err.message);
  // 23503 = erro de chave estrangeira (tentou apagar algo que ta sendo usado)
  if (err.code === '23503') {
    return res.status(400).json({ erro: 'Esse registro está sendo usado em alguma nota e não pode ser excluído' });
  }
  // 22P02 = mandou texto onde era numero
  if (err.code === '22P02') {
    return res.status(400).json({ erro: 'Algum campo foi enviado com formato inválido' });
  }
  // 23505 = valor repetido em coluna UNIQUE (email ou cnpj do usuario)
  if (err.code === '23505') {
    return res.status(400).json({ erro: 'Já existe uma conta com esse email ou CNPJ' });
  }
  return res.status(500).json({ erro: 'Erro no servidor, tente novamente' });
}

app.get('/', (req, res) => {
  res.send('API do ANota funcionando');
});

// =============== CADASTRO E LOGIN ===============
// essas duas rotas sao as unicas que nao precisam do token
app.post('/cadastro', async (req, res) => {
  const { nome, cnpj, email, senha } = req.body;
  console.log('novo cadastro', email);

  if (val.vazio(nome)) {
    return res.status(400).json({ erro: 'Informe seu nome' });
  }
  if (val.vazio(cnpj)) {
    return res.status(400).json({ erro: 'Informe o CNPJ do seu MEI' });
  }
  if (!val.validarCNPJ(cnpj)) {
    return res.status(400).json({ erro: 'CNPJ inválido' });
  }
  if (val.vazio(email)) {
    return res.status(400).json({ erro: 'Informe o email' });
  }
  if (!val.validarEmail(email)) {
    return res.status(400).json({ erro: 'Email inválido' });
  }
  if (val.vazio(senha) || String(senha).length < 6) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres' });
  }

  try {
    const emailLimpo = email.trim().toLowerCase();
    const cnpjLimpo = val.soNumeros(cnpj);

    // ve se ja tem alguem com esse email ou cnpj
    const existe = await pool.query('SELECT email, cnpj FROM usuario WHERE email = $1 OR cnpj = $2', [emailLimpo, cnpjLimpo]);
    if (existe.rows.length > 0) {
      if (existe.rows[0].email == emailLimpo) {
        return res.status(400).json({ erro: 'Já existe uma conta com esse email' });
      }
      return res.status(400).json({ erro: 'Já existe uma conta com esse CNPJ' });
    }

    // nunca salva a senha pura, so o hash
    const hash = await bcrypt.hash(String(senha), 10);
    const resultado = await pool.query(
      'INSERT INTO usuario (nome, cnpj, email, senha) VALUES ($1, $2, $3, $4) RETURNING id, nome, cnpj, email',
      [nome.trim(), cnpjLimpo, emailLimpo, hash]
    );
    const usuario = resultado.rows[0];
    // ja devolve o token pra pessoa entrar direto
    res.status(201).json({ token: gerarToken(usuario), usuario: usuario });
  } catch (err) {
    trataErro(res, err);
  }
});

app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  console.log('tentando login', email);

  if (val.vazio(email) || val.vazio(senha)) {
    return res.status(400).json({ erro: 'Informe o email e a senha' });
  }
  if (!val.validarEmail(email)) {
    return res.status(400).json({ erro: 'Email inválido' });
  }

  try {
    const resultado = await pool.query('SELECT * FROM usuario WHERE email = $1', [email.trim().toLowerCase()]);
    if (resultado.rows.length == 0) {
      return res.status(400).json({ erro: 'Email ou senha incorretos' });
    }
    const usuario = resultado.rows[0];
    const ok = await bcrypt.compare(String(senha), usuario.senha);
    if (!ok) {
      return res.status(400).json({ erro: 'Email ou senha incorretos' });
    }
    // nao manda a senha de volta ne
    delete usuario.senha;
    res.json({ token: gerarToken(usuario), usuario: usuario });
  } catch (err) {
    trataErro(res, err);
  }
});

// daqui pra baixo todas as rotas usam o verificaToken
// o usuario_id vem do token (req.usuario_id), nao mais da query/body

// =============== CONSULTAS (ViaCEP e BrasilAPI) ===============
// o front chama aqui e o backend chama a API de fora (assim da pra validar e tratar o erro num lugar so)
app.get('/consulta/cep/:cep', verificaToken, async (req, res) => {
  const cep = val.soNumeros(req.params.cep);
  if (!val.validarCEP(cep)) {
    return res.status(400).json({ erro: 'O CEP precisa ter 8 números' });
  }
  try {
    res.json(await consultaCep(cep));
  } catch (err) {
    if (err instanceof ErroConsulta) return res.status(err.status).json({ erro: err.message });
    trataErro(res, err);
  }
});

app.get('/consulta/cnpj/:cnpj', verificaToken, async (req, res) => {
  const cnpj = val.soNumeros(req.params.cnpj);
  if (!val.validarCNPJ(cnpj)) {
    return res.status(400).json({ erro: 'CNPJ inválido' });
  }
  try {
    res.json(await consultaCnpj(cnpj));
  } catch (err) {
    if (err instanceof ErroConsulta) return res.status(err.status).json({ erro: err.message });
    trataErro(res, err);
  }
});

// valida os campos de endereco que se repetem no prestador e no cliente
// (todos opcionais, mas se vier tem que estar certo)
function validaEndereco(body) {
  if (!val.vazio(body.cep) && !val.validarCEP(body.cep)) return 'O CEP precisa ter 8 números';
  if (!val.vazio(body.uf) && !val.validarUF(body.uf)) return 'UF inválida (use a sigla do estado, ex: SC)';
  if (!val.vazio(body.codigo_ibge) && !val.validarIBGE(body.codigo_ibge)) return 'O código IBGE do município tem 7 números';
  if (!val.vazio(body.telefone) && !val.validarTelefone(body.telefone)) return 'Telefone inválido (coloque o DDD)';
  if (!val.vazio(body.numero) && String(body.numero).length > 10) return 'Número do endereço muito grande';
  return null;
}

// deixa vazio como null e corta o texto no tamanho da coluna
function textoOuNull(v, tamanho) {
  if (val.vazio(v)) return null;
  return String(v).trim().substring(0, tamanho);
}

// =============== CONFIGURACOES: MEUS DADOS ===============
// o "Simples Nacional" nao fica no banco: o ANota e so pra MEI, entao e sempre o mesmo texto
const SIMPLES_NACIONAL = 'Optante - Microempreendedor Individual (MEI)';

app.get('/configuracoes/dados', verificaToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nome, cnpj, email, inscricao_municipal, telefone, cep, endereco, numero, bairro, municipio, uf, codigo_ibge
       FROM usuario WHERE id = $1`,
      [req.usuario_id]
    );
    if (r.rows.length == 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    const dados = r.rows[0];
    dados.simples_nacional = SIMPLES_NACIONAL;
    res.json(dados);
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/configuracoes/dados', verificaToken, async (req, res) => {
  const b = req.body;
  if (val.vazio(b.nome)) return res.status(400).json({ erro: 'Informe o nome' });
  if (val.vazio(b.cnpj) || !val.validarCNPJ(b.cnpj)) return res.status(400).json({ erro: 'CNPJ inválido' });
  if (val.vazio(b.email) || !val.validarEmail(b.email)) return res.status(400).json({ erro: 'E-mail inválido' });
  if (!val.vazio(b.inscricao_municipal) && !/^\d{1,20}$/.test(val.soNumeros(b.inscricao_municipal))) {
    return res.status(400).json({ erro: 'Inscrição municipal inválida' });
  }
  const erroEnd = validaEndereco(b);
  if (erroEnd) return res.status(400).json({ erro: erroEnd });

  try {
    const cnpj = val.soNumeros(b.cnpj);
    const email = b.email.trim().toLowerCase();
    // outro usuario ja usa esse email ou cnpj?
    const existe = await pool.query('SELECT id FROM usuario WHERE (email = $1 OR cnpj = $2) AND id <> $3', [email, cnpj, req.usuario_id]);
    if (existe.rows.length > 0) {
      return res.status(400).json({ erro: 'Já existe outra conta com esse e-mail ou CNPJ' });
    }

    const r = await pool.query(
      `UPDATE usuario SET nome = $1, cnpj = $2, email = $3, inscricao_municipal = $4, telefone = $5, cep = $6,
              endereco = $7, numero = $8, bairro = $9, municipio = $10, uf = $11, codigo_ibge = $12
       WHERE id = $13
       RETURNING id, nome, cnpj, email, inscricao_municipal, telefone, cep, endereco, numero, bairro, municipio, uf, codigo_ibge`,
      [
        b.nome.trim().substring(0, 100), cnpj, email,
        val.vazio(b.inscricao_municipal) ? null : val.soNumeros(b.inscricao_municipal),
        textoOuNull(b.telefone, 20),
        val.vazio(b.cep) ? null : val.soNumeros(b.cep),
        textoOuNull(b.endereco, 150), textoOuNull(b.numero, 10), textoOuNull(b.bairro, 80), textoOuNull(b.municipio, 80),
        val.vazio(b.uf) ? null : b.uf.trim().toUpperCase(),
        val.vazio(b.codigo_ibge) ? null : val.soNumeros(b.codigo_ibge),
        req.usuario_id
      ]
    );
    const dados = r.rows[0];
    dados.simples_nacional = SIMPLES_NACIONAL;
    res.json(dados);
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== CONFIGURACOES: E-MAIL ===============
// a senha nunca volta pro front, so avisa se ja tem uma salva
app.get('/configuracoes/email', verificaToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM config_email WHERE usuario_id = $1', [req.usuario_id]);
    if (r.rows.length == 0) {
      return res.json({ configurado: false, smtp_host: '', smtp_porta: 587, smtp_usuario: '', nome_remetente: '', tem_senha: false });
    }
    const c = r.rows[0];
    res.json({
      configurado: true,
      smtp_host: c.smtp_host,
      smtp_porta: c.smtp_porta,
      smtp_usuario: c.smtp_usuario,
      nome_remetente: c.nome_remetente || '',
      tem_senha: !!c.smtp_senha
    });
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/configuracoes/email', verificaToken, async (req, res) => {
  const { smtp_host, smtp_porta, smtp_usuario, smtp_senha, nome_remetente } = req.body;

  // mandou tudo vazio = quer apagar a configuracao e voltar pro e-mail padrao
  if (val.vazio(smtp_host) && val.vazio(smtp_usuario) && val.vazio(smtp_senha)) {
    try {
      await pool.query('DELETE FROM config_email WHERE usuario_id = $1', [req.usuario_id]);
      return res.json({ mensagem: 'Configuração removida, as notas vão pelo e-mail padrão do sistema', configurado: false });
    } catch (err) {
      return trataErro(res, err);
    }
  }

  if (val.vazio(smtp_host) || !/^[a-zA-Z0-9.-]+$/.test(String(smtp_host).trim())) {
    return res.status(400).json({ erro: 'Servidor SMTP inválido (ex: smtp.gmail.com)' });
  }
  const porta = Number(smtp_porta);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    return res.status(400).json({ erro: 'Porta inválida (normalmente 587 ou 465)' });
  }
  if (val.vazio(smtp_usuario)) {
    return res.status(400).json({ erro: 'Informe o usuário do SMTP (normalmente o seu e-mail)' });
  }
  if (!val.vazio(smtp_senha) && !cripto.temChave()) {
    return res.status(500).json({ erro: 'O servidor está sem CRIPTO_CHAVE no .env, não dá pra salvar a senha' });
  }

  try {
    const atual = await pool.query('SELECT smtp_senha FROM config_email WHERE usuario_id = $1', [req.usuario_id]);
    // se nao mandou senha nova, mantem a que ja estava salva
    let senha = atual.rows.length > 0 ? atual.rows[0].smtp_senha : null;
    if (!val.vazio(smtp_senha)) {
      senha = cripto.criptografar(String(smtp_senha));
    }
    if (!senha) {
      return res.status(400).json({ erro: 'Informe a senha do SMTP' });
    }

    await pool.query(
      `INSERT INTO config_email (usuario_id, smtp_host, smtp_porta, smtp_usuario, smtp_senha, nome_remetente)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (usuario_id) DO UPDATE SET smtp_host = $2, smtp_porta = $3, smtp_usuario = $4, smtp_senha = $5, nome_remetente = $6`,
      [req.usuario_id, String(smtp_host).trim(), porta, String(smtp_usuario).trim().substring(0, 100), senha, textoOuNull(nome_remetente, 100)]
    );
    res.json({ mensagem: 'Configuração de e-mail salva', configurado: true, tem_senha: true });
  } catch (err) {
    trataErro(res, err);
  }
});

// pega o SMTP do usuario com a senha aberta (so usa aqui dentro, nunca manda pro front)
async function pegaConfigEmail(usuario_id) {
  const r = await pool.query('SELECT * FROM config_email WHERE usuario_id = $1', [usuario_id]);
  if (r.rows.length == 0) return null;
  const c = r.rows[0];
  try {
    c.smtp_senha = cripto.descriptografar(c.smtp_senha);
  } catch (err) {
    // trocou a CRIPTO_CHAVE e nao da mais pra abrir a senha
    console.log('nao consegui abrir a senha do smtp:', err.message);
    throw new Error('Não foi possível ler a senha do e-mail salva. Salve a senha de novo em Configurações.');
  }
  return c;
}

// POST /configuracoes/email/teste - manda um email de teste pro proprio usuario
app.post('/configuracoes/email/teste', verificaToken, async (req, res) => {
  try {
    const u = await pool.query('SELECT nome, email FROM usuario WHERE id = $1', [req.usuario_id]);
    let config;
    try {
      config = await pegaConfigEmail(req.usuario_id);
    } catch (err) {
      return res.status(400).json({ erro: err.message });
    }

    let envio;
    try {
      envio = await enviarEmail(
        u.rows[0].email,
        'Teste de e-mail do ANota',
        'Olá, ' + u.rows[0].nome + '!\n\nSe você recebeu esta mensagem, o envio de notas por e-mail do ANota está funcionando.\n\nANota',
        null,
        config
      );
    } catch (err) {
      console.log('erro no email de teste:', err.message);
      return res.status(400).json({ erro: 'Não consegui enviar: ' + err.message });
    }
    res.json({
      mensagem: 'E-mail de teste enviado para ' + u.rows[0].email,
      origem: envio.origem,
      teste: envio.teste,
      link: envio.link
    });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== CLIENTES ===============
app.get('/clientes', verificaToken, async (req, res) => {
  try {
    // ja traz quantas notas e quanto cada cliente pagou (so emitidas e enviadas, igual o faturamento)
    const dados = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM nota_fiscal n WHERE n.cliente_id = c.id AND n.status IN ('emitida', 'enviada'))::int AS qtd_notas,
              (SELECT COALESCE(SUM(n.valor), 0) FROM nota_fiscal n WHERE n.cliente_id = c.id AND n.status IN ('emitida', 'enviada')) AS total_notas
       FROM cliente c WHERE c.usuario_id = $1 ORDER BY c.nome`,
      [req.usuario_id]
    );
    res.json(dados.rows);
  } catch (err) {
    trataErro(res, err);
  }
});

// validacao do cliente (era repetida no post e no put, juntei aqui)
// o email agora e opcional: no chat da pra cadastrar so com o nome e o CPF/CNPJ
function validaCliente(body) {
  const { tipo, nome, documento, email } = body;
  if (tipo != 'PF' && tipo != 'PJ') return 'Escolha se é pessoa física ou jurídica';
  if (val.vazio(nome)) return 'O nome do cliente é obrigatório';
  if (String(nome).trim().length > 100) return 'O nome pode ter no máximo 100 letras';
  if (val.vazio(documento)) return tipo == 'PF' ? 'O CPF é obrigatório' : 'O CNPJ é obrigatório';
  if (tipo == 'PF' && !val.validarCPF(documento)) return 'CPF inválido';
  if (tipo == 'PJ' && !val.validarCNPJ(documento)) return 'CNPJ inválido';
  if (!val.vazio(email) && !val.validarEmail(email)) return 'E-mail inválido';
  return validaEndereco(body);
}

// parametros na ordem das colunas (igual no insert e no update)
function paramsCliente(b) {
  return [
    b.tipo,
    b.nome.trim(),
    val.soNumeros(b.documento),
    val.vazio(b.email) ? null : b.email.trim().toLowerCase(),
    textoOuNull(b.telefone, 20),
    val.vazio(b.cep) ? null : val.soNumeros(b.cep),
    textoOuNull(b.endereco, 150),
    textoOuNull(b.numero, 10),
    textoOuNull(b.bairro, 80),
    textoOuNull(b.municipio, 80),
    val.vazio(b.uf) ? null : b.uf.trim().toUpperCase(),
    val.vazio(b.codigo_ibge) ? null : val.soNumeros(b.codigo_ibge)
  ];
}

// nao deixa cadastrar 2 clientes com o mesmo CPF/CNPJ pro mesmo usuario
async function documentoRepetido(usuario_id, documento, idAtual) {
  const r = await pool.query(
    'SELECT nome FROM cliente WHERE usuario_id = $1 AND documento = $2 AND id <> $3',
    [usuario_id, val.soNumeros(documento), idAtual || 0]
  );
  return r.rows.length > 0 ? r.rows[0].nome : null;
}

app.post('/clientes', verificaToken, async (req, res) => {
  console.log('novo cliente', req.body.nome);

  // se nao mandar o tipo, descobre pelo tamanho do documento
  if (!req.body.tipo) {
    req.body.tipo = val.soNumeros(req.body.documento).length == 14 ? 'PJ' : 'PF';
  }
  const erro = validaCliente(req.body);
  if (erro) {
    return res.status(400).json({ erro: erro });
  }

  try {
    const repetido = await documentoRepetido(req.usuario_id, req.body.documento, 0);
    if (repetido) {
      return res.status(400).json({ erro: 'Esse CPF/CNPJ já está cadastrado para ' + repetido });
    }
    const resultado = await pool.query(
      `INSERT INTO cliente (tipo, nome, documento, email, telefone, cep, endereco, numero, bairro, municipio, uf, codigo_ibge, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [...paramsCliente(req.body), req.usuario_id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/clientes/:id', verificaToken, async (req, res) => {
  const id = req.params.id;
  if (!req.body.tipo) {
    req.body.tipo = val.soNumeros(req.body.documento).length == 14 ? 'PJ' : 'PF';
  }
  const erro = validaCliente(req.body);
  if (erro) {
    return res.status(400).json({ erro: erro });
  }

  try {
    const repetido = await documentoRepetido(req.usuario_id, req.body.documento, id);
    if (repetido) {
      return res.status(400).json({ erro: 'Esse CPF/CNPJ já está cadastrado para ' + repetido });
    }
    // o AND usuario_id garante que so altera cliente que e dele
    const res2 = await pool.query(
      `UPDATE cliente SET tipo = $1, nome = $2, documento = $3, email = $4, telefone = $5, cep = $6, endereco = $7,
              numero = $8, bairro = $9, municipio = $10, uf = $11, codigo_ibge = $12
       WHERE id = $13 AND usuario_id = $14 RETURNING *`,
      [...paramsCliente(req.body), id, req.usuario_id]
    );
    if (res2.rows.length == 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    res.json(res2.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.delete('/clientes/:id', verificaToken, async (req, res) => {
  const id = req.params.id;
  try {
    const r = await pool.query('DELETE FROM cliente WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, req.usuario_id]);
    if (r.rows.length == 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    res.json({ mensagem: 'Cliente excluído' });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== SERVICOS ===============
app.get('/servicos', verificaToken, async (req, res) => {
  try {
    // ja traz quantas notas e quanto faturou com cada servico (so emitidas e enviadas)
    const dados = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM nota_fiscal n WHERE n.servico_id = s.id AND n.status IN ('emitida', 'enviada'))::int AS qtd_notas,
              (SELECT COALESCE(SUM(n.valor), 0) FROM nota_fiscal n WHERE n.servico_id = s.id AND n.status IN ('emitida', 'enviada')) AS total_notas
       FROM servico s WHERE s.usuario_id = $1 ORDER BY s.descricao`,
      [req.usuario_id]
    );
    res.json(dados.rows);
  } catch (err) {
    trataErro(res, err);
  }
});

// validacao do servico (usa no post e no put)
// o codigo de tributacao e so conferido no formato (6 numeros), nao tem a tabela oficial aqui
function validaServico(body) {
  const { descricao, valor, codigo_tributacao, codigo_nbs, descricao_codigo, palavras_chave } = body;
  if (val.vazio(descricao)) return 'A descrição do serviço é obrigatória';
  if (String(descricao).trim().length > 150) return 'A descrição pode ter no máximo 150 letras';
  if (val.vazio(codigo_tributacao)) return 'O código de tributação nacional é obrigatório';
  if (!/^\d{6}$/.test(val.soNumeros(codigo_tributacao))) return 'O código de tributação nacional tem 6 números (00.00.00)';
  if (!val.vazio(codigo_nbs) && !/^\d{9}$/.test(val.soNumeros(codigo_nbs))) return 'O código NBS tem 9 números (0.0000.00.00)';
  if (!val.vazio(descricao_codigo) && String(descricao_codigo).length > 300) return 'A descrição do código pode ter no máximo 300 letras';
  if (!val.vazio(palavras_chave) && String(palavras_chave).length > 500) return 'Palavras-chave demais (máximo 500 letras)';
  if (val.vazio(valor)) return 'O valor é obrigatório';
  if (!val.validarValor(valor)) return 'O valor tem que ser maior que zero';
  return null;
}

// "Pintura,  pintei ,TINTA,," -> "pintura, pintei, tinta" (sem repetidas e sem vazias)
function arrumaPalavras(txt) {
  if (val.vazio(txt)) return null;
  const lista = [];
  for (const p of String(txt).split(',')) {
    const palavra = p.trim().toLowerCase();
    if (palavra != '' && !lista.includes(palavra)) lista.push(palavra);
  }
  return lista.length > 0 ? lista.join(', ') : null;
}

// monta os parametros na ordem das colunas (igual no insert e no update)
function paramsServico(b) {
  return [
    b.descricao.trim(),
    Number(String(b.valor).replace(',', '.')),
    val.soNumeros(b.codigo_tributacao),
    textoOuNull(b.descricao_codigo, 300),
    val.vazio(b.codigo_nbs) ? null : val.soNumeros(b.codigo_nbs),
    arrumaPalavras(b.palavras_chave)
  ];
}

app.post('/servicos', verificaToken, async (req, res) => {
  const erro = validaServico(req.body);
  if (erro) {
    return res.status(400).json({ erro: erro });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO servico (descricao, valor, codigo_tributacao, descricao_codigo, codigo_nbs, palavras_chave, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [...paramsServico(req.body), req.usuario_id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/servicos/:id', verificaToken, async (req, res) => {
  const id = req.params.id;
  const erro = validaServico(req.body);
  if (erro) {
    return res.status(400).json({ erro: erro });
  }

  try {
    const res2 = await pool.query(
      `UPDATE servico SET descricao = $1, valor = $2, codigo_tributacao = $3, descricao_codigo = $4, codigo_nbs = $5, palavras_chave = $6
       WHERE id = $7 AND usuario_id = $8 RETURNING *`,
      [...paramsServico(req.body), id, req.usuario_id]
    );
    if (res2.rows.length == 0) {
      return res.status(404).json({ erro: 'Serviço não encontrado' });
    }
    res.json(res2.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.delete('/servicos/:id', verificaToken, async (req, res) => {
  const id = req.params.id;
  try {
    const r = await pool.query('DELETE FROM servico WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, req.usuario_id]);
    if (r.rows.length == 0) {
      return res.status(404).json({ erro: 'Serviço não encontrado' });
    }
    res.json({ mensagem: 'Serviço excluído' });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== NOTAS ===============
// select das notas com o nome do cliente e do servico (uso em mais de um lugar)
// to_char pq senao a data vem com fuso e muda o dia
const SQL_NOTAS = `SELECT n.id, n.descricao, n.valor, to_char(n.data_emissao, 'YYYY-MM-DD') AS data_emissao, n.status,
                          n.numero_nfse, n.cliente_id, c.nome AS cliente_nome, c.email AS cliente_email,
                          c.telefone AS cliente_telefone, c.documento AS cliente_documento, n.servico_id,
                          s.descricao AS servico_descricao, s.codigo_tributacao,
                          to_char(n.competencia, 'YYYY-MM') AS competencia
                   FROM nota_fiscal n
                   JOIN cliente c ON c.id = n.cliente_id
                   JOIN servico s ON s.id = n.servico_id
                   WHERE n.usuario_id = $1`;

// ajustado com IA para melhorar o codigo
// filtros das notas (todos opcionais): ?ano=2026&mes=11&status=emitida&busca=joana
// monta o WHERE com parametros ($2, $3...) pra nao ter SQL injection
// devolve null + erro se algum filtro vier errado
function filtrosNotas(query, usuario_id, comStatus) {
  const where = ['n.usuario_id = $1'];
  const params = [usuario_id];
  const { ano, mes, status, busca } = query;

  if (!val.vazio(ano)) {
    if (!/^\d{4}$/.test(String(ano))) return { erro: 'Ano inválido' };
    params.push(Number(ano));
    where.push('EXTRACT(YEAR FROM n.data_emissao) = $' + params.length);
  }
  if (!val.vazio(mes)) {
    if (!/^\d{1,2}$/.test(String(mes)) || Number(mes) < 1 || Number(mes) > 12) return { erro: 'Mês inválido' };
    params.push(Number(mes));
    where.push('EXTRACT(MONTH FROM n.data_emissao) = $' + params.length);
  }
  if (comStatus && !val.vazio(status)) {
    if (!['pendente', 'emitida', 'enviada', 'cancelada'].includes(status)) return { erro: 'Situação inválida' };
    params.push(status);
    where.push('n.status = $' + params.length);
  }
  if (!val.vazio(busca)) {
    if (String(busca).length > 100) return { erro: 'Busca muito grande' };
    // procura pelo nome do cliente ou pelo CPF/CNPJ
    params.push('%' + String(busca).trim() + '%');
    let cond = 'c.nome ILIKE $' + params.length;
    const numeros = val.soNumeros(busca);
    if (numeros.length >= 3) {
      params.push('%' + numeros + '%');
      cond += ' OR c.documento LIKE $' + params.length;
    }
    where.push('(' + cond + ')');
  }
  return { where: where.join(' AND '), params: params };
}

app.get('/notas', verificaToken, async (req, res) => {
  const f = filtrosNotas(req.query, req.usuario_id, true);
  if (f.erro) {
    return res.status(400).json({ erro: f.erro });
  }
  try {
    const sql = SQL_NOTAS.replace('WHERE n.usuario_id = $1', 'WHERE ' + f.where);
    const dados = await pool.query(sql + ' ORDER BY n.data_emissao DESC, n.id DESC', f.params);
    res.json(dados.rows);
  } catch (err) {
    trataErro(res, err);
  }
});

app.post('/notas', verificaToken, async (req, res) => {
  const { cliente_id, servico_id, descricao, valor, competencia } = req.body;
  const usuario_id = req.usuario_id;
  console.log('criando nota', req.body);

  // competencia = mes/ano do servico ("2026-11"). Se nao mandar usa o mes atual
  // nao deixa competencia no futuro (o servico ja tem que ter sido feito)
  let comp = null;
  if (!val.vazio(competencia)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(competencia))) {
      return res.status(400).json({ erro: 'Competência inválida (use ano-mês, ex: 2026-11)' });
    }
    const hoje = new Date();
    const atual = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    if (competencia > atual) {
      return res.status(400).json({ erro: 'A competência não pode ser um mês que ainda não chegou' });
    }
    comp = competencia + '-01';
  }

  if (val.vazio(cliente_id)) {
    return res.status(400).json({ erro: 'Escolha o cliente' });
  }
  if (val.vazio(servico_id)) {
    return res.status(400).json({ erro: 'Escolha o serviço' });
  }
  if (val.vazio(descricao)) {
    return res.status(400).json({ erro: 'A descrição da nota é obrigatória' });
  }
  if (val.vazio(valor)) {
    return res.status(400).json({ erro: 'O valor é obrigatório' });
  }
  if (!val.validarValor(valor)) {
    return res.status(400).json({ erro: 'O valor tem que ser maior que zero' });
  }

  try {
    // confere se o cliente e o servico sao desse usuario mesmo
    const cli = await pool.query('SELECT id FROM cliente WHERE id = $1 AND usuario_id = $2', [cliente_id, usuario_id]);
    if (cli.rows.length == 0) {
      return res.status(400).json({ erro: 'Cliente não encontrado' });
    }
    const serv = await pool.query('SELECT id FROM servico WHERE id = $1 AND usuario_id = $2', [servico_id, usuario_id]);
    if (serv.rows.length == 0) {
      return res.status(400).json({ erro: 'Serviço não encontrado' });
    }

    const v = Number(String(valor).replace(',', '.'));
    const resultado = await pool.query(
      `INSERT INTO nota_fiscal (usuario_id, cliente_id, servico_id, descricao, valor, data_emissao, status, competencia)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'pendente', COALESCE($6::date, DATE_TRUNC('month', CURRENT_DATE)::date))
       RETURNING id, usuario_id, cliente_id, servico_id, descricao, valor, to_char(data_emissao, 'YYYY-MM-DD') AS data_emissao,
                 status, to_char(competencia, 'YYYY-MM') AS competencia`,
      [usuario_id, cliente_id, servico_id, descricao.trim().substring(0, 500), v, comp]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

// POST /notas/interpretar
// recebe o texto que a pessoa falou ou digitou no chat (o front transcreve o audio com o reconhecimento de voz do navegador)
// e o "rascunho" = o que ja se sabe da nota nas mensagens anteriores (vazio na primeira mensagem)
// a IA (ou a busca de palavras) entende o texto e o conversa.js junta com o rascunho e decide o que perguntar
app.post('/notas/interpretar', verificaToken, async (req, res) => {
  const { texto, rascunho } = req.body;
  console.log('texto recebido:', texto);

  // texto vazio so pode quando ja tem rascunho (ex: acabou de cadastrar o cliente pelo chat)
  if (val.vazio(texto) && !rascunho) {
    return res.status(400).json({ erro: 'Escreva ou fale o que você fez' });
  }
  if (String(texto || '').length > 1000) {
    return res.status(400).json({ erro: 'Texto muito grande, fale só o cliente, o serviço e o valor' });
  }

  // so aproveita do rascunho o que interessa e no formato certo (nao confia no que vem do front)
  let ant = null;
  if (rascunho && typeof rascunho == 'object') {
    const aguardandoOk = ['cliente', 'servico', 'valor', 'documento', 'cadastro'];
    ant = {
      cliente_id: Number.isInteger(Number(rascunho.cliente_id)) ? Number(rascunho.cliente_id) : null,
      servico_id: Number.isInteger(Number(rascunho.servico_id)) ? Number(rascunho.servico_id) : null,
      valor: val.validarValor(rascunho.valor) ? Number(rascunho.valor) : null,
      valor_do_cadastro: rascunho.valor_do_cadastro === true,
      descricao: typeof rascunho.descricao == 'string' ? rascunho.descricao.substring(0, 500) : '',
      cliente_nome_falado: typeof rascunho.cliente_nome_falado == 'string' ? rascunho.cliente_nome_falado.substring(0, 60) : '',
      documento: val.soNumeros(rascunho.documento).substring(0, 14),
      aguardando: aguardandoOk.includes(rascunho.aguardando) ? rascunho.aguardando : '',
      origem: rascunho.origem == 'ia' ? 'ia' : 'simulacao'
    };
  }

  try {
    // so os clientes e servicos desse usuario (filtrado pelo token)
    const clientes = await pool.query('SELECT * FROM cliente WHERE usuario_id = $1', [req.usuario_id]);
    const servicos = await pool.query('SELECT * FROM servico WHERE usuario_id = $1', [req.usuario_id]);

    const resposta = await conversa.responder(String(texto || ''), ant, clientes.rows, servicos.rows);
    console.log('resultado da interpretacao (' + resposta.origem + '):', resposta.pergunta || 'completa');
    res.json(resposta);
  } catch (err) {
    trataErro(res, err);
  }
});

// ajustado com IA para melhorar o codigo
// monta a chave de acesso SIMULADA de 50 numeros, na mesma ordem da NFS-e nacional:
// municipio IBGE (7) + ambiente gerador (1) + tipo de inscricao, 2 = CNPJ (1) + CNPJ (14)
// + numero da NFS-e (13) + ano e mes AAMM (4) + codigo aleatorio (9) + digito verificador (1)
function gerarChaveAcesso(codigoIbge, cnpj, numero, data) {
  const aamm = String(data.getFullYear()).substring(2) + String(data.getMonth() + 1).padStart(2, '0');
  const aleatorio = String(Math.floor(Math.random() * 1000000000)).padStart(9, '0');
  const base = String(codigoIbge || '0').padStart(7, '0') + '2' + '2' + String(cnpj).padStart(14, '0') +
    String(numero).padStart(13, '0') + aamm + aleatorio;
  // digito verificador modulo 11: pesos 2,3,4...9,2,3... da direita pra esquerda
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    const peso = 2 + ((base.length - 1 - i) % 8);
    soma += Number(base[i]) * peso;
  }
  let dv = 11 - (soma % 11);
  if (dv >= 10) dv = 0;
  return base + dv;
}

// POST /notas/:id/emitir
// SIMULADO: nao manda nada pro governo, so gera o proximo numero e muda o status pra emitida
// pra emitir de verdade no Sistema Nacional da NFS-e precisa:
//  - certificado digital A1 do MEI (pra assinar o XML da DPS)
//  - credenciamento no ambiente de Producao Restrita (o ambiente de testes do governo)
// TODO: trocar essa simulacao pela chamada real quando tiver o certificado
app.post('/notas/:id/emitir', verificaToken, async (req, res) => {
  const id = req.params.id;
  const usuario_id = req.usuario_id;

  try {
    const nota = await pool.query('SELECT * FROM nota_fiscal WHERE id = $1 AND usuario_id = $2', [id, usuario_id]);
    if (nota.rows.length == 0) {
      return res.status(404).json({ erro: 'Nota não encontrada' });
    }
    if (nota.rows[0].status == 'cancelada') {
      return res.status(400).json({ erro: 'Essa nota está cancelada' });
    } else if (nota.rows[0].status != 'pendente' || nota.rows[0].numero_nfse) {
      return res.status(400).json({ erro: 'Essa nota já foi emitida' });
    }

    // proximo numero da sequencia desse usuario (salvo com 6 digitos: 000001, 000002...)
    const ultimo = await pool.query('SELECT MAX(numero_nfse) AS ultimo FROM nota_fiscal WHERE usuario_id = $1', [usuario_id]);
    const numero = String(Number(ultimo.rows[0].ultimo || 0) + 1).padStart(6, '0');

    // chave de acesso SIMULADA (50 numeros) no formato da NFS-e nacional
    const u = await pool.query('SELECT cnpj, codigo_ibge FROM usuario WHERE id = $1', [usuario_id]);
    const chave = gerarChaveAcesso(u.rows[0].codigo_ibge, u.rows[0].cnpj, numero, new Date());

    // o "AND status = 'pendente'" e pra nao emitir duas vezes se clicar 2x rapido
    // a DPS usa o mesmo numero da nota e a serie 00001 (o ANota so tem uma serie)
    const r = await pool.query(
      `UPDATE nota_fiscal SET status = 'emitida', data_emissao = CURRENT_DATE, numero_nfse = $1,
              data_hora_emissao = NOW(), chave_acesso = $4, numero_dps = $5, serie_dps = '00001'
       WHERE id = $2 AND usuario_id = $3 AND status = 'pendente' AND numero_nfse IS NULL
       RETURNING id, numero_nfse, status, to_char(data_emissao, 'YYYY-MM-DD') AS data_emissao, chave_acesso`,
      [numero, id, usuario_id, chave, Number(numero)]
    );
    if (r.rows.length == 0) {
      return res.status(400).json({ erro: 'Essa nota já foi emitida' });
    }

    res.json({
      mensagem: 'Nota emitida com sucesso (simulação)',
      id: Number(id),
      numero: r.rows[0].numero_nfse,
      data_emissao: r.rows[0].data_emissao,
      chave_acesso: r.rows[0].chave_acesso,
      status: 'emitida'
    });
  } catch (err) {
    trataErro(res, err);
  }
});

// busca a nota com tudo que precisa pro DANFSe (tela), pro PDF e pro email: prestador, tomador e servico
async function buscaNotaCompleta(id, usuario_id) {
  const r = await pool.query(
    `SELECT n.id, n.descricao, n.valor, to_char(n.data_emissao, 'YYYY-MM-DD') AS data_emissao, n.status, n.numero_nfse,
            to_char(n.competencia, 'YYYY-MM') AS competencia,
            to_char(n.data_hora_emissao, 'DD/MM/YYYY HH24:MI') AS data_hora_emissao,
            n.chave_acesso, n.numero_dps, n.serie_dps,
            u.nome AS prestador_nome, u.cnpj AS prestador_cnpj, u.email AS prestador_email,
            u.inscricao_municipal AS prestador_inscricao_municipal, u.telefone AS prestador_telefone,
            u.cep AS prestador_cep, u.endereco AS prestador_endereco, u.numero AS prestador_numero,
            u.bairro AS prestador_bairro, u.municipio AS prestador_municipio, u.uf AS prestador_uf,
            c.nome AS cliente_nome, c.documento AS cliente_documento, c.email AS cliente_email, c.telefone AS cliente_telefone,
            c.cep AS cliente_cep, c.endereco AS cliente_endereco, c.numero AS cliente_numero,
            c.bairro AS cliente_bairro, c.municipio AS cliente_municipio, c.uf AS cliente_uf,
            s.descricao AS servico_descricao, s.codigo_tributacao, s.descricao_codigo, s.codigo_nbs
     FROM nota_fiscal n
     JOIN usuario u ON u.id = n.usuario_id
     JOIN cliente c ON c.id = n.cliente_id
     JOIN servico s ON s.id = n.servico_id
     WHERE n.id = $1 AND n.usuario_id = $2`,
    [id, usuario_id]
  );
  return r.rows[0];
}

// GET /notas/:id - a nota completa (a tela Notas mostra no formato do DANFSe)
app.get('/notas/:id', verificaToken, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ erro: 'Nota inválida' });
  }
  try {
    const nota = await buscaNotaCompleta(req.params.id, req.usuario_id);
    if (!nota) {
      return res.status(404).json({ erro: 'Nota não encontrada' });
    }
    res.json(nota);
  } catch (err) {
    trataErro(res, err);
  }
});

// GET /notas/:id/pdf - baixa o PDF da nota
app.get('/notas/:id/pdf', verificaToken, async (req, res) => {
  try {
    const nota = await buscaNotaCompleta(req.params.id, req.usuario_id);
    if (!nota) {
      return res.status(404).json({ erro: 'Nota não encontrada' });
    }
    if (!nota.numero_nfse) {
      return res.status(400).json({ erro: 'Emita a nota antes de gerar o PDF' });
    }

    const pdf = await gerarPdf(nota);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="nfse-' + nota.numero_nfse + '.pdf"');
    res.send(pdf);
  } catch (err) {
    trataErro(res, err);
  }
});

// POST /notas/:id/enviar-email - manda o PDF pro email do cliente
app.post('/notas/:id/enviar-email', verificaToken, async (req, res) => {
  try {
    const nota = await buscaNotaCompleta(req.params.id, req.usuario_id);
    if (!nota) {
      return res.status(404).json({ erro: 'Nota não encontrada' });
    }
    if (nota.status != 'emitida' && nota.status != 'enviada') {
      return res.status(400).json({ erro: 'Só dá pra enviar nota emitida' });
    }
    if (val.vazio(nota.cliente_email)) {
      return res.status(400).json({ erro: 'Esse cliente não tem email cadastrado' });
    }

    const pdf = await gerarPdf(nota);
    const valor = Number(nota.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const texto =
      'Olá, ' + nota.cliente_nome + '!\n\n' +
      'Segue em anexo a nota fiscal de serviço nº ' + nota.numero_nfse + ', ' +
      'referente a "' + nota.descricao + '", no valor de ' + valor + '.\n\n' +
      'Obrigado pela preferência!\n' + nota.prestador_nome;

    // usa o SMTP que o usuario salvou em Configuracoes (se nao tiver, o email.js usa o .env ou o Ethereal)
    let config;
    try {
      config = await pegaConfigEmail(req.usuario_id);
    } catch (err) {
      return res.status(400).json({ erro: err.message });
    }

    let envio;
    try {
      envio = await enviarEmail(nota.cliente_email, 'Nota fiscal nº ' + nota.numero_nfse, texto, {
        filename: 'nfse-' + nota.numero_nfse + '.pdf',
        content: pdf
      }, config);
    } catch (err) {
      console.log('erro ao mandar email:', err.message);
      return res.status(500).json({ erro: 'Não foi possível enviar o e-mail. Confira a configuração em Configurações > E-mail.' });
    }

    await pool.query("UPDATE nota_fiscal SET status = 'enviada' WHERE id = $1 AND usuario_id = $2", [nota.id, req.usuario_id]);

    res.json({
      mensagem: 'Email enviado para ' + nota.cliente_email,
      status: 'enviada',
      teste: envio.teste,
      link: envio.link // so vem quando e conta de teste (Ethereal)
    });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== FATURAMENTO ===============
// conta as notas emitidas e as enviadas (enviada = emitida e ja mandada pro cliente)
app.get('/faturamento', verificaToken, async (req, res) => {
  let ano = req.query.ano;
  if (val.vazio(ano)) {
    ano = new Date().getFullYear();
  }
  if (!/^\d{4}$/.test(String(ano))) {
    return res.status(400).json({ erro: 'Ano inválido' });
  }

  try {
    const total = await pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM nota_fiscal
       WHERE usuario_id = $1 AND status IN ('emitida', 'enviada') AND EXTRACT(YEAR FROM data_emissao) = $2`,
      [req.usuario_id, ano]
    );
    const porMes = await pool.query(
      `SELECT EXTRACT(MONTH FROM data_emissao) AS mes, SUM(valor) AS total FROM nota_fiscal
       WHERE usuario_id = $1 AND status IN ('emitida', 'enviada') AND EXTRACT(YEAR FROM data_emissao) = $2
       GROUP BY mes ORDER BY mes`,
      [req.usuario_id, ano]
    );

    // resumo do periodo filtrado (mes + busca por cliente): total, quantidade e ticket medio
    // so conta emitida e enviada (pendente ainda nao foi emitida e cancelada nao vale)
    const f = filtrosNotas({ ano: ano, mes: req.query.mes, busca: req.query.busca }, req.usuario_id, false);
    if (f.erro) {
      return res.status(400).json({ erro: f.erro });
    }
    const periodo = await pool.query(
      `SELECT COALESCE(SUM(n.valor), 0) AS total, COUNT(*)::int AS quantidade
       FROM nota_fiscal n JOIN cliente c ON c.id = n.cliente_id
       WHERE ` + f.where + ` AND n.status IN ('emitida', 'enviada')`,
      f.params
    );
    const totalPeriodo = Number(periodo.rows[0].total);
    const qtdPeriodo = periodo.rows[0].quantidade;

    // monta os 12 meses, os que nao tem nota ficam 0
    const meses = [];
    for (let m = 1; m <= 12; m++) {
      const achou = porMes.rows.find(r => Number(r.mes) == m);
      meses.push({ mes: m, total: achou ? Number(achou.total) : 0 });
    }

    res.json({
      ano: Number(ano),
      total: Number(total.rows[0].total),
      // limite do MEI = 81 mil por ano (conferir se mudou)
      limite_mei: 81000,
      meses: meses,
      periodo: {
        mes: val.vazio(req.query.mes) ? null : Number(req.query.mes),
        total: totalPeriodo,
        quantidade: qtdPeriodo,
        ticket_medio: qtdPeriodo > 0 ? Math.round((totalPeriodo / qtdPeriodo) * 100) / 100 : 0
      }
    });
  } catch (err) {
    trataErro(res, err);
  }
});

// POST /faturamento/perguntar - pergunta em texto, tipo "quanto faturei em outubro?"
app.post('/faturamento/perguntar', verificaToken, async (req, res) => {
  const { pergunta } = req.body;
  console.log('pergunta do faturamento:', pergunta);

  if (val.vazio(pergunta)) {
    return res.status(400).json({ erro: 'Escreva sua pergunta' });
  }
  if (String(pergunta).length > 300) {
    return res.status(400).json({ erro: 'Pergunta muito grande' });
  }

  try {
    const notas = await pool.query(SQL_NOTAS + ' ORDER BY n.data_emissao', [req.usuario_id]);
    const resposta = await ia.responderFaturamento(String(pergunta), notas.rows);
    res.json(resposta);
  } catch (err) {
    trataErro(res, err);
  }
});

// app.get('/teste', (req, res) => {
//   res.json({ ok: true });
// });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('servidor rodando na porta ' + PORT);
  console.log(ia.temChave() ? 'IA: usando a API do Claude' : 'IA: sem IA_API_KEY, usando a interpretacao simulada');
});
