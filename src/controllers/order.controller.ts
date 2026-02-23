import type { Response } from 'express';
import pool from '../config/db.js';
import MailerService from '../services/mailer.service.js';

export const createOrder = async (req: any, res: Response) => {
    const { address_id, coupon_id, idempotency_key } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 0. Fetch user details from profiles
        const userResult = await client.query('SELECT phone FROM profiles WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0) {
            throw new Error('Profile not found');
        }

        // 1. Get cart items directly using profile_id
        // Use FOR UPDATE to lock product variant rows
        const itemsResult = await client.query(
            `SELECT ci.*, s.price, s.stock 
             FROM cart_items ci 
             JOIN skus s ON ci.sku_id = s.id 
             WHERE ci.profile_id = $1 
             FOR UPDATE OF s`,
            [req.user.id]
        );

        if (itemsResult.rows.length === 0) {
            throw new Error('Cart is empty');
        }

        // 1.1 CHECK IDEMPOTENCY
        if (idempotency_key) {
            const existingOrder = await client.query(
                'SELECT * FROM orders WHERE profile_id = $1 AND order_number = $2', // Simple check or add idempotency column
                [req.user.id, idempotency_key]
            );
            if (existingOrder.rows.length > 0) {
                await client.query('COMMIT');
                return res.json(existingOrder.rows[0]);
            }
        }

        // 2. Calculate subtotal and check stock
        let subtotal = 0;
        for (const item of itemsResult.rows) {
            if (item.stock < item.quantity) {
                throw new Error(`Insufficient stock for SKU ${item.sku_id}`);
            }
            subtotal += item.price * item.quantity;
        }

        // 2.5 Calculate shipping (subtotal is in rupees, 500.00 is threshold)
        const shipping_amount = subtotal >= 500 ? 0 : 49;

        // 2.6 Apply Coupon
        let discount_amount = 0;
        if (coupon_id) {
            const couponResult = await client.query(
                'SELECT * FROM coupons WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP FOR UPDATE',
                [coupon_id]
            );

            if (couponResult.rows.length > 0) {
                const coupon = couponResult.rows[0];
                if (!coupon.min_order_value || subtotal >= coupon.min_order_value) {
                    if (coupon.discount_type === 'percentage') {
                        discount_amount = Math.floor((subtotal * coupon.discount_value) / 100);
                    } else {
                        discount_amount = coupon.discount_value;
                    }
                    await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon_id]);
                }
            }
        }

        // 2.7 Calculate total
        const total_amount = subtotal - discount_amount + shipping_amount;

        // 3. Get address snapshot
        const addressResult = await client.query('SELECT * FROM addresses WHERE id = $1 AND profile_id = $2', [address_id, req.user.id]);
        if (addressResult.rows.length === 0) {
            throw new Error('Address not found');
        }
        const addressSnapshot = addressResult.rows[0];

        // 4. Create order
        const order_number = `WF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const orderResult = await client.query(
            `INSERT INTO orders (profile_id, order_number, total_amount, discount_amount, coupon_id, shipping_address_id, address_snapshot, subtotal, shipping_amount) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, order_number, total_amount, discount_amount, coupon_id, address_id, JSON.stringify(addressSnapshot), subtotal, shipping_amount]
        );
        const order = orderResult.rows[0];

        // 5. Create order items and update stock
        for (const item of itemsResult.rows) {
            const item_total = item.price * item.quantity;

            await client.query(
                'INSERT INTO order_items (order_id, sku_id, quantity, unit_price, item_total) VALUES ($1, $2, $3, $4, $5)',
                [order.id, item.sku_id, item.quantity, item.price, item_total]
            );

            await client.query(
                'UPDATE skus SET stock = stock - $1 WHERE id = $2',
                [item.quantity, item.sku_id]
            );
        }

        // 6. Clear cart
        await client.query('DELETE FROM cart_items WHERE profile_id = $1', [req.user.id]);

        await client.query('COMMIT');

        res.status(201).json(order);
    } catch (error: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: error.message });
    } finally {
        client.release();
    }
};

export const getOrders = async (req: any, res: Response) => {
    try {
        const result = await pool.query(
            'SELECT * FROM orders WHERE profile_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getOrderDetails = async (req: any, res: Response) => {
    try {
        const { id } = req.params;
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND profile_id = $2', [id, req.user.id]);

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const order = orderResult.rows[0];
        const itemsResult = await pool.query(
            `SELECT oi.*, p.name, p.slug, s.label 
             FROM order_items oi 
             JOIN skus s ON oi.sku_id = s.id 
             JOIN products p ON s.product_id = p.id 
             WHERE oi.order_id = $1`,
            [order.id]
        );

        order.items = itemsResult.rows;

        const paymentResult = await pool.query('SELECT * FROM payments WHERE order_id = $1', [order.id]);
        order.payment = paymentResult.rows[0] || null;

        res.json(order);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateOrderStatus = async (req: any, res: Response) => {
    try {
        const { id } = req.params;
        const { payment_status, fulfillment_status } = req.body;

        const result = await pool.query(
            `UPDATE orders 
             SET payment_status = COALESCE($1, payment_status), 
                 fulfillment_status = COALESCE($2, fulfillment_status),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 RETURNING *`,
            [payment_status, fulfillment_status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.json(result.rows[0]);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
