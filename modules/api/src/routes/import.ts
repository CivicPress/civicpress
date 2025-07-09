import { Router, Request, Response } from 'express';

export const importRouter = Router();

// POST /api/v1/import - Import data
importRouter.post('/', (req: Request, res: Response) => {
  res.json({
    message: 'Import functionality',
    formats: ['json', 'csv', 'markdown'],
  });
});
