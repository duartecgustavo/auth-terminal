import type { TerminalState, User } from "./types";
import { api } from "./api.js";

class Terminal {
  private outputElement: HTMLElement;
  private inputElement: HTMLInputElement;
  private promptElement: HTMLElement;
  private terminalTitleElement: HTMLElement | null = null;

  /** Rascunho do input ao navegar no histórico (para restaurar ao pressionar ↓ no fim) */
  private historyDraft = "";

  private audioContext: AudioContext | null = null;

  private inactivityTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly INACTIVITY_MS = 90_000; // 90 segundos

  /** Tipo de som: "soft" (membrana), "clicky" (typewriter), "blip" (bolha), "mechanical" (mecânico) */
  private keyboardSoundType: "soft" | "clicky" | "blip" | "mechanical" = "clicky";

  private soundsEnabled = true;
  private showTimestamp = false;
  private pendingLogoutConfirm = false;

  private readonly COMMANDS = ["help", "clear", "about", "sound", "register", "login", "logout", "infos", "update", "users", "coffee", "matrix", "neofetch", "timestamp", "mute", "sudo", "exit"];

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

  private isValidEmail(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (!trimmed.includes("@")) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
  }

  private addPasswordRequirements(): void {
    this.addOutput("Requisitos: mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número, 1 caractere especial (!@#$%^&* etc)", "muted");
  }

