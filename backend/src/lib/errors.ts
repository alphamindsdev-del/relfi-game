import type { StatusCode } from 'hono/utils/http-status'

export class AppError extends Error {
  constructor(
    public statusCode: StatusCode,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      details: error.details,
    }
  }
  return {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  }
}
