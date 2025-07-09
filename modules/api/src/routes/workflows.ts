import { Router, Request, Response } from 'express';

export const workflowsRouter = Router();

// GET /api/v1/workflows - List all workflows
workflowsRouter.get('/', (req: Request, res: Response) => {
  res.json({
    workflows: [],
    total: 0,
  });
});

// GET /api/v1/workflows/:id - Get a specific workflow
workflowsRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    id,
    name: 'Sample Workflow',
    status: 'active',
  });
});
