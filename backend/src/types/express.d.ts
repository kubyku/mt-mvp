import type { Request } from "express";

declare global {
  namespace Express {
    interface UserSession {
      id: number;
      username: string;
      displayName: string;
      role: string;
    }

    interface Request {
      user?: UserSession;
    }
  }
}

export {};
