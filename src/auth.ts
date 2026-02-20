import type { User } from './types';
import { api } from './api';

class AuthManager {
  private currentUser: User | null = null;

  async initialize(): Promise<void> {
    // Tenta recuperar usuário se houver token
    if (api.isAuthenticated()) {
      try {
        // const response = await api.getCurrentUser();
        // if (response.success && response.data) {
        //   this.currentUser = response.data;
        // }
      } catch (error) {
        // Token inválido, faz logout
        this.logout();
      }
    }
  }

  setUser(user: User): void {
    this.currentUser = user;
  }

  getUser(): User | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null && api.isAuthenticated();
  }

  logout(): void {
    this.currentUser = null;
    api.logout();
  }

  getUserName(): string {
    return this.currentUser?.nickname || this.currentUser?.name || "guest";
  }
}

export const auth = new AuthManager();