import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api, baixarArquivo, formataDinheiro, pegaUsuario } from '../api.js'
import { mascaraDocumento, mascaraTelefone, soNumeros } from '../formatos.js'
import Danfse from '../components/Danfse.jsx'

// reconhecimento de voz do proprio navegador (Web Speech API)
// no Chrome e no Edge funciona, no Firefox nao tem
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition

// frases de exemplo da tela vazia (clicar coloca no campo)
const EXEMPLOS = [
  'Fiz a pintura da casa da Joana, ficou 1.500 reais',
  'Assentei o piso da Construtora Oeste, quatro mil e duzentos reais',
  'Troquei a torneira do Carlos, cobrei 250 reais'
]

// cada mensagem do chat precisa de um id pro React
let contador = 0
function novoId() {
  contador++
  return Date.now() + '-' + contador
}

function espera(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// icones (svg)
function IconeMicrofone() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

// so os campos que a api precisa pra continuar a mesma nota
function paraApi(r) {
  if (!r) return null
  return {
    cliente_id: r.cliente_id || null,
    servico_id: r.servico_id || null,
    valor: r.valor || null,
    valor_do_cadastro: r.valor_do_cadastro,
    descricao: r.descricao,
    cliente_nome_falado: r.cliente_nome_falado,
    documento: r.documento,
    aguardando: r.aguardando,
    origem: r.origem
  }
}

// o que ainda falta pra poder emitir
function oQueFalta(r) {
  const f = []
  if (!r.cliente_id) f.push('cliente')
  if (!r.servico_id) f.push('serviço')
  if (!r.valor || Number(r.valor) <= 0) f.push('valor')
  if (!String(r.descricao || '').trim()) f.push('descrição')
  return f
}

// competencia do mes atual ("2026-11")
function mesAtual() {
  const h = new Date()
  return h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0')
}

// previa da nota no formato do DANFSe
// junta o rascunho com os dados do prestador (Configuracoes), do cliente e do servico
// nos mesmos nomes de campo que a api devolve no GET /notas/:id
function Previa({ r, clientes, servicos, prestador }) {
  const cli = clientes.find(c => c.id == r.cliente_id) || {}
  const serv = servicos.find(s => s.id == r.servico_id) || {}
  const p = prestador || {}
  const n = {
    prestador_nome: p.nome, prestador_cnpj: p.cnpj, prestador_email: p.email,
    prestador_inscricao_municipal: p.inscricao_municipal, prestador_telefone: p.telefone,
    prestador_cep: p.cep, prestador_endereco: p.endereco, prestador_numero: p.numero,
    prestador_bairro: p.bairro, prestador_municipio: p.municipio, prestador_uf: p.uf,
    // cliente que ainda nao esta cadastrado: mostra o nome que a pessoa falou
    cliente_nome: cli.nome || r.cliente_nome_falado, cliente_documento: cli.documento || r.documento,
    cliente_email: cli.email, cliente_telefone: cli.telefone, cliente_cep: cli.cep, cliente_endereco: cli.endereco,
    cliente_numero: cli.numero, cliente_bairro: cli.bairro, cliente_municipio: cli.municipio, cliente_uf: cli.uf,
    codigo_tributacao: serv.codigo_tributacao, descricao_codigo: serv.descricao_codigo, codigo_nbs: serv.codigo_nbs,
    descricao: r.descricao, valor: r.valor, competencia: r.competencia || mesAtual()
  }
  return <Danfse n={n} previa />
}

// card pra cadastrar o cliente ali mesmo no chat
// fica fora do NovaNota pra nao perder o que foi digitado quando a tela atualiza
function CardCadastro({ nome, documento, ocupado, cadastrar, naoCadastrar }) {
  const [dados, setDados] = useState({ nome: nome, documento: documento, email: '', telefone: '' })
  return (
    <div className="card-cadastro">
      <div className="grade-campos">
        <div className="campo-largo">
          <label>Nome</label>
          <input value={dados.nome} onChange={e => setDados({ ...dados, nome: e.target.value })} />
        </div>
        <div className="campo-largo">
          <label>{soNumeros(dados.documento).length > 11 ? 'CNPJ' : 'CPF'}</label>
          <input value={mascaraDocumento(dados.documento)} onChange={e => setDados({ ...dados, documento: soNumeros(e.target.value) })} />
        </div>
      </div>
      <div className="grade-campos">
        <div className="campo-largo">
          <label>E-mail <span className="texto-menor">(opcional)</span></label>
          <input type="email" value={dados.email} onChange={e => setDados({ ...dados, email: e.target.value })} />
        </div>
        <div className="campo-largo">
          <label>Telefone <span className="texto-menor">(opcional)</span></label>
          <input value={mascaraTelefone(dados.telefone)} onChange={e => setDados({ ...dados, telefone: mascaraTelefone(e.target.value) })} />
        </div>
      </div>
      <div className="botoes">
        <button type="button" onClick={() => cadastrar(dados)} disabled={ocupado}>Cadastrar cliente</button>
        <button type="button" className="secundario" onClick={naoCadastrar} disabled={ocupado}>Não, é outro cliente</button>
      </div>
    </div>
  )
}

function NovaNota() {
  const [mensagens, setMensagens] = useState([])
  const [rascunho, setRascunho] = useState(null) // a nota que a conversa esta montando
  const [texto, setTexto] = useState('')
  const [gravando, setGravando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erroMic, setErroMic] = useState('')
  const [editando, setEditando] = useState(false)
  const [clientes, setClientes] = useState([])
  const [servicos, setServicos] = useState([])
  const [prestador, setPrestador] = useState(null) // dados do usuario (Configuracoes) pra previa
  const reconhecimento = useRef(null)
  const campoTexto = useRef(null)
  const fimDoChat = useRef(null)
  const usuario = pegaUsuario()

  async function carregarListas() {
    const r1 = await api('/clientes')
    if (r1.ok) setClientes(r1.dados)
    const r2 = await api('/servicos')
    if (r2.ok) setServicos(r2.dados)
    const r3 = await api('/configuracoes/dados')
    if (r3.ok) setPrestador(r3.dados)
  }

  useEffect(() => {
    carregarListas()
    // se sair da tela gravando, para o microfone
    return () => {
      if (reconhecimento.current) reconhecimento.current.abort()
    }
  }, [])

  // sempre que chega mensagem nova rola pro fim
  useEffect(() => {
    if (fimDoChat.current) fimDoChat.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens, editando])

  // o campo de texto cresce conforme escreve (ate um limite)
  useEffect(() => {
    const c = campoTexto.current
    if (!c) return
    c.style.height = 'auto'
    c.style.height = Math.min(c.scrollHeight, 200) + 'px'
  }, [texto])

  function adiciona(msg) {
    setMensagens(m => [...m, { id: novoId(), ...msg }])
  }

  function trocaMensagem(id, novo) {
    setMensagens(m => m.map(x => (x.id == id ? { ...x, ...novo } : x)))
  }

  // ajustado com IA para melhorar o codigo
  // liga/desliga o microfone. O navegador vai transformando a fala em texto
  // e o texto vai aparecendo no campo enquanto a pessoa fala (da pra corrigir antes de mandar)
  function microfone() {
    setErroMic('')
    if (!Reconhecimento) return

    if (gravando) {
      reconhecimento.current.stop()
      return
    }

    const rec = new Reconhecimento()
    rec.lang = 'pt-BR'
    rec.continuous = true // continua ouvindo ate clicar de novo
    rec.interimResults = true // mostra o texto enquanto a pessoa ainda ta falando

    // se ja tinha texto no campo, junta com o que falar agora
    const textoAntes = texto.trim() == '' ? '' : texto.trim() + ' '

    rec.onresult = (evento) => {
      let falado = ''
      for (let i = 0; i < evento.results.length; i++) {
        falado += evento.results[i][0].transcript
      }
      setTexto(textoAntes + falado)
    }
    rec.onerror = (evento) => {
      console.log('erro no microfone', evento.error)
      if (evento.error == 'not-allowed' || evento.error == 'service-not-allowed') {
        setErroMic('O navegador não deixou usar o microfone. Libere a permissão ou digite o texto.')
      } else if (evento.error == 'no-speech') {
        setErroMic('Não ouvi nada. Tente de novo falando mais perto do microfone.')
      } else if (evento.error == 'network') {
        setErroMic('O reconhecimento de voz precisa de internet. Você pode digitar o texto.')
      } else if (evento.error != 'aborted') {
        setErroMic('Não consegui gravar (' + evento.error + '). Você pode digitar o texto.')
      }
    }
    rec.onend = () => setGravando(false)

    rec.start()
    reconhecimento.current = rec
    setGravando(true)
  }

  // manda o texto pra api junto com o rascunho e troca o "Montando a sua nota..." pela previa
  async function processar(textoEnviado, base) {
    const idCarregando = novoId()
    setMensagens(m => [...m, { id: idCarregando, de: 'anota', tipo: 'carregando' }])
    setOcupado(true)
    const inicio = Date.now()
    const r = await api('/notas/interpretar', { method: 'POST', body: { texto: textoEnviado, rascunho: paraApi(base) } })
    // deixa o spinner aparecer um pouquinho mesmo quando a resposta e muito rapida
    if (Date.now() - inicio < 600) await espera(600 - (Date.now() - inicio))
    setOcupado(false)

    if (!r.ok) {
      trocaMensagem(idCarregando, { tipo: 'texto', erro: true, texto: r.dados.erro })
      return
    }
    const d = r.dados
    const novo = {
      id: base ? base.id : novoId(),
      cliente_id: d.cliente ? d.cliente.id : '',
      servico_id: d.servico ? d.servico.id : '',
      valor: d.valor || '',
      valor_do_cadastro: d.valor_do_cadastro,
      descricao: d.descricao || '',
      cliente_nome_falado: d.cliente_nome_falado,
      documento: d.documento,
      aguardando: d.aguardando,
      acao: d.acao,
      pergunta: d.pergunta,
      sugestoes: d.sugestoes || [],
      origem: d.origem
    }
    setRascunho(novo)
    setEditando(false)
    // a previa antiga dessa nota vira so o historico da pergunta, a nova aparece embaixo
    setMensagens(m => m.map(x => {
      if (x.tipo == 'previa' && x.rascunhoId == novo.id && x.status == 'ativa') return { ...x, status: 'antiga' }
      if (x.id == idCarregando) return { id: x.id, de: 'anota', tipo: 'previa', rascunhoId: novo.id, status: 'ativa', foto: novo }
      return x
    }))
  }

  function enviar(t) {
    const txt = (t != null ? t : texto).trim()
    if (txt == '' || ocupado) return
    if (gravando) reconhecimento.current.stop()
    setTexto('')
    adiciona({ de: 'eu', texto: txt })

    // o ANota ofereceu cadastrar o cliente e a pessoa respondeu "sim"
    if (rascunho && rascunho.acao == 'cadastrar_cliente' && /^(sim|pode|quero|ok|cadastra|cadastre|cadastrar|claro|isso)\b/i.test(txt)) {
      cadastrarCliente({ nome: rascunho.cliente_nome_falado, documento: rascunho.documento, email: '', telefone: '' })
      return
    }
    processar(txt, rascunho)
  }

  // Enter manda, Shift+Enter pula linha (igual chat)
  function teclou(e) {
    if (e.key == 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  // cadastra o cliente que nao existia e continua a mesma nota
  async function cadastrarCliente(dados) {
    setOcupado(true)
    const r = await api('/clientes', { method: 'POST', body: dados })
    setOcupado(false)
    if (!r.ok) {
      adiciona({ de: 'anota', tipo: 'texto', erro: true, texto: r.dados.erro })
      return
    }
    await carregarListas()
    adiciona({ de: 'anota', tipo: 'texto', texto: 'Pronto, cadastrei ' + r.dados.nome + ' nos seus clientes.' })
    await processar('', { ...rascunho, cliente_id: r.dados.id, cliente_nome_falado: '', documento: '', aguardando: '', acao: '' })
  }

  function naoCadastrar() {
    const novo = { ...rascunho, cliente_nome_falado: '', documento: '', aguardando: 'cliente', acao: '', pergunta: '', sugestoes: [] }
    setRascunho(novo)
    adiciona({ de: 'anota', tipo: 'texto', texto: 'Tudo bem. Para qual cliente foi o serviço?' })
  }

  // mudou algum campo no "Editar dados"
  function mudaRascunho(campo, valor) {
    const novo = { ...rascunho, [campo]: valor, pergunta: '', aguardando: '', acao: '', sugestoes: [] }
    if (campo == 'servico_id') {
      const s = servicos.find(x => x.id == valor)
      // trocou o servico: se o valor era o do cadastro, usa o do servico novo
      if (s && (!rascunho.valor || rascunho.valor_do_cadastro)) {
        novo.valor = Number(s.valor)
        novo.valor_do_cadastro = true
      }
      if (s && (!rascunho.descricao || servicos.some(x => x.descricao == rascunho.descricao))) novo.descricao = s.descricao
    }
    if (campo == 'valor') novo.valor_do_cadastro = false
    if (campo == 'cliente_id') {
      novo.cliente_nome_falado = ''
      novo.documento = ''
    }
    setRascunho(novo)
  }

  async function emitir() {
    const falta = oQueFalta(rascunho)
    if (falta.length > 0) return
    setOcupado(true)

    // primeiro salva a nota
    const r1 = await api('/notas', {
      method: 'POST',
      body: { cliente_id: rascunho.cliente_id, servico_id: rascunho.servico_id, descricao: rascunho.descricao, valor: rascunho.valor, competencia: rascunho.competencia || mesAtual() }
    })
    if (!r1.ok) {
      setOcupado(false)
      adiciona({ de: 'anota', tipo: 'texto', erro: true, texto: r1.dados.erro })
      return
    }

    // depois manda emitir (simulado)
    const r2 = await api('/notas/' + r1.dados.id + '/emitir', { method: 'POST' })
    setOcupado(false)
    if (!r2.ok) {
      adiciona({ de: 'anota', tipo: 'texto', erro: true, texto: r2.dados.erro + ' (a nota ficou pendente na tela Notas)' })
      return
    }

    const cli = clientes.find(c => c.id == rascunho.cliente_id)
    const final = { ...rascunho, pergunta: '', acao: '' }
    setMensagens(m => [
      ...m.map(x => (x.tipo == 'previa' && x.rascunhoId == rascunho.id && x.status == 'ativa' ? { ...x, status: 'emitida', foto: final } : x)),
      {
        id: novoId(),
        de: 'anota',
        tipo: 'emitida',
        nota: {
          id: r1.dados.id,
          numero: r2.dados.numero,
          cliente_nome: cli ? cli.nome : '',
          cliente_email: cli ? cli.email : '',
          cliente_telefone: cli ? cli.telefone : '',
          descricao: rascunho.descricao,
          valor: rascunho.valor
        }
      }
    ])
    setRascunho(null)
    setEditando(false)
  }

  // ===== botoes da nota emitida =====
  async function baixarPdf(msg) {
    trocaMensagem(msg.id, { aviso: null })
    const problema = await baixarArquivo('/notas/' + msg.nota.id + '/pdf', 'nfse-' + msg.nota.numero + '.pdf')
    if (problema) trocaMensagem(msg.id, { aviso: { erro: true, texto: problema } })
  }

  async function enviarEmail(msg) {
    if (!msg.nota.cliente_email) {
      trocaMensagem(msg.id, { aviso: { erro: true, texto: 'Esse cliente não tem e-mail cadastrado.' } })
      return
    }
    trocaMensagem(msg.id, { aviso: { texto: 'Enviando...' } })
    const r = await api('/notas/' + msg.nota.id + '/enviar-email', { method: 'POST' })
    if (r.ok) {
      trocaMensagem(msg.id, { aviso: { texto: r.dados.mensagem + '.', link: r.dados.link } })
    } else {
      trocaMensagem(msg.id, { aviso: { erro: true, texto: r.dados.erro } })
    }
  }

  function whatsapp(msg) {
    const n = msg.nota
    let tel = soNumeros(n.cliente_telefone)
    if (tel == '') {
      trocaMensagem(msg.id, { aviso: { erro: true, texto: 'Esse cliente não tem telefone cadastrado.' } })
      return
    }
    // o wa.me precisa do codigo do pais (55 = Brasil)
    if (!(tel.startsWith('55') && tel.length >= 12)) tel = '55' + tel
    const txt = 'Olá, ' + n.cliente_nome + '! Segue a nota fiscal de serviço nº ' + n.numero +
      ' referente a "' + n.descricao + '", no valor de ' + formataDinheiro(n.valor) + '. Obrigado!'
    window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(txt), '_blank')
  }

  function novaConversa() {
    if (gravando) reconhecimento.current.stop()
    setMensagens([])
    setRascunho(null)
    setEditando(false)
    setTexto('')
    setErroMic('')
  }

  // ===== partes da tela =====

  // campos do "Editar dados" (chama como funcao, nao como <Componente />, pra nao perder o foco do input)
  function camposEditar() {
    return (
      <div className="editar-dados">
        <label>Cliente</label>
        <select value={rascunho.cliente_id} onChange={e => mudaRascunho('cliente_id', e.target.value)}>
          <option value="">-- selecione --</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <label>Serviço</label>
        <select value={rascunho.servico_id} onChange={e => mudaRascunho('servico_id', e.target.value)}>
          <option value="">-- selecione --</option>
          {servicos.map(s => <option key={s.id} value={s.id}>{s.descricao}</option>)}
        </select>
        <div className="grade-campos">
          <div className="campo-largo">
            <label>Descrição do serviço</label>
            <input value={rascunho.descricao} onChange={e => mudaRascunho('descricao', e.target.value)} />
          </div>
          <div style={{ width: 140 }}>
            <label>Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={rascunho.valor} onChange={e => mudaRascunho('valor', e.target.value)} />
          </div>
          <div style={{ width: 170 }}>
            <label>Competência</label>
            <input type="month" max={mesAtual()} value={rascunho.competencia || mesAtual()} onChange={e => mudaRascunho('competencia', e.target.value)} />
          </div>
        </div>
      </div>
    )
  }

  function mostraMensagem(msg) {
    if (msg.de == 'eu') {
      return <div key={msg.id} className="balao-eu">{msg.texto}</div>
    }

    let conteudo = null
    if (msg.tipo == 'carregando') {
      conteudo = <div className="montando"><span className="spinner" /> Montando a sua nota...</div>
    } else if (msg.tipo == 'texto') {
      conteudo = <p className={msg.erro ? 'erro' : 'fala'}>{msg.texto}</p>
    } else if (msg.tipo == 'previa' && msg.status == 'antiga') {
      // historico: so a pergunta que foi feita
      conteudo = msg.foto.pergunta
        ? <p className="fala">{msg.foto.pergunta}</p>
        : <p className="texto-menor">Prévia atualizada mais abaixo.</p>
    } else if (msg.tipo == 'previa' && msg.status == 'emitida') {
      // ja virou nota, nao repete o DANFSe inteiro (o PDF tem tudo)
      conteudo = <p className="texto-menor">Prévia conferida e emitida.</p>
    } else if (msg.tipo == 'previa' && !rascunho) {
      conteudo = <Previa r={msg.foto} clientes={clientes} servicos={servicos} prestador={prestador} />
    } else if (msg.tipo == 'previa') {
      const r = rascunho
      const falta = oQueFalta(r)
      conteudo = (
        <>
          <Previa r={r} clientes={clientes} servicos={servicos} prestador={prestador} />
          <p className="origem">
            {r.origem == 'ia' ? 'interpretado por IA' : 'interpretação simulada'}
            {r.valor_do_cadastro && r.valor ? ' · valor padrão do serviço' : ''}
          </p>

          {r.pergunta && <p className="fala">{r.pergunta}</p>}
          {r.sugestoes && r.sugestoes.length > 0 && (
            <div className="sugestoes">
              {r.sugestoes.map(s => <button key={s} type="button" onClick={() => enviar(s)} disabled={ocupado}>{s}</button>)}
            </div>
          )}
          {r.acao == 'cadastrar_cliente' && (
            <CardCadastro
              nome={r.cliente_nome_falado}
              documento={r.documento}
              ocupado={ocupado}
              cadastrar={cadastrarCliente}
              naoCadastrar={naoCadastrar}
            />
          )}

          {editando && camposEditar()}
          {!r.pergunta && falta.length > 0 && <p className="fala">Falta informar: {falta.join(', ')}. Use o "Editar dados" ou me diga aqui embaixo.</p>}
          {r.acao != 'cadastrar_cliente' && (
            <div className="botoes">
              <button type="button" onClick={emitir} disabled={ocupado || falta.length > 0}>Emitir nota</button>
              <button type="button" className="secundario" onClick={() => setEditando(!editando)}>
                {editando ? 'Fechar edição' : 'Editar dados'}
              </button>
            </div>
          )}
        </>
      )
    } else if (msg.tipo == 'emitida') {
      const n = msg.nota
      conteudo = (
        <div className="nota-emitida">
          <p className="fala"><strong>Nota nº {n.numero} emitida</strong> para {n.cliente_nome}, no valor de {formataDinheiro(n.valor)}.</p>
          <div className="botoes">
            <button type="button" className="secundario" onClick={() => baixarPdf(msg)}>Baixar PDF</button>
            <button type="button" className="secundario" onClick={() => enviarEmail(msg)}>Enviar por e-mail</button>
            <button type="button" className="secundario" onClick={() => whatsapp(msg)}>WhatsApp</button>
          </div>
          {msg.aviso && (
            <p className={msg.aviso.erro ? 'erro' : 'sucesso'}>
              {msg.aviso.texto}
              {msg.aviso.link && <> Foi para uma caixa de teste: <a href={msg.aviso.link} target="_blank">ver o e-mail</a></>}
            </p>
          )}
        </div>
      )
    }

    return (
      <div key={msg.id} className="balao-anota">
        <span className="avatar-anota">A</span>
        <div className="balao-anota-conteudo">{conteudo}</div>
      </div>
    )
  }

  const primeiroNome = usuario && usuario.nome ? usuario.nome.split(' ')[0] : ''

  return (
    <div className="chat">
      {mensagens.length > 0 && (
        <div className="chat-topo">
          <button type="button" className="pequeno" onClick={novaConversa}>+ Nova conversa</button>
        </div>
      )}

      <div className="chat-mensagens">
        {mensagens.length == 0 && (
          <div className="chat-vazio">
            <h1>Olá, {primeiroNome}! O que você fez hoje?</h1>
            <p className="texto-menor">
              Conte para quem foi o serviço, o que você fez e quanto cobrou. Pode falar no microfone ou digitar.
            </p>
            <div className="exemplos">
              {EXEMPLOS.map(ex => (
                <button key={ex} type="button" onClick={() => { setTexto(ex); campoTexto.current && campoTexto.current.focus() }}>
                  "{ex}"
                </button>
              ))}
            </div>
            {(clientes.length == 0 || servicos.length == 0) && (
              <p className="texto-menor">
                Dica: cadastre seus <Link to="/servicos">serviços</Link> com as palavras-chave para o ANota reconhecer melhor.
              </p>
            )}
          </div>
        )}
        {mensagens.map(mostraMensagem)}
        <div ref={fimDoChat} className="chat-fim" />
      </div>

      <div className="chat-barra">
        {gravando && <div className="ouvindo"><span className="ponto-vermelho" /> Ouvindo... clique no microfone para parar</div>}
        {erroMic && <p className="erro" style={{ margin: '0 0 8px' }}>{erroMic}</p>}
        <div className={'chat-caixa' + (gravando ? ' gravando' : '')}>
          <textarea
            ref={campoTexto}
            rows="1"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={teclou}
            placeholder={rascunho && rascunho.pergunta ? 'Responda aqui...' : 'Ex.: Fiz a pintura da casa da Joana, ficou 1.500 reais'}
          />
          <div className="chat-botoes">
            <button
              type="button"
              className={'botao-mic' + (gravando ? ' gravando' : '')}
              onClick={microfone}
              disabled={!Reconhecimento}
              title={!Reconhecimento ? 'Seu navegador não tem reconhecimento de voz (use Chrome ou Edge)' : gravando ? 'Parar de gravar' : 'Falar'}
            >
              <IconeMicrofone />
            </button>
            <button type="button" className="botao-gerar" onClick={() => enviar()} disabled={ocupado || texto.trim() == ''}>
              Gerar prévia
            </button>
          </div>
        </div>
        <p className="chat-rodape">
          {!Reconhecimento ? 'Seu navegador não tem reconhecimento de voz (funciona no Chrome e no Edge), mas pode digitar. ' : ''}
          Emissão simulada, sem validade fiscal.
        </p>
      </div>
    </div>
  )
}

export default NovaNota
