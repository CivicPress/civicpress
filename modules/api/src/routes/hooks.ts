import { Router, Request, Response } from 'express';

export const hooksRouter = Router();

// GET /api/v1/hooks - List all hooks
hooksRouter.get('/', (req: Request, res: Response) => {
  res.json({
    hooks: [],
    total: 0,
  });
});

// GET /api/v1/hooks/:id - Get a specific hook
hooksRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    id,
    name: 'Sample Hook',
    event: 'record:created',
  });
});
