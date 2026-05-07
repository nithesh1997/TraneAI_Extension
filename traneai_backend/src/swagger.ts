export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TraneAI API',
      version: '1.0.0',
      description: 'Backend API for TraneAI VS Code Extension',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            role: { type: 'string', enum: ['user', 'ai'] },
            text: { type: 'string' },
            timestamp: { type: 'number' },
            model: { type: 'string' },
          },
        },
        ChatRequest: {
          type: 'object',
          required: ['message'],
          properties: {
            message: {
              type: 'string',
              example: 'string'
            }
          }
        },
        ChatResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Hello! How can I help you?'
            }
          },
        },
        ImageChatRequest: {
          type: 'object',
          required: ['message', 'image'],
          properties: {
            message: {
              type: 'string',
              example: 'Explain this image'
            },
            image: {
              type: 'string',
              format: 'binary',
              description: 'Image file upload'
            }
          }
        },

        ImageChatResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'This image shows...'
            }
          }
        },
        QuickActionRequest: {
          type: 'object',
          required: ['action', 'fileName', 'language', 'content'],
          properties: {
            action: { type: 'string', enum: ['explain', 'review', 'tests'] },
            fileName: { type: 'string' },
            language: { type: 'string' },
            content: { type: 'string' },
            lineCount: { type: 'number' },
          },
        },
        QuickActionResponse: {
          type: 'object',
          properties: {
            message: { $ref: '#/components/schemas/Message' },
            codeBlock: { type: 'string' },
            language: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};
