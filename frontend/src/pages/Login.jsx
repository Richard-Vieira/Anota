import { useState } from 'react'
import { API } from '../config.js'

function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')

    if (email == '' || senha == '') {
      setErro('Preencha o email e a senha')
      return
    }

    setCarregando(true)
    // ajustado com IA para melhorar o codigo
    // se a api cair nao fica travado no "Entrando..."
    try {
      const resposta = await fetch(API + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      })
      const dados = await resposta.json()
      console.log('login', dados)
      if (!resposta.ok) {
        setErro(dados.erro)
      } else {
        // guarda o usuario no navegador (sem jwt por enquanto)
        localStorage.setItem('usuario', JSON.stringify(dados))
        // recarrega pra o App ver que logou
        window.location.href = '/nova-nota'
      }
    } catch (err) {
      setErro('Não foi possível conectar no servidor')
    }
    setCarregando(false)
  }

  return (
    <div className="login-box">
      <h1 style={{ color: '#0F6E56', marginBottom: 0 }}>ANota</h1>
      <p style={{ color: '#666', marginTop: 4 }}>Sua nota fiscal por áudio</p>

      <form onSubmit={entrar}>
        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />

        <label>Senha</label>
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)} />

        {erro && <p className="erro">{erro}</p>}

        <button type="submit" disabled={carregando} style={{ width: '100%' }}>
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export default Login
