import { Router } from 'express';
import { qaOrchestrator } from '../services/qaService.js';
import { randomUUID } from 'crypto';

const router = Router();

router.post('/start-workflow', async (req, res) => {
    try {
        const { workspaceId, rootPath, ticketId } = req.body;
        
        if (!workspaceId || !rootPath) {
            return res.status(400).json({ error: 'workspaceId and rootPath are required' });
        }
        
        const sessionId = randomUUID();
        
        // Start asynchronously
        qaOrchestrator.startWorkflow(sessionId, workspaceId, rootPath, ticketId || '');
        
        res.json({ sessionId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/stop-workflow', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
        qaOrchestrator.stopWorkflow(sessionId);
    }
    res.json({ success: true });
});

router.get('/stream/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send initial connection successful event
    res.write(`data: ${JSON.stringify({ message: '[System] Connected to QA logs stream...\n' })}\n\n`);
    
    const onLog = (message: string) => {
        // Send data formatted as SSE
        res.write(`data: ${JSON.stringify({ message })}\n\n`);
    };
    
    qaOrchestrator.on(`log-${sessionId}`, onLog);
    
    req.on('close', () => {
        qaOrchestrator.off(`log-${sessionId}`, onLog);
    });
});

export default router;
