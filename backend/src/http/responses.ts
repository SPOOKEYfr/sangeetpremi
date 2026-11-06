/** Consistent API envelope: { ok: true, data } or { ok: false, error: { code, message, details? } }. */

export interface ApiSuccess<T> { ok: true; data: T }
export interface ApiFailure { ok: false; error: { code: string; message: string; details?: unknown } }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const err = {
  invalidInput: (msg: string, details?: unknown) => new ApiError('INVALID_INPUT', msg, 400, details),
  notFound: (msg = 'Resource not found') => new ApiError('NOT_FOUND', msg, 404),
  rateLimited: (msg = 'Too many requests. Please slow down and try again shortly.') => new ApiError('RATE_LIMITED', msg, 429),
  payloadTooLarge: (msg = 'Request body too large') => new ApiError('PAYLOAD_TOO_LARGE', msg, 413),
  unsupportedMedia: (msg = 'Content-Type must be application/json') => new ApiError('UNSUPPORTED_MEDIA_TYPE', msg, 415),
  methodNotAllowed: (msg = 'Method not allowed') => new ApiError('METHOD_NOT_ALLOWED', msg, 405),
  notImplemented: (msg: string) => new ApiError('NOT_IMPLEMENTED', msg, 501),
  internal: (msg = 'Internal server error') => new ApiError('INTERNAL', msg, 500),
};

export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, details?: unknown): ApiFailure {
  return { ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) } };
}
