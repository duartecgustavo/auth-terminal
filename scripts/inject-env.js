const fs = require("fs");
const path = require("path");

// Carrega .env se existir (para dev local) - dotenv é opcional
try {
  require("dotenv").config();
} catch {
  // dotenv não instalado; process.env já tem vars do shell/Vercel
}

const raw =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  "http://localhost:3000";
const url = raw.replace(/\/+$/, ""); // remove trailing slash

// Debug: mostra no log do build qual valor foi usado (verifique no Vercel)
console.log("[inject-env] VITE_API_URL:", process.env.VITE_API_URL || "(não definido)");
console.log("[inject-env] API_BASE_URL injetado:", url);

const configPath = path.join(__dirname, "../src/config.ts");
let content = fs.readFileSync(configPath, "utf8");
content = content.replace(/"__API_BASE_URL__"/g, JSON.stringify(url));

fs.writeFileSync(configPath, content);
