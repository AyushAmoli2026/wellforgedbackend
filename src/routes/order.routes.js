import { Router } from 'express';
import { createOrder, getOrders, getOrderDetails } from '../controllers/order.controller.js';
import { processPayment, getPaymentStatus } from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
const router = Router();
// Order routes
router.post('/', authenticate, createOrder);
router.get('/', authenticate, getOrders);
router.get('/:id', authenticate, getOrderDetails);
// Payment routes
router.post('/payment', authenticate, processPayment);
router.get('/payment/:order_id', authenticate, getPaymentStatus);
export default router;
//# sourceMappingURL=order.routes.js.map