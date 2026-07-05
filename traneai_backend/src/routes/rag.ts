import { Router } from 'express';
import { indexBatch, removeFile, search, syncWorkspace } from '../controllers/ragController.js';

const router = Router();

router.post('/sync', syncWorkspace);
router.post('/index/batch', indexBatch);
router.post('/index/remove', removeFile);
router.post('/search', search);

export default router;