  private validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (password.length < 8) {
      errors.push("Mínimo 8 caracteres");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Pelo menos 1 letra maiúscula");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Pelo menos 1 letra minúscula");
    }
    if (!/\d/.test(password)) {
      errors.push("Pelo menos 1 número");
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push("Pelo menos 1 caractere especial (!@#$%^&* etc)");
    }
    return { isValid: errors.length === 0, errors };
  }

  constructor() {
    this.outputElement = document.getElementById("output")!;
    this.inputElement = document.getElementById(
      "command-input"
    ) as HTMLInputElement;
    this.promptElement = document.querySelector(".prompt")!;
    this.terminalTitleElement = document.querySelector(".terminal-title");

    this.init();
  }

  private init(): void {
    console.log("🟢 Terminal inicializando...");

    // Calcula largura do prompt
    this.updatePromptWidth();

    // Event listener para descanso de tela
    this.inputElement.addEventListener("input", () => {
      this.resetInactivityTimer();
    });

    // Event listener para Enter, setas, Tab, Ctrl+L, Ctrl+C e som
    this.inputElement.addEventListener("keydown", (e) => {
      this.resetInactivityTimer();

      // Ctrl+L: limpar terminal
      if (e.ctrlKey && e.key === "l") {
        e.preventDefault();
        this.clear();
        return;
      }

      // Ctrl+C: cancelar (como ESC)
      if (e.ctrlKey && e.key === "c") {
        e.preventDefault();
        if (this.state.isAwaitingInput) this.cancelInput();
        else this.addOutput("^C", "muted");
        return;
      }

      // Tab: autocompletar comando
      if (e.key === "Tab") {
        e.preventDefault();
        this.tabComplete();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        this.handleCommand();
        return;
      }

      if (e.key === "Escape" && this.state.isAwaitingInput) {
        e.preventDefault();
        this.cancelInput();
        return;
      }

      if (!this.state.isAwaitingInput && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const handled = this.navigateHistory(e.key === "ArrowUp");
        if (handled) e.preventDefault();
      }

      if (this.soundsEnabled) this.playKeySound(e);
    });

    // Mantém foco no input
    document.addEventListener("click", () => this.inputElement.focus());

    // Clique no prompt ou título: mostra card minimizado (about)
    this.promptElement.style.cursor = "pointer";
    this.promptElement.addEventListener("click", (e) => {
      e.stopPropagation();
      this.prepareAndShowMinimizedCard();
    });
    this.terminalTitleElement?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.prepareAndShowMinimizedCard();
    });

    // Descanso de tela: Matrix após 90s sem digitar
    this.startInactivityTimer();

    // Mensagem inicial
    this.addOutput('Digite "help" para começar', "info");

    console.log("✅ Terminal pronto!");
  }

  private handleCommand(): void {
    const input = this.inputElement.value.trim();

    // Confirmação de logout
    if (this.pendingLogoutConfirm) {
      this.pendingLogoutConfirm = false;
      this.addOutput(`${this.promptElement.textContent} ${input}`, "muted");
      if (["s", "sim", "y", "yes"].includes(input.toLowerCase())) {
        this.doLogout();
      } else {
        this.addOutput("Logout cancelado", "muted");
        this.addOutput("");
      }
      this.inputElement.value = "";
      return;
    }

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
      return;
    }

    console.log("📝 Comando:", input);

    if (!input) {
      console.log("⚠️ Comando vazio");
      return;
    }

    // Mostra comando no output (com timestamp opcional)
    const ts = this.showTimestamp ? `[${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}] ` : "";
    this.addOutput(`${ts}${this.promptElement.textContent} ${input}`, "muted");

    // Adiciona ao histórico
    this.pushToHistory(input);

    // Processa comando
    this.processCommand(input);

    // Limpa input
    this.inputElement.value = "";
  }

  private processCommand(cmd: string): void {
    console.log("⚙️ Processando:", cmd);

    if (cmd.toLowerCase().startsWith("sound")) {
      this.handleSoundCommand(cmd);
      return;
    }

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
        this.requestLogoutConfirm();
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

      case "coffee":
        this.showCoffee();
        break;

      case "matrix":
        this.showMatrix();
        break;

      case "neofetch":
        this.showNeofetch();
        break;

      case "sudo":
        this.showSudo();
        break;

      case "exit":
        this.showExit();
        break;

      case "timestamp":
        this.toggleTimestamp();
        break;

      case "mute":
        this.toggleMute();
        break;

      default:
        this.playErrorSound();
        this.addOutput(`✖ Comando não encontrado: ${cmd}`, "error");
        this.addOutput('Digite "help" para ver os comandos', "info");
    }
  }

  private playSuccessSound(): void {
    if (!this.soundsEnabled) return;
    try {
      if (!this.audioContext) this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioContext.state === "suspended") this.audioContext.resume();
      const now = this.audioContext.currentTime;
      const osc = this.audioContext.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.1);
      osc.frequency.setValueAtTime(784, now + 0.2);
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch {}
  }

  private playErrorSound(): void {
    if (!this.soundsEnabled) return;
    try {
      if (!this.audioContext) this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioContext.state === "suspended") this.audioContext.resume();
      const now = this.audioContext.currentTime;
      const osc = this.audioContext.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.setValueAtTime(150, now + 0.1);
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }

  private fireConfetti(): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#00ff00", "#00aaff", "#ff5555", "#ffaa00"];
    const confetti: { x: number; y: number; vx: number; vy: number; color: string; size: number }[] = [];
    for (let i = 0; i < 50; i++) {
      confetti.push({
        x: 0.5,
        y: 0.5,
        vx: (Math.random() - 0.5) * 0.02,
        vy: -0.02 - Math.random() * 0.02,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 6,
      });
    }
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      confetti.forEach((c) => {
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.0005;
        ctx.fillStyle = c.color;
        ctx.fillRect(c.x * canvas.width, c.y * canvas.height, c.size, c.size);
      });
      frame++;
      if (frame < 120) requestAnimationFrame(animate);
      else canvas.remove();
    };
    animate();
  }

  private showHelp(): void {
    this.addOutput("");
    this.addOutput("📋 Comandos disponíveis:", "info");
    this.addOutput("");

    // Comandos sempre disponíveis
    this.addOutput("  help     - Mostra esta mensagem", "muted");
    this.addOutput("  clear    - Limpa o terminal", "muted");
    this.addOutput("  about    - Sobre o projeto", "muted");
    this.addOutput("  sound    - Som de teclado (soft, clicky, blip, mechanical)", "muted");
    this.addOutput("  timestamp - Alternar exibição de hora nos comandos", "muted");
    this.addOutput("  mute     - Ligar/desligar sons", "muted");
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

  private startInactivityTimer(): void {
    this.clearInactivityTimer();
    this.inactivityTimeoutId = setTimeout(() => {
      this.inactivityTimeoutId = null;
      this.showMatrix();
    }, this.INACTIVITY_MS);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimeoutId) {
      clearTimeout(this.inactivityTimeoutId);
      this.inactivityTimeoutId = null;
    }
  }

  private resetInactivityTimer(): void {
    this.startInactivityTimer();
  }

  private showMatrix(): void {
    this.clearInactivityTimer();

    const terminalBody = document.getElementById("terminal");
    if (!terminalBody) return;

    const overlay = document.createElement("div");
    overlay.className = "matrix-overlay";
    overlay.innerHTML = '<canvas id="matrixCanvas"></canvas><div class="matrix-hint">ESC ou clique para sair</div>';

    terminalBody.style.position = "relative";
    terminalBody.appendChild(overlay);

    const w = terminalBody.clientWidth;
    const h = terminalBody.clientHeight;
    const canvas = overlay.querySelector("#matrixCanvas") as HTMLCanvasElement;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      overlay.remove();
      return;
    }

    const chars = "01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンｱｲｳｴｵ";
    const fontSize = 14;
    const columns = Math.floor(w / fontSize);
    const drops: number[] = Array(columns).fill(1);

    let animId: number;

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#00ff00";
      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        ctx.fillStyle = y > fontSize * 3 ? "rgba(0, 255, 0, 0.9)" : "rgba(0, 255, 150, 0.4)";
        ctx.fillText(char, x, y);

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      animId = requestAnimationFrame(draw);
    };

    draw();

    const cleanup = () => {
      cancelAnimationFrame(animId);
      overlay.remove();
      this.startInactivityTimer(); // Reinicia o descanso de tela
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
        document.removeEventListener("keydown", handleKey);
        overlay.removeEventListener("click", handleClick);
      }
    };

    const handleClick = () => {
      cleanup();
      document.removeEventListener("keydown", handleKey);
      overlay.removeEventListener("click", handleClick);
    };

    document.addEventListener("keydown", handleKey);
    overlay.addEventListener("click", handleClick);
  }

  private showCoffee(): void {
    const ascii = `
       )  )
      (  (
     ) ) )
    ( ( ( (
      \\   /
       \\_/
    .-------.
   /  ☕     \\
  |  COFFEE  |
   \\_________/
`;
    const phrases = [
      "Um café por dia mantém o código em dia! ☕",
      "Código sem café é como dia sem sol.",
      "Debugging é mais fácil com uma xícara cheia.",
      "O café é o combustível dos programadores.",
      "Primeiro o café, depois o código.",
      "Keep calm and drink coffee.",
    ];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    this.addOutput("");
    ascii.split("\n").forEach((line) => this.addOutput(line, "muted"));
    this.addOutput("");
    this.addOutput(phrase, "success");
    this.addOutput("");
  }

  private showAbout(): void {
    this.prepareAndShowMinimizedCard();
  }

  private prepareAndShowMinimizedCard(): void {
    const terminalContainer = document.getElementById("terminalContainer");
    const minimizedCard = document.getElementById("minimizedCard");
    if (!terminalContainer || !minimizedCard) return;

    const user = this.state.currentUser;
    const staticRows = [
      { label: "📧", text: "duartecgustavo@outlook.com", copy: "duartecgustavo@outlook.com" },
      { label: "📞", text: "+55 (11) 993758665", copy: "+55 (11) 993758665" },
      { label: "💼", text: "LinkedIn", copy: "https://www.linkedin.com/in/gustavo-castanho-duarte-578127160/" },
      { label: "🐙", text: "GitHub", copy: "https://github.com/duartecgustavo" },
    ];

    const createRow = (label: string, text: string, copy: string) => {
      const row = document.createElement("div");
      row.className = "minimized-row";
      row.innerHTML = `<span>${label} ${text}</span><button type="button" class="copy-btn" title="Copiar">📋</button>`;
      const btn = row.querySelector(".copy-btn")!;
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(copy);
          btn.textContent = "✓";
          btn.classList.add("copied");
          setTimeout(() => { btn.textContent = "📋"; btn.classList.remove("copied"); }, 1500);
        } catch {
          btn.textContent = "✗";
          setTimeout(() => (btn.textContent = "📋"), 1000);
        }
      });
      return row;
    };

    minimizedCard.innerHTML = "";
    const h3 = document.createElement("h3");
    h3.textContent = user ? (user.nickname || user.name || user.email) : "Gustavo Castanho";
    minimizedCard.appendChild(h3);

    if (user) {
      const userSection = document.createElement("div");
      userSection.className = "minimized-section";
      userSection.appendChild(createRow("📧", user.email, user.email));
      if (user.linkedin) {
        userSection.appendChild(createRow("💼", "LinkedIn", user.linkedin));
      }
      minimizedCard.appendChild(userSection);

      const divider = document.createElement("div");
      divider.className = "minimized-divider";
      divider.textContent = "Contato";
      minimizedCard.appendChild(divider);
    }

    staticRows.forEach((r) => minimizedCard.appendChild(createRow(r.label, r.text, r.copy)));

    const restoreBtn = document.createElement("button");
    restoreBtn.id = "restoreBtn";
    restoreBtn.textContent = "Reabrir Terminal";
    restoreBtn.addEventListener("click", () => {
      minimizedCard.classList.add("hidden");
      setTimeout(() => terminalContainer.classList.remove("minimized"), 100);
    });
    minimizedCard.appendChild(restoreBtn);

    terminalContainer.classList.add("minimized");
    setTimeout(() => minimizedCard.classList.remove("hidden"), 300);
  }

  private addSkeleton(type: "info" | "users"): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "skeleton-wrapper";
    if (type === "info") {
      wrap.innerHTML = `
        <div class="skeleton-line" style="width:60%"></div>
        <div class="skeleton-line" style="width:45%"></div>
        <div class="skeleton-line" style="width:70%"></div>
        <div class="skeleton-line" style="width:50%"></div>
      `;
    } else {
      wrap.innerHTML = `
        <div class="skeleton-line" style="width:80%"></div>
        <div class="skeleton-line" style="width:65%"></div>
        <div class="skeleton-line" style="width:75%"></div>
        <div class="skeleton-line" style="width:60%"></div>
      `;
    }
    this.outputElement.appendChild(wrap);
    this.scrollToBottom();
    return wrap;
  }

  private addProgressBar(message: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "progress-bar-wrapper";
    wrapper.innerHTML = `
      <span class="progress-bar-message">${message}</span>
      <div class="progress-bar-track">
        <div class="progress-bar-fill"></div>
      </div>
    `;
    this.outputElement.appendChild(wrapper);
    this.scrollToBottom();
    return wrapper;
  }

  private removeProgressBar(wrapper: HTMLElement): void {
    wrapper.remove();
  }

  private addOutput(text: string, type: string = ""): void {
    const line = document.createElement("div");
    line.className = `output-line ${type}`;
    line.textContent = text;
    this.outputElement.appendChild(line);
    this.scrollToBottom();
  }

  private addOutputWithCopy(text: string, copyValue: string, type: string = "muted"): void {
    const line = document.createElement("div");
    line.className = `output-line output-line-copyable ${type}`;
    const span = document.createElement("span");
    span.textContent = text;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "output-copy-btn";
    btn.textContent = "📋";
    btn.title = "Copiar";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyValue);
        btn.textContent = "✓";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "📋";
          btn.classList.remove("copied");
        }, 1500);
      } catch {
        btn.textContent = "✗";
        setTimeout(() => (btn.textContent = "📋"), 1000);
      }
    });
    line.appendChild(span);
    line.appendChild(btn);
    this.outputElement.appendChild(line);
    this.scrollToBottom();
  }

  private tabComplete(): void {
    const val = this.inputElement.value.toLowerCase().trim();
    const matches = this.COMMANDS.filter((c) => c.startsWith(val));
    if (matches.length === 1) {
      this.inputElement.value = matches[0];
    } else if (matches.length > 1) {
      const common = this.getCommonPrefix(matches);
      if (common.length > val.length) this.inputElement.value = common;
      else this.addOutput(matches.join("  "), "muted");
    }
  }

  private getCommonPrefix(arr: string[]): string {
    if (arr.length === 0) return "";
    let prefix = arr[0];
    for (const s of arr) {
      while (!s.startsWith(prefix) && prefix.length) prefix = prefix.slice(0, -1);
    }
    return prefix;
  }

  private toggleTimestamp(): void {
    this.showTimestamp = !this.showTimestamp;
    this.addOutput(this.showTimestamp ? "✔ Timestamp ativado" : "✔ Timestamp desativado", "success");
    this.addOutput("");
  }

  private toggleMute(): void {
    this.soundsEnabled = !this.soundsEnabled;
    this.addOutput(this.soundsEnabled ? "✔ Sons ativados" : "✔ Sons desativados", "success");
    this.addOutput("");
  }

  private showNeofetch(): void {
    const user = this.state.currentUser;
    const name = user?.nickname || user?.name || "guest";
    this.addOutput("");
    this.addOutput("       ╭─────────────────────────────╮", "info");
    this.addOutput("       │  Auth Terminal v1.0         │", "success");
    this.addOutput("       ╰─────────────────────────────╯", "info");
    this.addOutput("");
    this.addOutput(`  user     ${name}`, "muted");
    this.addOutput(`  host     auth-terminal.local`, "muted");
    this.addOutput(`  shell    /bin/auth-terminal`, "muted");
    this.addOutput(`  theme    ${document.body.classList.contains("theme-red") ? "red" : document.body.classList.contains("theme-yellow") ? "yellow" : document.body.classList.contains("theme-green") ? "green" : "default"}`, "muted");
    this.addOutput("");
  }

  private showSudo(): void {
    this.addOutput("Nice try 😄", "success");
    this.addOutput("");
  }

  private showExit(): void {
    this.addOutput("O terminal não sai de você. Você sai do terminal.", "muted");
    this.addOutput("");
  }

  private updatePromptWidth(): void {
    console.log("📏 Largura do prompt:", this.promptElement.offsetWidth + "px");
  }

  private navigateHistory(up: boolean): boolean {
    const history = this.state.commandHistory;
    if (history.length === 0) return false;

    if (up) {
      if (this.state.historyIndex === -1) {
        this.historyDraft = this.inputElement.value;
        this.state.historyIndex = history.length - 1;
      } else if (this.state.historyIndex > 0) {
        this.state.historyIndex--;
      }
      this.inputElement.value = history[this.state.historyIndex];
    } else {
      if (this.state.historyIndex === -1) return false;
      if (this.state.historyIndex < history.length - 1) {
        this.state.historyIndex++;
        this.inputElement.value = history[this.state.historyIndex];
      } else {
        this.state.historyIndex = -1;
        this.inputElement.value = this.historyDraft;
      }
    }
    return true;
  }

  private playKeySound(e: KeyboardEvent): void {
    const skipKeys = ["Enter", "Escape", "ArrowUp", "ArrowDown", "Shift", "Control", "Alt", "Meta", "CapsLock"];
    if (skipKeys.includes(e.key)) return;

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }

      const ctx = this.audioContext;
      const now = ctx.currentTime;

      switch (this.keyboardSoundType) {
        case "soft":
          this.playSoftSound(ctx, now);
          break;
        case "clicky":
          this.playClickySound(ctx, now);
          break;
        case "blip":
          this.playBlipSound(ctx, now);
          break;
        case "mechanical":
          this.playMechanicalSound(ctx, now);
          break;
      }
    } catch {
      // Ignora falhas de áudio (autoplay bloqueado, etc)
    }
  }

  private handleSoundCommand(cmd: string): void {
    const parts = cmd.trim().split(/\s+/);
    const arg = parts[1]?.toLowerCase();
    const types: readonly string[] = ["soft", "clicky", "blip", "mechanical"];

    if (arg && types.includes(arg)) {
      this.keyboardSoundType = arg as typeof this.keyboardSoundType;
      this.addOutput(`✔ Som de teclado: ${arg}`, "success");
    } else {
      this.addOutput(`Som atual: ${this.keyboardSoundType}`, "info");
      this.addOutput("Uso: sound <tipo>  |  Tipos: soft, clicky, blip, mechanical", "muted");
    }
    this.addOutput("");
  }

  /** Teclado de membrana: som suave e abafado */
  private playSoftSound(ctx: AudioContext, now: number): void {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.015);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  /** Typewriter: clique seco e definido */
  private playClickySound(ctx: AudioContext, now: number): void {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(2400, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.015);
  }

  /** Bolha: som curto e arredondado */
  private playBlipSound(ctx: AudioContext, now: number): void {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.025);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  /** Mecânico: thock original */
  private playMechanicalSound(ctx: AudioContext, now: number): void {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.02);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  private cancelInput(): void {
    this.state.isAwaitingInput = false;
    this.state.jsonMode = null;
    this.state.inputMode = null;
    this.state.updateField = null;
    this.inputElement.value = "";
    this.addOutput("");
    this.addOutput("✖ Operação cancelada", "muted");
    this.addOutput("");
  }

  private pushToHistory(cmd: string): void {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    const history = this.state.commandHistory;
    // Evita duplicata consecutiva
    if (history.length > 0 && history[history.length - 1] === trimmed) return;
    history.push(trimmed);
    const maxHistory = 50;
    if (history.length > maxHistory) {
      this.state.commandHistory = history.slice(-maxHistory);
    }
    this.state.historyIndex = -1;
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
      const email = input.trim();
      if (!this.isValidEmail(email)) {
        this.addOutput(`Email: ${input}`, "muted");
        this.addOutput("✖ Email inválido. Use o formato: usuario@dominio.com", "error");
        this.addOutput("Email:", "info");
        return;
      }
      this.addOutput(`Email: ${email}`, "muted");
      this.state.loginData.email = email;
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
    const progressBar = this.addProgressBar("Autenticando...");

    const { email, password } = this.state.loginData;

    try {
      const [response] = await Promise.all([
        api.login({ email, password }),
        new Promise((r) => setTimeout(r, 2000)),
      ]);

      this.removeProgressBar(progressBar);

      if (response.success && response.user) {
        this.playSuccessSound();
        this.fireConfetti();
        this.addOutput("✔ Login realizado com sucesso!", "success");
        const displayName =
          response.user.nickname || response.user.name || response.user.email.split("@")[0];
        this.addOutput(`Bem-vindo, ${displayName}!`, "success");
        this.addOutput("");

        // Salva o usuário no state
        this.state.currentUser = response.user;

        // Atualiza o prompt e título com o nome do usuário
        this.promptElement.textContent = `${displayName}@auth-terminal:~$`;
        if (this.terminalTitleElement) {
          this.terminalTitleElement.textContent = `${displayName}@auth-terminal:~$`;
        }
        this.updatePromptWidth();
      } else {
        this.playErrorSound();
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error) {
      this.removeProgressBar(progressBar);
      this.playErrorSound();
      this.addOutput("✖ Erro ao fazer login", "error");
      this.addOutput("Verifique sua conexão e tente novamente", "muted");
      this.addOutput("");
      console.error("Erro no login:", error);
    }
  }

  private requestLogoutConfirm(): void {
    if (!this.state.currentUser) {
      this.addOutput("✖ Você não está logado", "error");
      this.addOutput("");
      return;
    }
    this.pendingLogoutConfirm = true;
    this.addOutput("Tem certeza que deseja sair? (s/n)", "info");
  }

  private doLogout(): void {
    const user = this.state.currentUser;
    if (!user) return;
    const userName = user.nickname || user.name || user.email;

    // Limpa o estado
    this.state.currentUser = null;
    this.state.loginData = { email: "", password: "" };

    // Chama o logout da API (limpa localStorage e token)
    api.logout();

    this.playSuccessSound();
    this.addOutput("");
    this.addOutput("✔ Logout realizado com sucesso!", "success");
    this.addOutput(`Até logo, ${userName}!`, "muted");
    this.addOutput("");

    // Restaura o prompt e título padrão
    this.promptElement.textContent = "guest@auth-terminal:~$";
    if (this.terminalTitleElement) {
      this.terminalTitleElement.textContent = "auth-terminal@v1.0 ~ guest";
    }
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
    const skeletonInfo = this.addSkeleton("info");

    const userId = this.state.currentUser.id;
    if (!userId) {
      skeletonInfo.remove();
      this.addOutput("✖ ID do usuário não disponível", "error");
      this.addOutput("");
      return;
    }

    try {
      const response = await api.getUserById(userId);

      skeletonInfo.remove();

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
        this.addOutputWithCopy(`📧 Email: ${user.user.email}`, user.user.email, "muted");
        user.user.linkedin
          ? this.addOutputWithCopy(`🔗 LinkedIn: ${user.user.linkedin}`, user.user.linkedin, "muted")
          : this.addOutput(`🔗 LinkedIn: -`, "muted");
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
      skeletonInfo.remove();
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
    const skeletonUsers = this.addSkeleton("users");

    try {
      const response = await api.listUsers();

      skeletonUsers.remove();

      if (response.success && response.data) {
        const users = response.data.data ?? [];

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
      skeletonUsers.remove();
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
      const email = input.trim();
      if (!this.isValidEmail(email)) {
        this.addOutput(`Email: ${input}`, "muted");
        this.addOutput("✖ Email inválido. Use o formato: usuario@dominio.com", "error");
        this.addOutput("Email:", "info");
        return;
      }
      this.addOutput(`Email: ${email}`, "muted");
      this.state.registerData.email = email;
      this.state.inputMode = "password";
      this.addPasswordRequirements();
      this.addOutput("Password:", "info");
    } else if (this.state.inputMode === "password") {
      const maskedPassword = "*".repeat(input.length);
      this.addOutput(`Password: ${maskedPassword}`, "muted");
      const validation = this.validatePassword(input);
      if (!validation.isValid) {
        this.addOutput("✖ Senha não atende aos requisitos:", "error");
        validation.errors.forEach((err) => this.addOutput(`  • ${err}`, "error"));
        this.addPasswordRequirements();
        this.addOutput("Password:", "info");
        return;
      }
      this.state.registerData.password = input;
      this.state.isAwaitingInput = false;
      this.state.inputMode = null;
      this.state.jsonMode = null;
      this.performRegister();
    }
  }

  private async performRegister(): Promise<void> {
    this.addOutput("");
    const progressBar = this.addProgressBar("Enviando dados e código por email...");

    const { name, nickname, email, password } = this.state.registerData;

    try {
      const [response] = await Promise.all([
        api.register({ name, nickname, email, password }),
        new Promise((r) => setTimeout(r, 2000)),
      ]);

      this.removeProgressBar(progressBar);

      if (response.success && response.data) {
        this.playSuccessSound();
        this.addOutput("✔ " + response.data.message, "success");
        this.addOutput("");
        this.addOutput("Digite o código de 6 dígitos que você recebeu no email:", "info");
        this.state.pendingConfirmEmail = response.data.email;
        this.state.isAwaitingInput = true;
        this.state.jsonMode = "confirm";
        this.state.inputMode = "code";
      } else {
        this.playErrorSound();
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error: any) {
      this.removeProgressBar(progressBar);
      this.playErrorSound();
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
        this.playSuccessSound();
        this.addOutput("✔ Cadastro efetivado com sucesso!", "success");
        this.addOutput('Use "login" para entrar na sua conta', "info");
        this.addOutput("");
      } else {
        this.playErrorSound();
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error: any) {
      this.playErrorSound();
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
          this.addPasswordRequirements();
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
      const email = input.trim();
      if (!this.isValidEmail(email)) {
        this.addOutput(`Novo email: ${input}`, "muted");
        this.addOutput("✖ Email inválido. Use o formato: usuario@dominio.com", "error");
        this.addOutput("Digite o novo email:", "info");
        return;
      }
      this.addOutput(`Novo email: ${email}`, "muted");
      this.state.updateData.email = email;
    } else if (this.state.updateField === "password") {
      const maskedPassword = "*".repeat(input.length);
      this.addOutput(`Nova senha: ${maskedPassword}`, "muted");
      const validation = this.validatePassword(input);
      if (!validation.isValid) {
        this.addOutput("✖ Senha não atende aos requisitos:", "error");
        validation.errors.forEach((err) => this.addOutput(`  • ${err}`, "error"));
        this.addPasswordRequirements();
        this.addOutput("Digite a nova senha:", "info");
        return;
      }
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
        this.playSuccessSound();
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
          if (this.terminalTitleElement) {
            this.terminalTitleElement.textContent = `${displayName}@auth-terminal:~$`;
          }
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
        this.playErrorSound();
        this.addOutput("✖ " + response.message, "error");
        this.addOutput("");
      }
    } catch (error: any) {
      this.playErrorSound();
      const errorMessage = error?.message || "Erro ao atualizar perfil";
      this.addOutput("✖ " + errorMessage, "error");
      this.addOutput("Verifique os dados e tente novamente", "muted");
      this.addOutput("");
      console.error("Erro no update:", error);
    }
  }
}

export const terminal = new Terminal();
