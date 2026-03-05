## 👾 Auth Terminal

Interface em estilo terminal para interagir com a API de autenticação. Experiência imersiva de linha de comando no navegador.

### LINK => https://auth-terminal.vercel.app/

### 📋 Sobre o Projeto

O Auth Terminal é o frontend do sistema de autenticação, apresentando uma interface que simula um terminal real. Permite registro, login, gerenciamento de perfil e listagem de usuários através de comandos, com recursos como histórico, sons de teclado e easter eggs.

> 🤖 Nota: Este readme foi escrito com auxílio de IA, porém está 100% revisado.

---

### ⌨️ Comandos Disponíveis

| Comando    | Descrição                          |
| ---------- | ---------------------------------- |
| `help`     | Lista todos os comandos             |
| `clear`    | Limpa o terminal                   |
| `about`    | Mostra informações de contato      |
| `register` | Criar nova conta                   |
| `login`    | Fazer login                        |
| `logout`   | Fazer logout (com confirmação)      |
| `infos`    | Ver informações do usuário         |
| `update`   | Atualizar perfil                   |
| `users`    | Listar usuários (apenas logado)    |
| `sound`    | Tipo de som (soft, clicky, blip, mechanical) |
| `timestamp`| Alternar hora nos comandos         |
| `mute`     | Ligar/desligar sons                |
| `coffee`   | Easter egg ☕                       |
| `matrix`   | Easter egg + descanso de tela      |
| `neofetch` | Easter egg - info do "sistema"      |
| `sudo`     | Easter egg 😄                      |
| `exit`     | Easter egg                         |

#### Atalhos

- **Ctrl+L** - Limpar terminal
- **Ctrl+C** - Cancelar input
- **Tab** - Autocompletar comando
- **ESC** - Cancelar fluxo (login, register, etc.)
- **↑ / ↓** - Navegar no histórico

---

### 📦 Tecnologias Utilizadas

#### Core

- **TypeScript** - Tipagem estática
- **Vanilla JS** - Sem frameworks (DOM puro)
- **CSS** - Estilos customizados, variáveis CSS

---

### ✨ Características Principais

⌨️ **Interface tipo terminal** - Experiência de linha de comando no navegador

🔐 **Autenticação completa** - Registro, login, logout e confirmação por email

👤 **Gerenciamento de perfil** - Atualização de nome, nickname, email, senha e LinkedIn

📋 **Histórico de comandos** - Navegação com ↑ e ↓

🎨 **Temas de cores** - Vermelho, amarelo e verde (persistidos em localStorage)

🔊 **Sons de teclado** - Múltiplos estilos (soft, clicky, blip, mechanical)

📊 **Progress bar animada** - Feedback visual em login e registro

🎉 **Confetti no login** - Celebração ao autenticar com sucesso

⏱️ **Descanso de tela** - Efeito Matrix após 90s de inatividade

♿ **Acessibilidade** - Respeita prefers-reduced-motion

---

⭐ Se este projeto foi útil, considere dar uma estrela!

Feito com ❤️, ☕ e TypeScript
