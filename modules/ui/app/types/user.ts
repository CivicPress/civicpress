export interface Role {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  color: string;
  icon: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
  avatar_url?: string;
  permissions: string[];
  created_at?: string;
  updated_at?: string;
}
