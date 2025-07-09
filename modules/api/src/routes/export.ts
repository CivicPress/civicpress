import { Router, Request, Response } from 'express';

export const exportRouter = Router();

// GET /api/v1/export - Export data
exportRouter.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Export functionality',
    formats: ['json', 'csv', 'markdown'],
  });
});
