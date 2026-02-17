import type { Response } from 'express';
import pool from '../config/db.js';

export const createOrder = async (req: any, res: Response) => {
    const { address_id, coupon_id } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get cart items - LOCK product rows for the duration of this transaction
        const cartResult = await client.query('SELECT id FROM cart WHERE user_id = $1', [req.user.id]);
        if (cartResult.rows.length === 0) {
            throw new Error('Cart not found');
        }
        const cart_id = cartResult.rows[0].id;

        // Use FOR UPDATE to lock product rows to prevent concurrent stock depletion
        const itemsResult = await client.query(
            `SELECT ci.*, p.price, p.stock 
             FROM cart_items ci 
             JOIN products p ON ci.product_id = p.id 
             WHERE ci.cart_id = $1 
             FOR UPDATE OF p`,
            [cart_id]
        );

        if (itemsResult.rows.length === 0) {
            throw new Error('Cart is empty');
        }

        // 1.5 CHECK IDEMPOTENCY (If key provided)
        const { idempotency_key } = req.body;
        if (idempotency_key) {
            const existingOrder = await client.query(
                'SELECT * FROM orders WHERE user_id = $1 AND idempotency_key = $2',
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
                throw new Error(`Insufficient stock for product ID ${item.product_id}`);
            }
            subtotal += item.price * item.quantity;
        }

        // 2.5 Calculate shipping
        const shipping_amount = subtotal >= 500 ? 0 : 49;

        // 2.6 Apply Coupon
        let discount_amount = 0;
        if (coupon_id) {
            const couponResult = await client.query(
                'SELECT * FROM coupons WHERE id = $1 AND is_active = true AND (valid_till IS NULL OR valid_till > CURRENT_TIMESTAMP) AND (valid_from IS NULL OR valid_from < CURRENT_TIMESTAMP) FOR UPDATE',
                [coupon_id]
            );

            if (couponResult.rows.length > 0) {
                const coupon = couponResult.rows[0];

                // Check min order amount
                if (!coupon.min_order_amount || subtotal >= coupon.min_order_amount) {
                    // Check usage limit
                    if (coupon.used_count < coupon.max_uses) {
                        discount_amount = (subtotal * coupon.discount_percentage) / 100;

                        // Apply max discount limit
                        if (coupon.max_discount_amount && discount_amount > coupon.max_discount_amount) {
                            discount_amount = coupon.max_discount_amount;
                        }

                        // Update coupon usage
                        await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon_id]);
                    }
                }
            }
        }

        // 2.7 Calculate total
        const total_amount = subtotal - discount_amount + shipping_amount;

        // 3. Get address snapshot
        const addressResult = await client.query('SELECT * FROM addresses WHERE id = $1 AND user_id = $2', [address_id, req.user.id]);
        if (addressResult.rows.length === 0) {
            throw new Error('Address not found');
        }
        const addressSnapshot = addressResult.rows[0];

        // 4. Create order with detailed pricing and idempotency key
        const orderResult = await client.query(
            `INSERT INTO orders (user_id, address_id, address_snapshot, subtotal, discount_amount, shipping_amount, total_amount, coupon_id, payment_status, fulfillment_status, idempotency_key) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'pending', $9) RETURNING *`,
            [req.user.id, address_id, JSON.stringify(addressSnapshot), subtotal, discount_amount, shipping_amount, total_amount, coupon_id, idempotency_key]
        );
        const order = orderResult.rows[0];

        // 5. Create order items with item_total and update stock
        for (const item of itemsResult.rows) {
            const item_total = item.price * item.quantity;

            await client.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase, item_total) VALUES ($1, $2, $3, $4, $5)',
                [order.id, item.product_id, item.quantity, item.price, item_total]
            );

            const updateResult = await client.query(
                'UPDATE products SET stock = stock - $1 WHERE id = $2 RETURNING stock',
                [item.quantity, item.product_id]
            );

            // Log inventory change
            await client.query(
                'INSERT INTO inventory_logs (product_id, change_type, quantity_change) VALUES ($1, $2, $3)',
                [item.product_id, 'order_placed', -item.quantity]
            );
        }

        // 6. Clear cart
        await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cart_id]);

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
            'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
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
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, req.user.id]);

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const order = orderResult.rows[0];
        const itemsResult = await pool.query(
            'SELECT oi.*, p.name, p.slug FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1',
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
