import type { Response } from 'express';
import pool from '../config/db.js';

export const processPayment = async (req: any, res: Response) => {
    const { order_id, payment_method, transaction_id, payment_signature } = req.body;

    try {
        // 1. SECURE CHECK: Verify payment signature/status with gateway
        // In a real Razorpay/Stripe integration, you MUST verify the HMAC signature here
        // const isValid = verifyPaymentSignature(order_id, transaction_id, payment_signature);
        // if (!isValid) throw new Error('Invalid payment signature');

        // For now, we simulate a secure check
        if (!transaction_id) {
            return res.status(400).json({ message: 'Transaction ID is required for verification' });
        }

        const paymentResult = await pool.query(
            `INSERT INTO payments (order_id, payment_method, payment_status, transaction_id, paid_at) 
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) 
       ON CONFLICT (order_id) 
       DO UPDATE SET payment_status = $3, transaction_id = $4, paid_at = CURRENT_TIMESTAMP
       RETURNING *`,
            [order_id, payment_method, 'success', transaction_id]
        );

        // Update order status to 'paid' and also set detailed payment_status
        await pool.query("UPDATE orders SET status = 'paid', payment_status = 'completed' WHERE id = $1", [order_id]);

        res.json(paymentResult.rows[0]);
    } catch (error: any) {
        console.error(`Payment processing error for order ${order_id}:`, error);
        res.status(500).json({ message: error.message });
    }
};

export const getPaymentStatus = async (req: any, res: Response) => {
    const { order_id } = req.params;

    try {
        const result = await pool.query('SELECT * FROM payments WHERE order_id = $1', [order_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Payment record not found' });
        }
        res.json(result.rows[0]);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
