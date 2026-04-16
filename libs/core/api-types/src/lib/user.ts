export interface User {
  email: string;
  password?: string;
  username: string;
  token?: string;
  bio: string;
  image: string;
}

export interface UserResponse {
  user: User;
}
