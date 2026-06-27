import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { ApiError } from '../lib/http';

type Source = 'body' | 'query' | 'params';

/** Validate & coerce a request part with a Zod schema, replacing it with the parsed value. */
export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        ApiError.badRequest('اعتبارسنجی ورودی ناموفق بود', result.error.flatten())
      );
    }
    // Reassign parsed/coerced data.
    (req as Record<Source, unknown>)[source] = result.data;
    next();
  };
}
