import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import cookieParser from 'cookie-parser';
import chatRoutes from './routes/chat.js';
import authRoutes from './routes/auth.js';
import { authenticateToken } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TraneAI API',
      version: '1.0.0',
      description: 'Backend API for TraneAI VS Code Extension', 
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
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
            message: { type: 'string' },
            model: { type: 'string' },
            context: {
              type: 'object',
              properties: {
                fileName: { type: 'string' },
                language: { type: 'string' },
                content: { type: 'string' },
                lineCount: { type: 'number' },
              },
            },
          },
        },
        ChatResponse: {
          type: 'object',
          properties: {
            message: { $ref: '#/components/schemas/Message' },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
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

const swaggerDocs = swaggerJsdoc(swaggerOptions);

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.use('/api/auth', authRoutes);
// Protect chat routes with authentication
app.use('/api/chat', authenticateToken, chatRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`TraneAI Backend running on port ${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
});
