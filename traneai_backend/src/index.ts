import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import chatRoutes from './routes/chat.js';
import workspaceRoutes from './routes/workspace.js';
import authRoutes from './routes/auth.js';
import ragRoutes from './routes/rag.js';
import qaRoutes from './routes/qa.js';
import { swaggerOptions } from './swagger.js';
import { initializeLiveShareWebSocket } from './services/liveScreenShareService.js';

const app = express();
const PORT = process.env.PORT || 5000;
const swaggerDocs = swaggerJsdoc(swaggerOptions);

app.use(helmet());
app.use((req, res, next) => {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
});
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.use('/api/chat', chatRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/qa', qaRoutes);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in .env');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB');
    const server = app.listen(PORT, () => {
      console.log(`TraneAI Backend running on port ${PORT}`);
      console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
    });
    initializeLiveShareWebSocket(server);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
