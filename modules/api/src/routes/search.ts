import { Router, Request, Response } from 'express';

export const searchRouter = Router();

// GET /api/v1/search - Search records
searchRouter.get('/', (req: Request, res: Response) => {
  res.json({
    results: [],
    total: 0,
    query: req.query.q || '',
  });
});
