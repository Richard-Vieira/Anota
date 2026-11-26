import { useState, useEffect, useRef } from 'react'
import { api, formataDinheiro } from '../api.js'
import { mascaraCodigo, mascaraNBS, soNumeros } from '../formatos.js'

const vazio = { descricao: '', codigo_tributacao: '', descricao_codigo: '', codigo_nbs: '', valor: '', palavras_chave: '' }

// "070501" -> "07.05.01 · Reparação, conservação e reforma de edifícios..." encurtado
function encurta(txt, tamanho) {
  txt = String(txt || '')
  return txt.length > tamanho ? txt.substring(0, tamanho).trim() + '...' : txt
}

// copiei a tela de clientes e adaptei
function Servicos() {
  const [servicos, setServicos] = useState([])
  const [form, setForm] = useState(vazio)
  const [editando, setEditando] = useState(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [busca, setBusca] = useState('')
  // codigo de tributacao: a tela busca sozinha pela descricao e ja escolhe o primeiro
  const [sugestoes, setSugestoes] = useState([])
  const [opcoesNbs, setOpcoesNbs] = useState([])
  const [escolhaManual, setEscolhaManual] = useState(false) // a pessoa escolheu na lista, nao troca mais sozinho
  const [trocandoCodigo, setTrocandoCodigo] = useState(false)
  const [buscaCodigo, setBuscaCodigo] = useState('')
  const [buscando, setBuscando] = useState(false) // esperando a pessoa parar de digitar
  const espera = useRef(null)

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
    setSugestoes([])
    setOpcoesNbs([])
    setEscolhaManual(false)
    setTrocandoCodigo(false)
    setBuscaCodigo('')
    setBuscando(false)
    clearTimeout(espera.current)
  }

  // pergunta pro backend quais codigos combinam com o texto (espera a pessoa parar de digitar)
  function procuraCodigos(texto, depois) {
    clearTimeout(espera.current)
    if (texto.trim().length < 3) {
      setSugestoes([])
      setBuscando(false)
      return
    }
    setBuscando(true)
    espera.current = setTimeout(async () => {
      const r = await api('/consulta/tributacao?q=' + encodeURIComponent(texto))
      setBuscando(false)
      if (r.ok) {
        setSugestoes(r.dados)
        if (depois) depois(r.dados)
      }
    }, 800)
  }

  // coloca o codigo no formulario (com a descricao oficial e o NBS que combina)
  function usaCodigo(base, s) {
    setOpcoesNbs(s.nbs_opcoes || [])
    return {
      ...base,
      codigo_tributacao: s.codigo,
      descricao_codigo: s.descricao,
      codigo_nbs: s.nbs ? s.nbs.codigo : ''
    }
  }

  function digitouDescricao(valor) {
    // apagou a descricao: o codigo vai junto (mesmo se tinha escolhido na lista)
    if (valor.trim() == '') {
      clearTimeout(espera.current)
      setForm({ ...form, descricao: valor, codigo_tributacao: '', descricao_codigo: '', codigo_nbs: '' })
      setOpcoesNbs([])
      setSugestoes([])
      setEscolhaManual(false)
      setBuscando(false)
      return
    }
    if (escolhaManual) {
      setForm({ ...form, descricao: valor })
      return
    }
    // enquanto digita o codigo some, e so volta quando parar de digitar
    setForm({ ...form, descricao: valor, codigo_tributacao: '', descricao_codigo: '', codigo_nbs: '' })
    setOpcoesNbs([])
    // ainda nao escolheu: o primeiro da busca ja entra no formulario
    procuraCodigos(valor, lista => {
      setForm(atual => {
        if (atual.descricao != valor) return atual
        if (lista.length == 0) return { ...atual, codigo_tributacao: '', descricao_codigo: '', codigo_nbs: '' }
        return usaCodigo(atual, lista[0])
      })
    })
  }

  function escolheCodigo(s) {
    setForm(usaCodigo(form, s))
    setEscolhaManual(true)
    setTrocandoCodigo(false)
  }

  function abreTroca() {
    setTrocandoCodigo(true)
    setBuscaCodigo(form.descricao)
    procuraCodigos(form.descricao)
  }

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setMsg('')

    // a validacao de verdade ta no backend, aqui so o basico
    if (form.descricao.trim() == '') {
      setErro('Preencha a descrição')
      return
    }
    if (soNumeros(form.codigo_tributacao).length != 6) {
      setErro('Escolha o código de tributação na lista')
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
      valor: s.valor == null ? '' : s.valor,
      palavras_chave: s.palavras_chave || ''
    })
    // ja tem codigo: nao troca sozinho quando mexer na descricao
    setEscolhaManual(!!s.codigo_tributacao)
    setTrocandoCodigo(!s.codigo_tributacao)
    setBuscaCodigo(s.descricao)
    setSugestoes([])
    setOpcoesNbs([])
    if (s.codigo_tributacao) {
      // busca pelo numero so pra ter a lista de NBS desse codigo
      api('/consulta/tributacao?q=' + s.codigo_tributacao).then(r => {
        if (r.ok && r.dados[0]) setOpcoesNbs(r.dados[0].nbs_opcoes)
      })
    } else {
      procuraCodigos(s.descricao)
    }
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
              {s.valor != null ? <strong>{formataDinheiro(s.valor)}</strong> : <span className="texto-menor">valor na hora</span>}
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
        <input value={form.descricao} onChange={e => digitouDescricao(e.target.value)} placeholder="Ex.: Pintura residencial" />

        <label>Código de tributação nacional</label>
        {form.codigo_tributacao && !trocandoCodigo && (
          <div className="codigo-escolhido">
            <div>
              <span className="codigo">{mascaraCodigo(form.codigo_tributacao)}</span>
              {!escolhaManual && <span className="texto-menor"> escolhido pela descrição</span>}
              <p>{form.descricao_codigo}</p>
            </div>
            <button type="button" className="pequeno secundario" onClick={abreTroca}>Trocar</button>
          </div>
        )}
        {!form.codigo_tributacao && !trocandoCodigo && (
          <p className="ajuda-codigo codigo-vazio">
            {form.descricao.trim().length < 3
              ? 'Digite a descrição do serviço que o código aparece aqui sozinho.'
              : buscando
              ? 'Procurando o código...'
              : <>Não achei um código para essa descrição. <a href="#" onClick={e => { e.preventDefault(); abreTroca() }}>Procurar na lista</a></>}
          </p>
        )}
        {trocandoCodigo && (
          <div className="troca-codigo">
            <input
              autoFocus
              value={buscaCodigo}
              onChange={e => { setBuscaCodigo(e.target.value); procuraCodigos(e.target.value) }}
              placeholder="Busque pelo que você faz (ex.: faxina, eletricista) ou pelo número"
            />
            <div className="lista-codigos">
              {sugestoes.length == 0 && <p className="texto-menor">{buscaCodigo.trim().length < 3 ? 'Digite pelo menos 3 letras' : 'Nada encontrado, tente outra palavra'}</p>}
              {sugestoes.map(s => (
                <button type="button" key={s.codigo} className={s.codigo == form.codigo_tributacao ? 'atual' : ''} onClick={() => escolheCodigo(s)}>
                  <span className="codigo">{mascaraCodigo(s.codigo)}</span>
                  <span className="lista-codigos-texto">
                    {s.nbs && <strong>{encurta(s.nbs.descricao, 70)}</strong>}
                    {encurta(s.descricao, 140)}
                  </span>
                </button>
              ))}
            </div>
            {form.codigo_tributacao && (
              <button type="button" className="pequeno secundario" onClick={() => setTrocandoCodigo(false)}>Manter {mascaraCodigo(form.codigo_tributacao)}</button>
            )}
          </div>
        )}

        <div className="grade-campos">
          <div className="campo-metade">
            <label>Código NBS <span className="texto-menor">(vem com o código)</span></label>
            {opcoesNbs.length > 0 ? (
              <select value={form.codigo_nbs} onChange={e => campo('codigo_nbs', e.target.value)}>
                <option value="">Sem NBS</option>
                {form.codigo_nbs && !opcoesNbs.some(n => n.codigo == form.codigo_nbs) && <option value={form.codigo_nbs}>{mascaraNBS(form.codigo_nbs)}</option>}
                {opcoesNbs.map(n => <option key={n.codigo} value={n.codigo}>{mascaraNBS(n.codigo)} · {encurta(n.descricao, 60)}</option>)}
              </select>
            ) : (
              <input value={mascaraNBS(form.codigo_nbs)} onChange={e => campo('codigo_nbs', soNumeros(e.target.value).substring(0, 9))} placeholder="0.0000.00.00" inputMode="numeric" />
            )}
          </div>
          <div className="campo-metade">
            <label>Valor padrão (R$) <span className="texto-menor">(opcional)</span></label>
            <input type="number" step="0.01" min="0" value={form.valor} onChange={e => campo('valor', e.target.value)} placeholder="Muda sempre? Deixe vazio" />
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
