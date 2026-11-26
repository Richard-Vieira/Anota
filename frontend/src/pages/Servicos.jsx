import { useState, useEffect } from 'react'
import { api, formataDinheiro } from '../api.js'

// copiei a tela de clientes e adaptei
function Servicos() {
  const [servicos, setServicos] = useState([])
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [editando, setEditando] = useState(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [notas, setNotas] = useState([]) // so pra contar as notas de cada servico
  const [busca, setBusca] = useState('')

  async function carregar() {
    const r = await api('/servicos')
    if (r.ok) {
      setServicos(r.dados)
    } else {
      setErro(r.dados.erro)
    }
    const r2 = await api('/notas')
    if (r2.ok) setNotas(r2.dados)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setMsg('')

    if (descricao == '' || valor == '') {
      setErro('Preencha a descrição e o valor')
      return
    }
    if (Number(valor) <= 0) {
      setErro('O valor tem que ser maior que zero')
      return
    }

    let url = '/servicos'
    let metodo = 'POST'
    if (editando) {
      url = url + '/' + editando
      metodo = 'PUT'
    }

    const r = await api(url, { method: metodo, body: { descricao, valor } })
    if (!r.ok) {
      setErro(r.dados.erro)
      return
    }
    setMsg(editando ? 'Serviço atualizado' : 'Serviço cadastrado')
    setDescricao('')
    setValor('')
    setEditando(null)
    carregar()
  }

  async function excluir(id) {
    setErro('')
    setMsg('')
    if (!confirm('Excluir esse serviço?')) return
    const r = await api('/servicos/' + id, { method: 'DELETE' })
    if (!r.ok) {
      setErro(r.dados.erro)
    } else {
      setMsg('Serviço excluído')
      carregar()
    }
  }

  // palavras-chave = as palavras da descricao que a busca usa pra achar o servico no que voce falou
  function palavrasChave(desc) {
    return desc.toLowerCase().split(/\s+/).filter(p => p.length >= 4)
  }

  function resumoServico(id) {
    const dele = notas.filter(n => n.servico_id == id && (n.status == 'emitida' || n.status == 'enviada'))
    return { qtd: dele.length, total: dele.reduce((soma, n) => soma + Number(n.valor), 0) }
  }

  function editar(s) {
    setErro('')
    setMsg('')
    setEditando(s.id)
    setDescricao(s.descricao)
    setValor(s.valor)
  }

  const filtrados = servicos.filter(s => s.descricao.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <div className="duas-colunas lista-e-form">
      <div>
        <h1>Serviços</h1>
        <input className="busca" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar serviço" />

        {filtrados.length == 0 && (
          <p className="lista-vazia">{servicos.length == 0 ? 'Nenhum serviço cadastrado ainda' : 'Nenhum serviço encontrado'}</p>
        )}
        {filtrados.map(s => {
          const r = resumoServico(s.id)
          return (
            <div className="lista-linha" key={s.id}>
              <div className="lista-info">
                <div className="lista-nome">{s.descricao}</div>
                <div className="lista-doc">Valor padrão: {formataDinheiro(s.valor)}</div>
                <div className="lista-chips">
                  {palavrasChave(s.descricao).map(p => <span key={p} className="chip">{p}</span>)}
                </div>
              </div>
              <div className="lista-numeros">
                <strong>{formataDinheiro(r.total)}</strong>
                {r.qtd} {r.qtd == 1 ? 'nota' : 'notas'}
              </div>
              <div className="lista-acoes">
                <button className="pequeno" onClick={() => editar(s)}>Editar</button>
                <button className="pequeno perigo" onClick={() => excluir(s.id)}>Excluir</button>
              </div>
            </div>
          )
        })}
      </div>

      <form className="painel" onSubmit={salvar}>
        <h2>{editando ? 'Editar serviço' : 'Novo serviço'}</h2>
        <label>Descrição</label>
        <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Pintura residencial" />
        <span className="texto-menor" style={{ display: 'block', marginTop: 6 }}>
          As palavras da descrição viram as palavras-chave para achar o serviço no áudio.
        </span>

        <label>Valor padrão (R$)</label>
        <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} />

        {erro && <p className="erro">{erro}</p>}
        {msg && <p className="sucesso">{msg}</p>}

        <div className="botoes">
          <button type="submit">Salvar serviço</button>
          {editando && (
            <button type="button" className="secundario"
              onClick={() => { setEditando(null); setDescricao(''); setValor('') }}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default Servicos
