import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { sendSuccess, logApiRequest } from '../utils/api-logger.js';

export const docsRouter = Router();

// Sample OpenAPI specification for CivicPress API
const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'CivicPress API',
    version: '0.1.2',
    description: 'REST API for CivicPress governance platform',
    contact: {
      name: 'CivicPress Team',
      url: 'https://github.com/CivicPress/civicpress',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for authentication (clerk, council, public)',
      },
    },
    schemas: {
      Record: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'article-001' },
          title: { type: 'string', example: 'Article 001 - Animal Control' },
          type: {
            type: 'string',
            enum: ['bylaw', 'policy', 'proposal', 'resolution'],
            example: 'bylaw',
          },
          status: {
            type: 'string',
            enum: ['draft', 'proposed', 'reviewed', 'approved', 'archived'],
            example: 'active',
          },
          content: {
            type: 'string',
            example: 'All dogs must be leashed in public parks at all times.',
          },
          metadata: {
            type: 'object',
            properties: {
              author: { type: 'string', example: 'City Council' },
              created: { type: 'string', format: 'date-time' },
              updated: { type: 'string', format: 'date-time' },
              version: { type: 'string', example: '1.0.0' },
            },
          },
          path: {
            type: 'string',
            example: 'records/bylaw/article-001---animal-control.md',
          },
        },
      },
      RecordList: {
        type: 'object',
        properties: {
          records: {
            type: 'array',
            items: { $ref: '#/components/schemas/Record' },
          },
          total: { type: 'integer', example: 41 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              code: { type: 'string' },
            },
          },
          timestamp: { type: 'string', format: 'date-time' },
          path: { type: 'string' },
          method: { type: 'string' },
        },
      },
    },
  },
  security: [
    {
      ApiKeyAuth: [],
    },
  ],
  paths: {
    '/api/v1/health': {
      get: {
        summary: 'Health Check',
        description: 'Check API server status',
        tags: ['System'],
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    timestamp: { type: 'string', format: 'date-time' },
                    version: { type: 'string', example: '1.0.0' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/records': {
      get: {
        summary: 'List Records',
        description: 'Get all records with optional filtering',
        tags: ['Records'],
        parameters: [
          {
            name: 'type',
            in: 'query',
            description: 'Filter by record type',
            schema: {
              type: 'string',
              enum: ['bylaw', 'policy', 'proposal', 'resolution'],
            },
          },
          {
            name: 'status',
            in: 'query',
            description: 'Filter by record status',
            schema: {
              type: 'string',
              enum: ['draft', 'proposed', 'reviewed', 'approved', 'archived'],
            },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Number of records to return',
            schema: { type: 'integer', default: 10 },
          },
          {
            name: 'page',
            in: 'query',
            description: 'Page number',
            schema: { type: 'integer', default: 1 },
          },
        ],
        responses: {
          '200': {
            description: 'List of records',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RecordList' },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create Record',
        description: 'Create a new civic record',
        tags: ['Records'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'type'],
                properties: {
                  title: { type: 'string', example: 'New Bylaw' },
                  type: {
                    type: 'string',
                    enum: ['bylaw', 'policy', 'proposal', 'resolution'],
                  },
                  content: {
                    type: 'string',
                    example: 'This is the content of the new record.',
                  },
                  status: {
                    type: 'string',
                    enum: [
                      'draft',
                      'proposed',
                      'reviewed',
                      'approved',
                      'archived',
                    ],
                    default: 'draft',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Record created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Record' },
              },
            },
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/v1/records/{id}': {
      get: {
        summary: 'Get Record',
        description: 'Get a specific record by ID',
        tags: ['Records'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Record ID',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Record details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Record' },
              },
            },
          },
          '404': {
            description: 'Record not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
      put: {
        summary: 'Update Record',
        description: 'Update an existing record',
        tags: ['Records'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Record ID',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: ['bylaw', 'policy', 'proposal', 'resolution'],
                  },
                  content: { type: 'string' },
                  status: {
                    type: 'string',
                    enum: [
                      'draft',
                      'proposed',
                      'reviewed',
                      'approved',
                      'archived',
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Record updated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Record' },
              },
            },
          },
          '404': {
            description: 'Record not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
      delete: {
        summary: 'Delete Record',
        description: 'Delete a record (council only)',
        tags: ['Records'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Record ID',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '204': {
            description: 'Record deleted successfully',
          },
          '403': {
            description: 'Forbidden - council role required',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
          '404': {
            description: 'Record not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/v1/templates': {
      get: {
        summary: 'List Templates',
        description: 'Get available record templates',
        tags: ['Templates'],
        responses: {
          '200': {
            description: 'List of templates',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    templates: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          type: { type: 'string' },
                          description: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/workflows': {
      get: {
        summary: 'List Workflows',
        description: 'Get available workflow configurations',
        tags: ['Workflows'],
        responses: {
          '200': {
            description: 'List of workflows',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workflows: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          description: { type: 'string' },
                          steps: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// Serve Swagger UI
docsRouter.use('/', swaggerUi.serve);
docsRouter.get(
  '/',
  swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'CivicPress API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      showRequestHeaders: true,
      tryItOutEnabled: true,
      url: '/api-docs.json',
    },
  })
);

// Serve the OpenAPI spec as JSON
docsRouter.get('/api-docs.json', (req, res) => {
  logApiRequest(req, { operation: 'get_api_docs' });

  sendSuccess(swaggerSpec, req, res, { operation: 'get_api_docs' });
});

export default docsRouter;
