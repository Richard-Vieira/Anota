import { useState, useEffect } from 'react'
import { api, baixarArquivo, formataDinheiro } from '../api.js'

const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const mesesCompletos = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// "2026-06-05" -> "05/06/2026"
function formataData(d) {
  if (!d) return ''
  const p = d.split('-')
  return p[2] + '/' + p[1] + '/' + p[0]
}

// "2026-11" -> "Novembro de 2026"
function nomeDoMes(anoMes) {
  const p = anoMes.split('-')
  return mesesCompletos[Number(p[1]) - 1] + ' de ' + p[0]
}

function Notas() {
  const [notas, setNotas] = useState([])
  const [fat, setFat] = useState(null)
  const [filtroMes, setFiltroMes] = useState('')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [linkEmail, setLinkEmail] = useState('')
  const [ocupado, setOcupado] = useState(null) // id da nota que ta processando

  // pergunta sobre o faturamento
  const [pergunta, setPergunta] = useState('')
  const [resposta, setResposta] = useState(null)
  const [perguntando, setPerguntando] = useState(false)

  async function carregar() {
    const r1 = await api('/notas')
    if (r1.ok) {
      setNotas(r1.dados)
    } else {
      setErro(r1.dados.erro || 'Erro ao carregar as notas')
    }
    const r2 = await api('/faturamento?ano=' + new Date().getFullYear())
    if (r2.ok) setFat(r2.dados)
  }

  useEffect(() => {
    carregar()
  }, [])

  function limparMensagens() {
    setErro('')
    setMsg('')
    setLinkEmail('')
  }

  async function emitir(n) {
    limparMensagens()
    if (!confirm('Emitir a nota de ' + n.cliente_nome + ' no valor de ' + formataDinheiro(n.valor) + '?')) return
    setOcupado(n.id)
    const r = await api('/notas/' + n.id + '/emitir', { method: 'POST' })
    if (r.ok) {
      setMsg('Nota nº ' + r.dados.numero + ' emitida!')
      carregar()
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
      setErro('Esse cliente não tem email cadastrado')
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
    } else {
      setErro(r.dados.erro)
    }
    setOcupado(null)
  }

  function whatsapp(n) {
    limparMensagens()
    let tel = String(n.cliente_telefone || '').replace(/\D/g, '')
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

  // meses que tem nota, pro filtro (ex: "2026-11")
  const mesesComNota = []
  for (const n of notas) {
    const m = n.data_emissao ? n.data_emissao.substring(0, 7) : ''
    if (m && !mesesComNota.includes(m)) mesesComNota.push(m)
  }

  const notasFiltradas = filtroMes == '' ? notas : notas.filter(n => n.data_emissao && n.data_emissao.startsWith(filtroMes))
  const totalFiltro = notasFiltradas
    .filter(n => n.status == 'emitida' || n.status == 'enviada')
    .reduce((soma, n) => soma + Number(n.valor), 0)

  // dados do grafico
  let maiorMes = 0
  let porcentagem = 0
  if (fat) {
    for (const m of fat.meses) {
      if (m.total > maiorMes) maiorMes = m.total
    }
    porcentagem = (fat.total / fat.limite_mei) * 100
  }
  const mesAtual = new Date().getMonth() + 1

  return (
    <div>
      {fat && (
        <div className="resumo">
          <div>
            <span className="texto-menor">Faturado em {fat.ano}</span>
            <div className="valor-destaque total-grande">{formataDinheiro(fat.total)}</div>
            <div className="barra-limite">
              <div className="barra-limite-preenchida" style={{ width: Math.min(porcentagem, 100) + '%' }} />
            </div>
            <span className="texto-menor" style={porcentagem >= 80 ? { color: '#6B4300' } : {}}>
              {porcentagem.toFixed(1).replace('.', ',')}% do limite anual do MEI ({formataDinheiro(fat.limite_mei)})
            </span>
          </div>

          {/* grafico de barras feito so com div e css */}
          <div className="grafico">
            {fat.meses.map(m => (
              <div key={m.mes} className="grafico-coluna" title={nomesMeses[m.mes - 1] + ': ' + formataDinheiro(m.total)}>
                <div className="grafico-area">
                  <div
                    className={'grafico-barra' + (m.mes == mesAtual ? ' atual' : '')}
                    style={{ height: maiorMes > 0 ? (m.total / maiorMes) * 100 + '%' : 0 }}
                  />
                </div>
                <span style={m.mes == mesAtual ? { color: '#16201C', fontWeight: 500 } : {}}>{nomesMeses[m.mes - 1]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <form className="painel pergunta" onSubmit={perguntar}>
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

      <div className="filtro">
        <h2>Notas emitidas</h2>
        <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
          <option value="">Todos os meses</option>
          {mesesComNota.map(m => (
            <option key={m} value={m}>{nomeDoMes(m)}</option>
          ))}
        </select>
      </div>
      {filtroMes != '' && (
        <p className="texto-menor">Faturado em {nomeDoMes(filtroMes)}: <strong style={{ color: '#16201C', fontWeight: 500 }}>{formataDinheiro(totalFiltro)}</strong></p>
      )}

      {erro && <p className="erro">{erro}</p>}
      {msg && (
        <p className="sucesso">
          {msg}
          {linkEmail && (
            <> Como o email não está configurado, ele foi para uma caixa de teste: <a href={linkEmail} target="_blank">ver o email</a></>
          )}
        </p>
      )}

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
            {notasFiltradas.length == 0 && (
              <tr><td colSpan="7" className="texto-menor">Nenhuma nota</td></tr>
            )}
            {notasFiltradas.map(n => (
              <tr key={n.id}>
                <td className="texto-menor">{n.numero_nfse || '-'}</td>
                <td>{n.cliente_nome}</td>
                <td title={n.descricao}>{n.servico_descricao}</td>
                <td className="texto-menor">{formataData(n.data_emissao)}</td>
                <td>
                  <span className={'chip' + (n.status == 'pendente' ? ' amarelo' : n.status == 'cancelada' ? ' cinza' : '')}>
                    {n.status}
                  </span>
                </td>
                <td className="direita valor-celula">{formataDinheiro(n.valor)}</td>
                <td className="acoes">
                  {n.status == 'pendente' && (
                    <button className="pequeno" disabled={ocupado == n.id} onClick={() => emitir(n)}>Emitir</button>
                  )}
                  {(n.status == 'emitida' || n.status == 'enviada') && (
                    <>
                      <button className="pequeno" disabled={ocupado == n.id} onClick={() => baixarPdf(n)}>PDF</button>
                      <button className="pequeno" disabled={ocupado == n.id} onClick={() => enviarEmail(n)}>E-mail</button>
                      <button className="pequeno" onClick={() => whatsapp(n)}>WhatsApp</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Notas
