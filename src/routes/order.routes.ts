import { Router } from 'express';
import { createOrder, getOrders, getOrderDetails, updateOrderStatus } from '../controllers/order.controller.js';
import { processPayment, getPaymentStatus } from '../controllers/payment.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Order routes
router.post('/', authenticate, createOrder);
router.get('/', authenticate, getOrders);
router.get('/:id', authenticate, getOrderDetails);
router.patch('/:id/status', authenticate, authorize(['admin']), updateOrderStatus);

// Payment routes
router.post('/payment', authenticate, processPayment);
router.get('/payment/:order_id', authenticate, getPaymentStatus);

export default router;
