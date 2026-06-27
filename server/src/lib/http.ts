import { NextFunction, Request, Response } from 'express';

/** Standard API error with an HTTP status code. */
export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(msg = 'درخواست نامعتبر', details?: unknown) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = 'احراز هویت نشده') {
    return new ApiError(401, msg);
  }
  static forbidden(msg = 'دسترسی غیرمجاز') {
    return new ApiError(403, msg);
  }
  static notFound(msg = 'یافت نشد') {
    return new ApiError(404, msg);
  }
  static conflict(msg = 'تعارض داده') {
    return new ApiError(409, msg);
  }
}

/** Wrap an async route handler so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
