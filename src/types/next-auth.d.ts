import { DefaultSession } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id?: string;
    role?: string;
    username?: string;
  }

  interface Session {
    user: {
      id?: string;
      role?: string;
      username?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: string;
    username?: string;
  }
}
