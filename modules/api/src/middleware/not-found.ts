import { Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
    },
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    availableEndpoints: {
      records: '/api/v1/records',
      templates: '/api/v1/templates',
      workflows: '/api/v1/workflows',
      hooks: '/api/v1/hooks',
      export: '/api/v1/export',
      import: '/api/v1/import',
      search: '/api/v1/search',
      health: '/health',
    },
  });
}
