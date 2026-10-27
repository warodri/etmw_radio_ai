export interface RadioUser {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  isAdmin?: boolean;
}

export interface AuthResponse {
  token: string;
  user: RadioUser;
}

export interface RequestCodeResponse {
  success: boolean;
  message: string;
  expiresInMinutes: number;
  devCode?: string;
}

export interface MeResponse {
  user: RadioUser;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
}
