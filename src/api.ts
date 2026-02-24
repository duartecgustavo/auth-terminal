import type {
  ApiResponse,
  AuthResponse,
  ConfirmRegistrationDTO,
  LoginDTO,
  User,
  RegisterDTO,
  UpdateUserDTO,
} from "./types";

// Configuração da API
const API_BASE_URL = "http://localhost:3000";

class ApiService {
  private token: string | null = null;

  constructor() {
    // Recupera token do localStorage se existir
    this.token = localStorage.getItem("auth_token");
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Adiciona token se autenticado
      if (this.token) {
        headers["Authorization"] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || data.message || "Erro na requisição",
          data: undefined,
        };
      }

      return {
        success: true,
        message: data.message || "Sucesso",
        data: data,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Erro de conexão com a API",
        data: undefined,
      };
    }
  }

  // Registro de usuário (envia código por email; conta só é criada após confirmar)
  async register(userData: RegisterDTO): Promise<ApiResponse<{ message: string; email: string }>> {
    const response = await this.request<{ message: string; email: string }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(userData),
      }
    );

    return {
      success: response.success,
      message: response.message,
      data: response.data,
    };
  }

  // Confirmar cadastro com o código recebido por email
  async confirmRegistration(
    data: ConfirmRegistrationDTO
  ): Promise<AuthResponse> {
    const response = await this.request<any>("/auth/confirm-registration", {
      method: "POST",
      body: JSON.stringify(data),
    });

    return {
      success: response.success,
      message: response.message,
      user: response.data?.user,
      token: response.data?.accessToken,
    };
  }

  // Login
  async login(credentials: LoginDTO): Promise<AuthResponse> {
    const response = await this.request<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });

    if (response.success && response.data?.accessToken) {
      this.token = response.data.accessToken;
      localStorage.setItem("auth_token", response.data.accessToken);

      // Também salva o refreshToken se precisar
      if (response.data.refreshToken) {
        localStorage.setItem("refresh_token", response.data.refreshToken);
      }
    }

    return {
      success: response.success,
      message: response.message,
      user: response.data?.user,
      token: response.data?.accessToken,
    };
  }

  // Atualizar usuário
  async updateUser(
    userId: string,
    data: UpdateUserDTO
  ): Promise<ApiResponse<User>> {
    return this.request<User>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Obtém usuário atual
  // Busca usuário por ID
  async getUserById(
    userId: string
  ): Promise<ApiResponse<{ message: string; user: User }>> {
    return this.request<{ message: string; user: User }>(`/users/${userId}`, {
      method: "GET",
    });
  }

  // Lista todos os usuários (API retorna { data: User[], pagination })
  async listUsers(): Promise<
    ApiResponse<{ data: User[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }>
  > {
    return this.request<any>("/users/list", {
      method: "GET",
    });
  }

  // Logout
  logout(): void {
    this.token = null;
    localStorage.removeItem("auth_token");
    localStorage.removeItem("refresh_token");
  }

  // Verifica se está autenticado
  isAuthenticated(): boolean {
    return this.token !== null;
  }

  // Obtém token atual
  getToken(): string | null {
    return this.token;
  }
}

export const api = new ApiService();
