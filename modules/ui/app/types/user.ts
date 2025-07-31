export interface Role {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  record_types?: Record<string, any>;
  status_transitions: string[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  permissions: string[];
  created_at?: string;
  updated_at?: string;
}
