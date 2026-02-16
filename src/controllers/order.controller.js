import pool from '../config/db.js';
export const createOrder = async (req, res) => {
    const { address_id, coupon_id } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // 1. Get cart items
        const cartResult = await client.query('SELECT id FROM cart WHERE user_id = $1', [req.user.id]);
        if (cartResult.rows.length === 0) {
            throw new Error('Cart not found');
        }
        const cart_id = cartResult.rows[0].id;
        const itemsResult = await client.query('SELECT ci.*, p.price, p.stock FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = $1', [cart_id]);
        if (itemsResult.rows.length === 0) {
            throw new Error('Cart is empty');
        }
        // 2. Calculate total and check stock
        let totalAmount = 0;
        for (const item of itemsResult.rows) {
            if (item.stock < item.quantity) {
                throw new Error(`Insufficient stock for product ID ${item.product_id}`);
            }
            totalAmount += item.price * item.quantity;
        }
        // 2.5 Apply Coupon
        let discount = 0;
        if (coupon_id) {
            const couponResult = await client.query('SELECT * FROM coupons WHERE id = $1 AND is_active = true AND (valid_till IS NULL OR valid_till > CURRENT_TIMESTAMP) AND (valid_from IS NULL OR valid_from < CURRENT_TIMESTAMP)', [coupon_id]);
            if (couponResult.rows.length > 0) {
                const coupon = couponResult.rows[0];
                // Check min order amount
                if (!coupon.min_order_amount || totalAmount >= coupon.min_order_amount) {
                    // Check usage limit
                    if (coupon.used_count < coupon.max_uses) {
                        discount = (totalAmount * coupon.discount_percentage) / 100;
                        // Apply max discount limit
                        if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
                            discount = coupon.max_discount_amount;
                        }
                        totalAmount -= discount;
                        // Update coupon usage
                        await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon_id]);
                    }
                }
            }
        }
        // 3. Get address snapshot
        const addressResult = await client.query('SELECT * FROM addresses WHERE id = $1 AND user_id = $2', [address_id, req.user.id]);
        if (addressResult.rows.length === 0) {
            throw new Error('Address not found');
        }
        const addressSnapshot = addressResult.rows[0];
        // 4. Create order
        const orderResult = await client.query(`INSERT INTO orders (user_id, address_id, address_snapshot, total_amount, coupon_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [req.user.id, address_id, JSON.stringify(addressSnapshot), totalAmount, coupon_id]);
        const order = orderResult.rows[0];
        // 5. Create order items and update stock
        for (const item of itemsResult.rows) {
            await client.query('INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)', [order.id, item.product_id, item.quantity, item.price]);
            const updateResult = await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock', [item.quantity, item.product_id]);
            if (updateResult.rows.length === 0) {
                throw new Error(`Insufficient stock for product ID ${item.product_id} (Race condition)`);
            }
            // Log inventory change
            await client.query('INSERT INTO inventory_logs (product_id, change_type, quantity_change) VALUES ($1, $2, $3)', [item.product_id, 'order_placed', -item.quantity]);
        }
        // 6. Clear cart
        await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cart_id]);
        await client.query('COMMIT');
        res.status(201).json(order);
    }
    catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: error.message });
    }
    finally {
        client.release();
    }
};
export const getOrders = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
        res.json(result.rows);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }
        const order = orderResult.rows[0];
        const itemsResult = await pool.query('SELECT oi.*, p.name, p.slug FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1', [order.id]);
        order.items = itemsResult.rows;
        const paymentResult = await pool.query('SELECT * FROM payments WHERE order_id = $1', [order.id]);
        order.payment = paymentResult.rows[0] || null;
        res.json(order);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
//# sourceMappingURL=order.controller.js.map