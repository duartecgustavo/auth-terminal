/**
 * URL da API - detectada em runtime pelo hostname.
 * Local: localhost → http://localhost:3000
 * Produção: qualquer outro host → https://express-auth-api-nine.vercel.app
 */
const isLocal =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export const API_BASE_URL = isLocal
  ? "http://localhost:3000"
  : "https://express-auth-api-nine.vercel.app";
