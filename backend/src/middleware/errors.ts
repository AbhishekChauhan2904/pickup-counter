import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  (req as any).id = randomUUID();
  res.setHeader("X-Request-Id", (req as any).id);
  next();
};
// One error format everywhere: { error: { code, message, details }, requestId }
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const id = (req as any).id;
  if (err?.name === "ZodError")
    return res
      .status(400)
      .json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: err.issues,
        },
        requestId: id,
      });
  if (err instanceof AppError)
    return res
      .status(err.status)
      .json({
        error: { code: err.code, message: err.message, details: err.details },
        requestId: id,
      });
  console.error(
    JSON.stringify({
      level: "error",
      requestId: id,
      msg: err?.message,
      stack: err?.stack,
    }),
  );
  res
    .status(500)
    .json({
      error: { code: "INTERNAL", message: "Something went wrong" },
      requestId: id,
    });
}
