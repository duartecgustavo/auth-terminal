// Types alinhados com a API (express-auth-api)

export interface User {
  id?: string;
  code?: string;
  name?: string;
  nickname?: string;
  email: string;
  linkedin?: string | null;
  isConfirmed?: boolean;
  createdAt?: string;
  password?: string;
}

export interface RegisterDTO {
  name: string;
  nickname: string;
  email: string;
  password: string;
  linkedin?: string;
}

export interface ConfirmRegistrationDTO {
  email: string;
  code: string;
}

export interface UpdateUserDTO {
  name?: string;
  nickname?: string;
  email?: string;
  password?: string;
  linkedin?: string | null;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: User;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

export type CommandType =
  | "help"
  | "register"
  | "login"
  | "clear"
  | "about"
  | "list-users"
  | "whoami"
  | "logout"
  | "exit";

export interface CommandHandler {
  name: CommandType;
  description: string;
  requiresAuth?: boolean;
  execute: (args?: string) => Promise<void> | void;
}

export type InputMode =
  | "email"
  | "password"
  | "name"
  | "nickname"
  | "linkedin"
  | "code"
  | null;

export interface TerminalState {
  isAwaitingJson: boolean;
  jsonMode: "register" | "login" | "update" | "confirm" | null;
  currentUser: User | null;
  commandHistory: string[];
  historyIndex: number;
  isAwaitingInput: boolean;
  inputMode: InputMode;
  loginData: {
    email: string;
    password: string;
  };
  registerData: {
    name: string;
    nickname: string;
    email: string;
    password: string;
    linkedin?: string;
  };
  /** Email usado no registro, para pedir o código de confirmação */
  pendingConfirmEmail: string | null;
  updateData: {
    name?: string;
    nickname?: string;
    email?: string;
    password?: string;
    linkedin?: string | null;
  };
  updateField: "name" | "nickname" | "email" | "password" | "linkedin" | null;
}
