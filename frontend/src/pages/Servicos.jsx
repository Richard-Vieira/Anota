import { useState, useEffect } from 'react'
import { API } from '../config.js'

// copiei a tela de clientes e adaptei
function Servicos() {
  const usuario = JSON.parse(localStorage.getItem('usuario'))
  const [servicos, setServicos] = useState([])
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [editando, setEditando] = useState(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')

  function carregar() {
    fetch(API + '/servicos?usuario_id=' + usuario.id)
      .then(r => r.json())
      .then(dados => setServicos(dados))
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

    let url = API + '/servicos'
    let metodo = 'POST'
    if (editando) {
      url = url + '/' + editando
      metodo = 'PUT'
    }

    try {
      const resp = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuario.id, descricao, valor })
      })
      const resultado = await resp.json()
      if (!resp.ok) {
        setErro(resultado.erro)
        return
      }
      setMsg(editando ? 'Serviço atualizado' : 'Serviço cadastrado')
      setDescricao('')
      setValor('')
      setEditando(null)
      carregar()
    } catch (err) {
      setErro('Erro ao conectar no servidor')
    }
  }

  async function excluir(id) {
    if (!confirm('Excluir esse serviço?')) return
    setErro('')
    setMsg('')
    const resp = await fetch(API + '/servicos/' + id + '?usuario_id=' + usuario.id, { method: 'DELETE' })
    const dados = await resp.json()
    if (!resp.ok) {
      setErro(dados.erro)
    } else {
      setMsg('Serviço excluído')
      carregar()
    }
  }

  return (
    <div>
      <h2>Serviços</h2>

      <form className="card" onSubmit={salvar}>
        <h3 style={{ marginTop: 0 }}>{editando ? 'Editar serviço' : 'Novo serviço'}</h3>
        <label>Descrição</label>
        <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Pintura" />

        <label>Valor padrão (R$)</label>
        <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} />

        <button type="submit">Salvar</button>
        {editando && (
          <button type="button" className="secundario" style={{ marginLeft: 8 }}
            onClick={() => { setEditando(null); setDescricao(''); setValor('') }}>
            Cancelar
          </button>
        )}
      </form>

      {erro && <p className="erro">{erro}</p>}
      {msg && <p className="sucesso">{msg}</p>}

      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {servicos.map(s => (
            <tr key={s.id}>
              <td>{s.descricao}</td>
              <td>R$ {Number(s.valor).toFixed(2).replace('.', ',')}</td>
              <td style={{ whiteSpace: 'nowrap', width: 1 }}>
                <button className="pequeno" onClick={() => { setEditando(s.id); setDescricao(s.descricao); setValor(s.valor) }}>
                  Editar
                </button>
                <button className="pequeno perigo" onClick={() => excluir(s.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Servicos
