import { useState, useEffect } from 'react'
import { api, baixarArquivo, formataDinheiro } from '../api.js'
import { soNumeros } from '../formatos.js'
import Danfse from '../components/Danfse.jsx'

const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const mesesCompletos = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// "2026-06-05" -> "05/06/2026"
function formataData(d) {
  if (!d) return ''
  const p = d.split('-')
  return p[2] + '/' + p[1] + '/' + p[0]
}

function corStatus(status) {
  if (status == 'pendente') return 'chip amarelo'
  if (status == 'cancelada') return 'chip cinza'
  return 'chip'
}

function Notas() {
  const hoje = new Date()
  const [notas, setNotas] = useState([])
  const [fat, setFat] = useState(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [linkEmail, setLinkEmail] = useState('')
  const [ocupado, setOcupado] = useState(null) // id da nota que ta processando

  // filtros (padrao: mes atual)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1) // '' = ano inteiro
  const [status, setStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')

  // detalhe da nota (DANFSe)
  const [detalhe, setDetalhe] = useState(null)

  // pergunta sobre o faturamento
  const [pergunta, setPergunta] = useState('')
  const [resposta, setResposta] = useState(null)
  const [perguntando, setPerguntando] = useState(false)

  // espera a pessoa parar de digitar a busca pra nao chamar a api a cada letra
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 350)
    return () => clearTimeout(t)
  }, [busca])

  async function carregar() {
    // os filtros vao na url e a api filtra no banco (sempre pelo usuario do token)
    const p = new URLSearchParams()
    p.set('ano', ano)
    if (mes) p.set('mes', mes)
    if (status) p.set('status', status)
    if (buscaAplicada) p.set('busca', buscaAplicada)
    const r1 = await api('/notas?' + p.toString())
    if (r1.ok) {
      setNotas(r1.dados)
    } else {
      setErro(r1.dados.erro || 'Erro ao carregar as notas')
    }

    // o resumo do periodo nao usa a situacao (faturamento e sempre emitida + enviada)
    const p2 = new URLSearchParams()
    p2.set('ano', ano)
    if (mes) p2.set('mes', mes)
    if (buscaAplicada) p2.set('busca', buscaAplicada)
    const r2 = await api('/faturamento?' + p2.toString())
    if (r2.ok) setFat(r2.dados)
  }

  useEffect(() => {
    carregar()
  }, [ano, mes, status, buscaAplicada])

  function limparMensagens() {
    setErro('')
    setMsg('')
    setLinkEmail('')
  }

  async function abrir(n) {
    limparMensagens()
    const r = await api('/notas/' + n.id)
    if (r.ok) {
      setDetalhe(r.dados)
    } else {
      setErro(r.dados.erro)
    }
  }

  async function emitir(n) {
    limparMensagens()
    if (!confirm('Emitir a nota de ' + n.cliente_nome + ' no valor de ' + formataDinheiro(n.valor) + '?')) return
    setOcupado(n.id)
    const r = await api('/notas/' + n.id + '/emitir', { method: 'POST' })
    if (r.ok) {
      setMsg('Nota nº ' + r.dados.numero + ' emitida!')
      carregar()
      if (detalhe && detalhe.id == n.id) abrir(n)
    } else {
      setErro(r.dados.erro)
    }
    setOcupado(null)
  }

  async function baixarPdf(n) {
    limparMensagens()
    setOcupado(n.id)
    const problema = await baixarArquivo('/notas/' + n.id + '/pdf', 'nfse-' + n.numero_nfse + '.pdf')
    if (problema) setErro(problema)
    setOcupado(null)
  }

  async function enviarEmail(n) {
    limparMensagens()
    if (!n.cliente_email) {
      setErro('Esse cliente não tem e-mail cadastrado')
      return
    }
    if (!confirm('Enviar a nota nº ' + n.numero_nfse + ' para ' + n.cliente_email + '?')) return
    setOcupado(n.id)
    const r = await api('/notas/' + n.id + '/enviar-email', { method: 'POST' })
    if (r.ok) {
      setMsg(r.dados.mensagem)
      // sem SMTP configurado o email vai pro Ethereal (teste), ai mostra o link pra ver
      if (r.dados.link) setLinkEmail(r.dados.link)
      carregar()
      if (detalhe && detalhe.id == n.id) setDetalhe({ ...detalhe, status: 'enviada' })
    } else {
      setErro(r.dados.erro)
    }
    setOcupado(null)
  }

  function whatsapp(n) {
    limparMensagens()
    let tel = soNumeros(n.cliente_telefone)
    if (tel == '') {
      setErro('Esse cliente não tem telefone cadastrado')
      return
    }
    // o wa.me precisa do codigo do pais (55 = Brasil)
    if (!(tel.startsWith('55') && tel.length >= 12)) tel = '55' + tel

    const texto = 'Olá, ' + n.cliente_nome + '! Segue a nota fiscal de serviço nº ' + n.numero_nfse +
      ' referente a "' + n.descricao + '", no valor de ' + formataDinheiro(n.valor) + '. Obrigado!'
    window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(texto), '_blank')
  }

  async function perguntar(e) {
    e.preventDefault()
    setResposta(null)
    if (pergunta.trim() == '') return
    setPerguntando(true)
    const r = await api('/faturamento/perguntar', { method: 'POST', body: { pergunta } })
    if (r.ok) {
      setResposta(r.dados)
    } else {
      setResposta({ resposta: r.dados.erro, origem: 'erro' })
    }
    setPerguntando(false)
  }

  // dados do grafico
  let maiorMes = 0
  let porcentagem = 0
  if (fat) {
    for (const m of fat.meses) {
      if (m.total > maiorMes) maiorMes = m.total
    }
    porcentagem = (fat.total / fat.limite_mei) * 100
  }

  // anos do filtro: o atual e os 4 anteriores
  const anos = []
  for (let a = hoje.getFullYear(); a >= hoje.getFullYear() - 4; a--) anos.push(a)

  const nomePeriodo = mes ? mesesCompletos[mes - 1] + ' de ' + ano : 'Ano de ' + ano

  // botoes de acao (iguais na linha da tabela e no detalhe)
  function acoes(n) {
    if (n.status == 'pendente') {
      return <button className="pequeno" disabled={ocupado == n.id} onClick={() => emitir(n)}>Emitir</button>
    }
    if (n.status == 'emitida' || n.status == 'enviada') {
      return (
        <>
          <button className="pequeno" disabled={ocupado == n.id} onClick={() => baixarPdf(n)}>PDF</button>
          <button className="pequeno" disabled={ocupado == n.id} onClick={() => enviarEmail(n)}>E-mail</button>
          <button className="pequeno" onClick={() => whatsapp(n)}>WhatsApp</button>
        </>
      )
    }
    return null
  }

  const mensagens = (
    <>
      {erro && <p className="erro">{erro}</p>}
      {msg && (
        <p className="sucesso">
          {msg}
          {linkEmail && <> Como o e-mail não está configurado, ele foi para uma caixa de teste: <a href={linkEmail} target="_blank">ver o e-mail</a></>}
        </p>
      )}
    </>
  )

  return (
    <div>
      {/* ===== filtros ===== */}
      <div className="filtros">
        <h1>Notas</h1>
        <div className="filtros-campos">
          <select value={mes} onChange={e => setMes(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Ano inteiro</option>
            {mesesCompletos.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={ano} onChange={e => setAno(Number(e.target.value))}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Todas as situações</option>
            <option value="pendente">Pendente</option>
            <option value="emitida">Emitida</option>
            <option value="enviada">Enviada</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente" />
        </div>
      </div>

      {/* ===== cards do periodo ===== */}
      {fat && (
        <div className="cards-resumo">
          <div className="card-resumo">
            <span className="texto-menor">Faturado em {nomePeriodo.toLowerCase()}</span>
            <strong className="valor-destaque">{formataDinheiro(fat.periodo.total)}</strong>
          </div>
          <div className="card-resumo">
            <span className="texto-menor">Notas emitidas</span>
            <strong className="valor-destaque">{fat.periodo.quantidade}</strong>
          </div>
          <div className="card-resumo">
            <span className="texto-menor">Ticket médio</span>
            <strong className="valor-destaque">{formataDinheiro(fat.periodo.ticket_medio)}</strong>
          </div>
        </div>
      )}

      {/* ===== ano + limite do MEI + grafico ===== */}
      {fat && (
        <div className="resumo">
          <div>
            <span className="texto-menor">Faturado em {fat.ano}{buscaAplicada ? ' (todos os clientes)' : ''}</span>
            <div className="valor-destaque total-grande">{formataDinheiro(fat.total)}</div>
            <div className="barra-limite">
              <div className="barra-limite-preenchida" style={{ width: Math.min(porcentagem, 100) + '%' }} />
            </div>
            <span className="texto-menor" style={porcentagem >= 80 ? { color: '#6B4300' } : {}}>
              {porcentagem.toFixed(1).replace('.', ',')}% do limite anual do MEI ({formataDinheiro(fat.limite_mei)})
            </span>
          </div>

          {/* grafico de barras feito so com div e css. Clicar no mes filtra por ele */}
          <div>
            <div className="grafico">
              {fat.meses.map(m => (
                <button
                  type="button"
                  key={m.mes}
                  className={'grafico-coluna' + (m.mes == mes ? ' selecionado' : '')}
                  title={mesesCompletos[m.mes - 1] + ': ' + formataDinheiro(m.total) + ' (clique para filtrar)'}
                  onClick={() => setMes(m.mes == mes ? '' : m.mes)}
                >
                  <div className="grafico-area">
                    <div className="grafico-barra" style={{ height: maiorMes > 0 ? (m.total / maiorMes) * 100 + '%' : 0 }} />
                  </div>
                  <span>{nomesMeses[m.mes - 1]}</span>
                </button>
              ))}
            </div>
            <p className="texto-menor" style={{ margin: '6px 0 0', textAlign: 'right' }}>Clique em um mês para filtrar</p>
          </div>
        </div>
      )}

      {/* ===== lista ===== */}
      <div className="filtro">
        <h2>{nomePeriodo}{status ? ' · ' + status : ''}</h2>
        <span className="texto-menor">{notas.length} {notas.length == 1 ? 'nota' : 'notas'}</span>
      </div>

      {!detalhe && mensagens}

      <div className="tabela-rolagem">
        <table>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Cliente</th>
              <th>Serviço</th>
              <th>Data</th>
              <th>Situação</th>
              <th className="direita">Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {notas.length == 0 && (
              <tr><td colSpan="7" className="texto-menor">Nenhuma nota nesse período</td></tr>
            )}
            {notas.map(n => (
              <tr key={n.id} className="linha-clicavel" onClick={() => abrir(n)}>
                <td className="texto-menor">{n.numero_nfse || '-'}</td>
                <td>{n.cliente_nome}</td>
                <td title={n.descricao}>{n.servico_descricao}</td>
                <td className="texto-menor">{formataData(n.data_emissao)}</td>
                <td><span className={corStatus(n.status)}>{n.status}</span></td>
                <td className="direita valor-celula">{formataDinheiro(n.valor)}</td>
                {/* os botoes nao abrem o detalhe */}
                <td className="acoes" onClick={e => e.stopPropagation()}>{acoes(n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="painel pergunta" onSubmit={perguntar} style={{ marginTop: 40 }}>
        <label>Pergunte sobre o seu faturamento</label>
        <div className="linha">
          <input
            value={pergunta}
            onChange={e => setPergunta(e.target.value)}
            placeholder="Ex.: Quanto faturei em outubro? Quem mais me pagou esse ano?"
          />
          <button type="submit" disabled={perguntando}>{perguntando ? 'Pensando...' : 'Perguntar'}</button>
        </div>
        {resposta && (
          <p className={resposta.origem == 'erro' ? 'erro' : 'resposta'}>
            {resposta.resposta}
          </p>
        )}
      </form>

      {/* ===== detalhe da nota no formato do DANFSe ===== */}
      {detalhe && (
        <div className="modal-fundo" onClick={() => setDetalhe(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-topo">
              <div>
                <h2 style={{ margin: 0 }}>Nota {detalhe.numero_nfse ? 'nº ' + detalhe.numero_nfse : 'pendente'}</h2>
                <span className={corStatus(detalhe.status)}>{detalhe.status}</span>
              </div>
              <div className="modal-acoes">
                {acoes(detalhe)}
                <button className="pequeno" onClick={() => setDetalhe(null)}>Fechar</button>
              </div>
            </div>
            {mensagens}
            <Danfse n={detalhe} previa={!detalhe.numero_nfse} />
          </div>
        </div>
      )}
    </div>
  )
}

export default Notas
