import { Router } from 'express';
import { signup, login, getProfile } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
const router = Router();
router.post('/signup', signup);
router.post('/login', login);
router.get('/profile', authenticate, getProfile);
export default router;
//# sourceMappingURL=auth.routes.js.map