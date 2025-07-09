import { Router, Request, Response } from 'express';

export const templatesRouter = Router();

// GET /api/v1/templates - List all templates
templatesRouter.get('/', (req: Request, res: Response) => {
  res.json({
    templates: [],
    total: 0,
  });
});

// GET /api/v1/templates/:id - Get a specific template
templatesRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    id,
    name: 'Sample Template',
    content: 'Template content here',
  });
});
