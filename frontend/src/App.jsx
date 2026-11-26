import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Cadastro from './pages/Cadastro.jsx'
import NovaNota from './pages/NovaNota.jsx'
import Notas from './pages/Notas.jsx'
import Clientes from './pages/Clientes.jsx'
import Servicos from './pages/Servicos.jsx'
import { pegaUsuario, pegaToken, tokenVencido, sair } from './api.js'

// setinha pra baixo do menu do usuario
function Setinha() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// ajustado com IA para melhorar o codigo
// menu do nome do usuario: abre ao clicar e fecha quando clica em qualquer lugar fora dele
function MenuUsuario({ nome }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef(null)
  const local = useLocation()

  useEffect(() => {
    function cliqueFora(e) {
      if (caixa.current && !caixa.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', cliqueFora)
    return () => document.removeEventListener('mousedown', cliqueFora)
  }, [])

  // trocou de tela, fecha o menu
  useEffect(() => {
    setAberto(false)
  }, [local.pathname])

  return (
    <div className="usuario-menu" ref={caixa}>
      <button type="button" className={'usuario-botao' + (aberto ? ' aberto' : '')} onClick={() => setAberto(!aberto)}>
        <span className="nome-usuario">{nome}</span>
        <Setinha />
      </button>
      {aberto && (
        <div className="usuario-lista">
          <Link to="/configuracoes">Configurações</Link>
          <button type="button" onClick={() => sair()}>Sair</button>
        </div>
      )}
    </div>
  )
}

function App() {
  // pega o usuario e o token que foram salvos no login
  const [usuario, setUsuario] = useState(pegaUsuario())
  const token = pegaToken()
  const local = useLocation()

  // quando muda o nome na tela Configuracoes ela avisa pra atualizar o menu
  useEffect(() => {
    function atualiza() {
      setUsuario(pegaUsuario())
    }
    window.addEventListener('usuario-mudou', atualiza)
    return () => window.removeEventListener('usuario-mudou', atualiza)
  }, [])

  // se o token ja venceu limpa tudo e manda pro login
  let logado = usuario
  if (usuario && (!token || tokenVencido(token))) {
    localStorage.removeItem('usuario')
    localStorage.removeItem('token')
    logado = null
  }

  // se nao ta logado so deixa ver o login e o cadastro
  if (!logado) {
    return (
      <Routes>
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  // a tela do chat ocupa a altura toda (a barra de escrever fica colada embaixo)
  const telaChat = local.pathname == '/nova-nota'

  return (
    <div>
      <header className="menu">
        <span className="marca">ANota</span>
        <nav>
          <NavLink to="/nova-nota">Nova nota</NavLink>
          <NavLink to="/notas">Notas</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          <NavLink to="/servicos">Serviços</NavLink>
        </nav>
        <MenuUsuario nome={logado.nome} />
      </header>

      <main className={'conteudo' + (telaChat ? ' conteudo-chat' : '')}>
        <Routes>
          <Route path="/nova-nota" element={<NovaNota />} />
          <Route path="/notas" element={<Notas />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/servicos" element={<Servicos />} />
          <Route path="*" element={<Navigate to="/nova-nota" />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
