import type { TerminalState, User } from "./types";
import { api } from "./api.js";

class Terminal {
  private outputElement: HTMLElement;
  private inputElement: HTMLInputElement;
  private promptElement: HTMLElement;
  private cursorElement: HTMLElement;

  private state: TerminalState = {
    isAwaitingJson: false,
    jsonMode: null,
    currentUser: null,
    commandHistory: [],
    historyIndex: -1,
    isAwaitingInput: false,
    inputMode: null,
    loginData: { email: "", password: "" },
    registerData: { name: "", nickname: "", email: "", password: "" },
    pendingConfirmEmail: null,
    updateData: {},
    updateField: null,
  };

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split("@");

    if (localPart.length <= 3) {
      // Se o email for muito curto, mostra só a primeira letra
      return `${localPart[0]}***@${domain}`;
    }

    // Mostra os 3 primeiros caracteres e mascara o resto
    const visiblePart = localPart.substring(0, 3);
    return `${visiblePart}***@${domain}`;
  }

  constructor() {
    this.outputElement = document.getElementById("output")!;
    this.inputElement = document.getElementById(
      "command-input"
    ) as HTMLInputElement;
    this.promptElement = document.querySelector(".prompt")!;
    this.cursorElement = document.getElementById("cursor")!;

    this.init();
  }

  private init(): void {
    console.log("🟢 Terminal inicializando...");

    // Calcula largura do prompt
    this.updatePromptWidth();

    // Event listener para atualizar cursor
    this.inputElement.addEventListener("input", () => {
      this.updateCursorPosition();
    });

    // Event listener para Enter
    this.inputElement.addEventListener("keydown", (e) => {
      console.log("🔑 Tecla pressionada:", e.key);

      if (e.key === "Enter") {
        console.log("✅ ENTER detectado!");
        e.preventDefault();
        this.handleCommand();
      }
    });

    // Mantém foco no input
    document.addEventListener("click", () => this.inputElement.focus());

    // Mensagem inicial
    this.addOutput('Digite "help" para começar', "info");

    // Posição inicial do cursor
    this.updateCursorPosition();

    console.log("✅ Terminal pronto!");
  }

  private handleCommand(): void {
    const input = this.inputElement.value.trim();

    // Se estiver aguardando input
    if (this.state.isAwaitingInput) {
      if (this.state.jsonMode === "register") {
        this.handleRegisterInput(input);
      } else if (this.state.jsonMode === "confirm") {
        this.handleConfirmCodeInput(input);
      } else if (this.state.jsonMode === "update") {
        this.handleUpdateInput(input);
      } else {
        this.handleLoginInput(input);
      }
      this.inputElement.value = "";
      this.updateCursorPosition();
      return;
    }

    console.log("📝 Comando:", input);

    if (!input) {
      console.log("⚠️ Comando vazio");
      return;
    }

    // Mostra comando no output
    this.addOutput(`${this.promptElement.textContent} ${input}`, "muted");

    // Processa comando
    this.processCommand(input);

    // Limpa input
    this.inputElement.value = "";
    this.updateCursorPosition();
  }

  private processCommand(cmd: string): void {
    console.log("⚙️ Processando:", cmd);

    switch (cmd.toLowerCase()) {
      case "help":
        this.showHelp();
        break;

      case "clear":
        this.clear();
        break;

      case "about":
        this.showAbout();
        break;

      case "register":
        this.startRegister();
        break;

      case "login":
        this.startLogin();
        break;

      case "logout":
        this.performLogout();
        break;

      case "infos":
        this.showUserInfo();
        break;

      case "update": // ADICIONE
        this.startUpdate();
        break;

      case "users":
        this.listUsers();
        break;

      default:
        this.addOutput(`✖ Comando não encontrado: ${cmd}`, "error");
        this.addOutput('Digite "help" para ver os comandos', "info");
    }
  }

  private showHelp(): void {
    this.addOutput("");
    this.addOutput("📋 Comandos disponíveis:", "info");
    this.addOutput("");

    // Comandos sempre disponíveis
    this.addOutput("  help     - Mostra esta mensagem", "muted");
    this.addOutput("  clear    - Limpa o terminal", "muted");
    this.addOutput("  about    - Sobre o projeto", "muted");
    this.addOutput("");

    // Comandos apenas quando NÃO está logado
    if (!this.state.currentUser) {
      this.addOutput("🔓 Autenticação:", "info");
      this.addOutput("  register - Criar nova conta", "muted");
      this.addOutput("  login    - Fazer login", "muted");
      this.addOutput("");
    }

    // Comandos apenas quando ESTÁ logado
    if (this.state.currentUser) {
      this.addOutput("👤 Conta:", "info");
      this.addOutput("  infos    - Ver informações detalhadas", "muted");
      this.addOutput("  update   - Atualizar perfil", "muted"); // ADICIONE
      this.addOutput("  users    - Listar todos os usuários", "muted");
      this.addOutput("  logout   - Fazer logout", "muted");
      this.addOutput("");
    }
  }

  private clear(): void {
    this.outputElement.innerHTML = "";
    console.log("🧹 Terminal limpo");
  }

  private showAbout(): void {
    this.addOutput("");
    this.addOutput("╔════════════════════════════════════════╗", "info");
    this.addOutput("║       Auth Terminal v1.0               ║", "success");
    this.addOutput("╚════════════════════════════════════════╝", "info");
    this.addOutput("");
    this.addOutput("👨‍💻 Desenvolvido por: Gustavo Castanho", "muted");
    this.addOutput("");
    this.addOutput("🛠️  Stack:", "info");
    this.addOutput("  • Vanilla TypeScript", "muted");
    this.addOutput("  • CSS puro", "muted");
    this.addOutput("");
  }

  private addOutput(text: string, type: string = ""): void {
    const line = document.createElement("div");
    line.className = `output-line ${type}`;
    line.textContent = text;
    this.outputElement.appendChild(line);
    this.scrollToBottom();
  }

  private updatePromptWidth(): void {
    const promptWidth = this.promptElement.offsetWidth;
    this.cursorElement.style.setProperty("--prompt-width", `${promptWidth}px`);
    console.log("📏 Largura do prompt:", promptWidth + "px");
  }

  private updateCursorPosition(): void {
    const position = this.inputElement.value.length;
    this.cursorElement.style.setProperty(
      "--cursor-position",
      position.toString()
    );
  }

  private scrollToBottom(): void {
    const terminal = document.getElementById("terminal");
    if (terminal) {
      terminal.scrollTop = terminal.scrollHeight;
    }
  }

  async initialize(): Promise<void> {
    console.log("🚀 Terminal.initialize() chamado");
  }

  private startLogin(): void {
    this.addOutput("");
    this.addOutput("🔐 Login", "info");
    this.addOutput("");

    // Reseta os dados
    this.state.loginData = { email: "", password: "" };

    // Ativa modo de input
    this.state.isAwaitingInput = true;
    this.state.inputMode = "email";

    // Pede o email
    this.addOutput("Email:", "info");
  }

  private handleLoginInput(input: string): void {
    if (this.state.inputMode === "email") {
      // Mostra o email digitado (mascarado)
      this.addOutput(`Email: ${input}`, "muted");

      // Salva o email
      this.state.loginData.email = input;

      // Agora pede a senha
      this.state.inputMode = "password";
      this.addOutput("Password:", "info");
    } else if (this.state.inputMode === "password") {
      // Mostra a senha mascarada
      const maskedPassword = "*".repeat(input.length);
      this.addOutput(`Password: ${maskedPassword}`, "muted");

      // Salva a senha
      this.state.loginData.password = input;

      // Desativa modo de input
      this.state.isAwaitingInput = false;
      this.state.inputMode = null;

      // Executa o login
      this.performLogin();
    }
  }

  private async performLogin(): Promise<void> {
    this.addOutput("");
    this.addOutput("⏳ Autenticando...", "info");

    const { email, password } = this.state.loginData;

    try {
      // Chama a API real
      const response = await api.login({ email, password });

      if (response.success && response.user) {
        this.addOutput("✔ Login realizado com sucesso!", "success");
        const displayName =
          response.user.nickname || response.user.name || response.user.email.split("@")[0];
        this.addOutput(`Bem-vindo, ${displayName}!`, "success");
        this.addOutput("");

        // Salva o usuário no state
        this.state.currentUser = response.user;

        // Atualiza o prompt com o nome do usuário
        this.promptElement.textContent = `${displayName}@auth-terminal:~$`;
        this.updatePromptWidth();
      } else {
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error) {
      this.addOutput("✖ Erro ao fazer login", "error");
      this.addOutput("Verifique sua conexão e tente novamente", "muted");
      this.addOutput("");
      console.error("Erro no login:", error);
    }
  }

  private performLogout(): void {
    // Verifica se está logado
    if (!this.state.currentUser) {
      this.addOutput("✖ Você não está logado", "error");
      this.addOutput("");
      return;
    }

    const userName =
      this.state.currentUser.nickname ||
      this.state.currentUser.name ||
      this.state.currentUser.email;

    // Limpa o estado
    this.state.currentUser = null;
    this.state.loginData = { email: "", password: "" };

    // Chama o logout da API (limpa localStorage e token)
    api.logout();

    // Mensagens de logout
    this.addOutput("");
    this.addOutput("✔ Logout realizado com sucesso!", "success");
    this.addOutput(`Até logo, ${userName}!`, "muted");
    this.addOutput("");

    // Restaura o prompt padrão
    this.promptElement.textContent = "guest@auth-terminal:~$";
    this.updatePromptWidth();
  }

  private async showUserInfo(): Promise<void> {
    // Verifica se está logado
    if (!this.state.currentUser) {
      this.addOutput(
        "✖ Você precisa estar logado para usar este comando",
        "error"
      );
      this.addOutput('Use "login" para fazer login', "info");
      this.addOutput("");
      return;
    }

    this.addOutput("");
    this.addOutput("⏳ Buscando informações...", "info");

    try {
      const userId = this.state.currentUser.id;
      const response = await api.getUserById(userId);

      if (response.success && response.data) {
        console.log("response.data", response.data);
        const user = response.data;

        this.addOutput("");
        this.addOutput("╔════════════════════════════════════════╗", "info");
        this.addOutput("║       Informações do Usuário           ║", "success");
        this.addOutput("╚════════════════════════════════════════╝", "info");
        this.addOutput("");
        this.addOutput(`👤 Nome: ${user.user.name || "-"}`, "muted");
        this.addOutput(`👤 Nickname: ${user.user.nickname || "-"}`, "muted");
        this.addOutput(`📧 Email: ${user.user.email}`, "muted");
        this.addOutput(`🔗 LinkedIn: ${user.user.linkedin || "-"}`, "muted");
        this.addOutput(
          `📅 Criado em: ${new Date(
            user.user.createdAt || ""
          ).toLocaleDateString("pt-BR")}`,
          "muted"
        );
        this.addOutput("");
      } else {
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error) {
      this.addOutput("✖ Erro ao buscar informações", "error");
      this.addOutput("Verifique sua conexão e tente novamente", "muted");
      this.addOutput("");
      console.error("Erro ao buscar infos:", error);
    }
  }

  private async listUsers(): Promise<void> {
    // Verifica se está logado
    if (!this.state.currentUser) {
      this.addOutput(
        "✖ Você precisa estar logado para usar este comando",
        "error"
      );
      this.addOutput('Use "login" para fazer login', "info");
      this.addOutput("");
      return;
    }

    this.addOutput("");
    this.addOutput("⏳ Buscando usuários...", "info");

    try {
      const response = await api.listUsers();

      if (response.success && response.data) {
        const users = response.data.data || response.data;

        this.addOutput("");
        this.addOutput("╔════════════════════════════════════════╗", "info");
        this.addOutput("║          Lista de Usuários             ║", "success");
        this.addOutput("╚════════════════════════════════════════╝", "info");
        this.addOutput("");

        if (users.length === 0) {
          this.addOutput("Nenhum usuário encontrado", "muted");
        } else {
          users.forEach((u: User) => {
            const maskedEmail = this.maskEmail(u.email);
            const name = u.name || u.nickname || "Sem nome";

            this.addOutput(`👤 ${name.padEnd(20)} ${maskedEmail}`, "muted");
          });

          this.addOutput("");
          this.addOutput(`Total: ${users.length} usuário(s)`, "info");
        }

        this.addOutput("");
      } else {
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error) {
      this.addOutput("✖ Erro ao buscar usuários", "error");
      this.addOutput("Verifique sua conexão e tente novamente", "muted");
      this.addOutput("");
      console.error("Erro ao buscar usuários:", error);
    }
  }

  private startRegister(): void {
    // Verifica se já está logado
    if (this.state.currentUser) {
      this.addOutput("✖ Você já está logado", "error");
      this.addOutput('Use "logout" para sair primeiro', "info");
      this.addOutput("");
      return;
    }

    this.addOutput("");
    this.addOutput("📝 Criar nova conta", "info");
    this.addOutput("");

    // Reseta os dados
    this.state.registerData = { name: "", nickname: "", email: "", password: "" };
    this.state.pendingConfirmEmail = null;

    // Ativa modo de input
    this.state.isAwaitingInput = true;
    this.state.jsonMode = "register";
    this.state.inputMode = "name";

    // Pede o nome
    this.addOutput("Nome:", "info");
  }

  private handleRegisterInput(input: string): void {
    if (this.state.inputMode === "name") {
      this.addOutput(`Nome: ${input}`, "muted");
      this.state.registerData.name = input;
      this.state.inputMode = "nickname";
      this.addOutput("Nickname (apelido):", "info");
    } else if (this.state.inputMode === "nickname") {
      this.addOutput(`Nickname: ${input}`, "muted");
      this.state.registerData.nickname = input;
      this.state.inputMode = "email";
      this.addOutput("Email:", "info");
    } else if (this.state.inputMode === "email") {
      this.addOutput(`Email: ${input}`, "muted");
      this.state.registerData.email = input;
      this.state.inputMode = "password";
      this.addOutput("Password:", "info");
    } else if (this.state.inputMode === "password") {
      const maskedPassword = "*".repeat(input.length);
      this.addOutput(`Password: ${maskedPassword}`, "muted");
      this.state.registerData.password = input;
      this.state.isAwaitingInput = false;
      this.state.inputMode = null;
      this.state.jsonMode = null;
      this.performRegister();
    }
  }

  private async performRegister(): Promise<void> {
    this.addOutput("");
    this.addOutput("⏳ Enviando dados e código por email...", "info");

    const { name, nickname, email, password } = this.state.registerData;

    try {
      const response = await api.register({ name, nickname, email, password });

      if (response.success && response.data) {
        this.addOutput("✔ " + response.data.message, "success");
        this.addOutput("");
        this.addOutput("Digite o código de 6 dígitos que você recebeu no email:", "info");
        this.state.pendingConfirmEmail = response.data.email;
        this.state.isAwaitingInput = true;
        this.state.jsonMode = "confirm";
        this.state.inputMode = "code";
      } else {
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error: any) {
      const errorMessage = error?.message || "Erro ao criar conta";
      this.addOutput("✖ " + errorMessage, "error");
      this.addOutput("Verifique os dados e tente novamente", "muted");
      this.addOutput("");
      console.error("Erro no registro:", error);
    }
  }

  private handleConfirmCodeInput(input: string): void {
    const code = input.trim();
    if (!code || code.length !== 6) {
      this.addOutput("✖ Código deve ter 6 dígitos", "error");
      return;
    }

    this.state.isAwaitingInput = false;
    this.state.jsonMode = null;
    this.state.inputMode = null;

    this.performConfirmRegistration(code);
  }

  private async performConfirmRegistration(code: string): Promise<void> {
    const email = this.state.pendingConfirmEmail;
    if (!email) {
      this.addOutput("✖ Erro: email de confirmação não encontrado", "error");
      this.addOutput("");
      return;
    }

    this.addOutput("");
    this.addOutput("⏳ Confirmando cadastro...", "info");

    try {
      const response = await api.confirmRegistration({ email, code });

      if (response.success) {
        this.addOutput("✔ Cadastro efetivado com sucesso!", "success");
        this.addOutput('Use "login" para entrar na sua conta', "info");
        this.addOutput("");
      } else {
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error: any) {
      this.addOutput("✖ " + (error?.message || "Código inválido ou expirado"), "error");
      this.addOutput("Faça o registro novamente se necessário", "muted");
      this.addOutput("");
    }

    this.state.pendingConfirmEmail = null;
  }

  private startUpdate(): void {
    // Verifica se está logado
    if (!this.state.currentUser) {
      this.addOutput(
        "✖ Você precisa estar logado para usar este comando",
        "error"
      );
      this.addOutput('Use "login" para fazer login', "info");
      this.addOutput("");
      return;
    }

    this.addOutput("");
    this.addOutput("✏️  Atualizar perfil", "info");
    this.addOutput("");
    this.addOutput("O que deseja atualizar?", "muted");
    this.addOutput("  1 - Nome", "muted");
    this.addOutput("  2 - Nickname", "muted");
    this.addOutput("  3 - Email", "muted");
    this.addOutput("  4 - Senha", "muted");
    this.addOutput("  5 - LinkedIn (URL ou vazio para remover)", "muted");
    this.addOutput("");
    this.addOutput("Digite o número da opção:", "info");

    // Reseta os dados
    this.state.updateData = {};

    // Ativa modo de input
    this.state.isAwaitingInput = true;
    this.state.jsonMode = "update";
    this.state.inputMode = null;
    this.state.updateField = null;
  }

  private handleUpdateInput(input: string): void {
    // Primeiro input: escolha do campo
    if (!this.state.updateField) {
      switch (input) {
        case "1":
          this.state.updateField = "name";
          this.addOutput("Digite o novo nome:", "info");
          break;
        case "2":
          this.state.updateField = "nickname";
          this.addOutput("Digite o novo nickname:", "info");
          break;
        case "3":
          this.state.updateField = "email";
          this.addOutput("Digite o novo email:", "info");
          break;
        case "4":
          this.state.updateField = "password";
          this.addOutput("Digite a nova senha:", "info");
          break;
        case "5":
          this.state.updateField = "linkedin";
          this.addOutput("Digite a URL do LinkedIn (ou vazio para remover):", "info");
          break;
        default:
          this.addOutput("✖ Opção inválida", "error");
          this.state.isAwaitingInput = false;
          this.state.jsonMode = null;
          this.addOutput("");
          return;
      }
      return;
    }

    // Segundo input: novo valor
    if (this.state.updateField === "name") {
      this.addOutput(`Novo nome: ${input}`, "muted");
      this.state.updateData.name = input;
    } else if (this.state.updateField === "nickname") {
      this.addOutput(`Novo nickname: ${input}`, "muted");
      this.state.updateData.nickname = input;
    } else if (this.state.updateField === "email") {
      this.addOutput(`Novo email: ${input}`, "muted");
      this.state.updateData.email = input;
    } else if (this.state.updateField === "password") {
      const maskedPassword = "*".repeat(input.length);
      this.addOutput(`Nova senha: ${maskedPassword}`, "muted");
      this.state.updateData.password = input;
    } else if (this.state.updateField === "linkedin") {
      this.addOutput(`LinkedIn: ${input || "(remover)"}`, "muted");
      this.state.updateData.linkedin = input.trim() || undefined;
    }

    // Desativa modo de input
    this.state.isAwaitingInput = false;
    this.state.jsonMode = null;

    // Executa a atualização
    this.performUpdate();
  }

  private async performUpdate(): Promise<void> {
    this.addOutput("");
    this.addOutput("⏳ Atualizando perfil...", "info");

    const userId = this.state.currentUser!.id!;
    const updateData = this.state.updateData;

    try {
      const response = await api.updateUser(userId, updateData);

      if (response.success && response.data) {
        this.addOutput("✔ Perfil atualizado com sucesso!", "success");
        this.addOutput("");

        // Atualiza o estado local com os novos dados
        if (updateData.name !== undefined) {
          this.state.currentUser!.name = updateData.name;
          this.addOutput(`Nome atualizado para: ${updateData.name}`, "info");
        }
        if (updateData.nickname !== undefined) {
          this.state.currentUser!.nickname = updateData.nickname;
          this.addOutput(`Nickname atualizado para: ${updateData.nickname}`, "info");
          const displayName =
            this.state.currentUser!.nickname ||
            this.state.currentUser!.name ||
            this.state.currentUser!.email;
          this.promptElement.textContent = `${displayName}@auth-terminal:~$`;
          this.updatePromptWidth();
        }
        if (updateData.email !== undefined) {
          this.state.currentUser!.email = updateData.email;
          this.addOutput(`Email atualizado para: ${updateData.email}`, "info");
        }
        if (updateData.password !== undefined) {
          this.addOutput(`Senha atualizada com sucesso`, "info");
        }
        if (updateData.linkedin !== undefined) {
          this.state.currentUser!.linkedin = updateData.linkedin ?? null;
          this.addOutput(
            updateData.linkedin
              ? `LinkedIn atualizado para: ${updateData.linkedin}`
              : "LinkedIn removido",
            "info"
          );
        }

        this.addOutput("");

        // Reseta os dados de update
        this.state.updateData = {};
        this.state.updateField = null;
      } else {
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error: any) {
      const errorMessage = error?.message || "Erro ao atualizar perfil";
      this.addOutput("✖ " + errorMessage, "error");
      this.addOutput("Verifique os dados e tente novamente", "muted");
      this.addOutput("");
      console.error("Erro no update:", error);
    }
  }
}

export const terminal = new Terminal();
