import { terminal } from "./terminal.js";

// Inicializa a aplicação quando o DOM estiver pronto
async function init() {
  try {
    await terminal.initialize();
    console.log("✔ Terminal inicializado com sucesso");
  } catch (error) {
    console.error("✖ Erro ao inicializar terminal:", error);
  }
}

// Aguarda o carregamento completo do DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Previne comportamentos padrão indesejados
document.addEventListener("contextmenu", (e) => {
  // Permite menu de contexto apenas em modo dev
  if (!window.location.hostname.includes("localhost")) {
    e.preventDefault();
  }
});
