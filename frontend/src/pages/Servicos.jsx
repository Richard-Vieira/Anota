import { useState, useEffect } from 'react'
import { api, formataDinheiro } from '../api.js'
import { mascaraCodigo, mascaraNBS, soNumeros } from '../formatos.js'

const vazio = { descricao: '', codigo_tributacao: '', descricao_codigo: '', codigo_nbs: '', valor: '', palavras_chave: '' }

// copiei a tela de clientes e adaptei
function Servicos() {
  const [servicos, setServicos] = useState([])
  const [form, setForm] = useState(vazio)
  const [editando, setEditando] = useState(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [busca, setBusca] = useState('')

  async function carregar() {
    // a api ja manda quantas notas e o total de cada servico
    const r = await api('/servicos')
    if (r.ok) {
      setServicos(r.dados)
    } else {
      setErro(r.dados.erro)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  function campo(nome, valor) {
    setForm({ ...form, [nome]: valor })
  }

  function limpar() {
    setForm(vazio)
    setEditando(null)
  }

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setMsg('')

    // a validacao de verdade ta no backend, aqui so o basico
    if (form.descricao.trim() == '' || form.valor === '') {
      setErro('Preencha a descrição e o valor')
      return
    }
    if (soNumeros(form.codigo_tributacao).length != 6) {
      setErro('O código de tributação nacional tem 6 números (00.00.00)')
      return
    }

    let url = '/servicos'
    let metodo = 'POST'
    if (editando) {
      url = url + '/' + editando
      metodo = 'PUT'
    }

    const r = await api(url, { method: metodo, body: form })
    if (!r.ok) {
      setErro(r.dados.erro)
      return
    }
    setMsg(editando ? 'Serviço atualizado' : 'Serviço cadastrado')
    limpar()
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
      if (editando == id) limpar()
      carregar()
    }
  }

  function editar(s) {
    setErro('')
    setMsg('')
    setEditando(s.id)
    setForm({
      descricao: s.descricao,
      codigo_tributacao: s.codigo_tributacao || '',
      descricao_codigo: s.descricao_codigo || '',
      codigo_nbs: s.codigo_nbs || '',
      valor: s.valor,
      palavras_chave: s.palavras_chave || ''
    })
  }

  // "pintura, pintei, tinta" -> ['pintura', 'pintei', 'tinta']
  function listaPalavras(txt) {
    return String(txt || '').split(',').map(p => p.trim()).filter(p => p != '')
  }

  const b = busca.trim().toLowerCase()
  const filtrados = servicos.filter(s =>
    s.descricao.toLowerCase().includes(b) ||
    String(s.palavras_chave || '').toLowerCase().includes(b) ||
    String(s.codigo_tributacao || '').includes(soNumeros(b) || '-')
  )

  return (
    <div className="duas-colunas lista-e-form">
      <div>
        <h1>Serviços</h1>
        <input className="busca" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, código ou palavra-chave" />

        {filtrados.length == 0 && (
          <p className="lista-vazia">{servicos.length == 0 ? 'Nenhum serviço cadastrado ainda' : 'Nenhum serviço encontrado'}</p>
        )}
        {filtrados.map(s => (
          <div className={'lista-linha' + (editando == s.id ? ' selecionada' : '')} key={s.id}>
            <div className="lista-info">
              <div className="lista-nome">
                {s.descricao}
                {s.codigo_tributacao
                  ? <span className="codigo">{mascaraCodigo(s.codigo_tributacao)}</span>
                  : <span className="codigo sem-codigo">sem código</span>}
              </div>
              {s.descricao_codigo && <div className="lista-doc lista-desc-codigo">{s.descricao_codigo}</div>}
              <div className="lista-chips">
                {listaPalavras(s.palavras_chave).map(p => <span key={p} className="chip">{p}</span>)}
                {listaPalavras(s.palavras_chave).length == 0 && <span className="texto-menor">sem palavras-chave</span>}
              </div>
            </div>
            <div className="lista-numeros">
              <strong>{formataDinheiro(s.valor)}</strong>
              {s.qtd_notas} {s.qtd_notas == 1 ? 'nota' : 'notas'}
            </div>
            <div className="lista-acoes">
              <button className="pequeno" onClick={() => editar(s)}>Editar</button>
              <button className="pequeno perigo" onClick={() => excluir(s.id)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>

      <form className="painel painel-fixo" onSubmit={salvar}>
        <h2>{editando ? 'Editar serviço' : 'Novo serviço'}</h2>
        <label>Descrição</label>
        <input value={form.descricao} onChange={e => campo('descricao', e.target.value)} placeholder="Ex.: Pintura residencial" />

        <label>Código de tributação nacional</label>
        <div className="grade-campos" style={{ alignItems: 'flex-start' }}>
          <div className="campo-cep">
            <input
              value={mascaraCodigo(form.codigo_tributacao)}
              onChange={e => campo('codigo_tributacao', soNumeros(e.target.value).substring(0, 6))}
              placeholder="00.00.00"
              inputMode="numeric"
            />
          </div>
          <p className="ajuda-codigo">
            Consulte a tabela oficial no <a href="https://www.gov.br/nfse" target="_blank">portal da NFS-e</a>.
            Ex.: construção civil e reformas: subitem 7.02 da LC 116.
          </p>
        </div>

        <label>Descrição do código</label>
        <textarea rows="2" value={form.descricao_codigo} onChange={e => campo('descricao_codigo', e.target.value)} placeholder="Copie a descrição da tabela oficial" />

        <div className="grade-campos">
          <div className="campo-metade">
            <label>Código NBS <span className="texto-menor">(opcional)</span></label>
            <input value={mascaraNBS(form.codigo_nbs)} onChange={e => campo('codigo_nbs', soNumeros(e.target.value).substring(0, 9))} placeholder="0.0000.00.00" inputMode="numeric" />
          </div>
          <div className="campo-metade">
            <label>Valor padrão (R$)</label>
            <input type="number" step="0.01" min="0" value={form.valor} onChange={e => campo('valor', e.target.value)} />
          </div>
        </div>

        <label>Palavras-chave</label>
        <input value={form.palavras_chave} onChange={e => campo('palavras_chave', e.target.value)} placeholder="pintura, pintei, tinta" />
        <span className="texto-menor" style={{ display: 'block', marginTop: 6 }}>
          Separe por vírgula. São as palavras que você costuma falar para esse serviço.
        </span>
        {listaPalavras(form.palavras_chave).length > 0 && (
          <div className="lista-chips">
            {listaPalavras(form.palavras_chave).map(p => <span key={p} className="chip">{p}</span>)}
          </div>
        )}

        {erro && <p className="erro">{erro}</p>}
        {msg && <p className="sucesso">{msg}</p>}

        <div className="botoes">
          <button type="submit">Salvar serviço</button>
          {editando && (
            <button type="button" className="secundario" onClick={limpar}>Cancelar</button>
          )}
        </div>
      </form>
    </div>
  )
}

export default Servicos
