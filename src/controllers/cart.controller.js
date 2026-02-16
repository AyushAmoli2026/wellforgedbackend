import pool from '../config/db.js';
export const getCart = async (req, res) => {
    try {
        // Get or create cart
        let cartResult = await pool.query('SELECT * FROM cart WHERE user_id = $1', [req.user.id]);
        if (cartResult.rows.length === 0) {
            cartResult = await pool.query('INSERT INTO cart (user_id) VALUES ($1) RETURNING *', [req.user.id]);
        }
        const cart = cartResult.rows[0];
        // Get items
        const itemsResult = await pool.query(`SELECT ci.*, p.name, p.price, p.slug, 
       (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = true LIMIT 1) as image_url
       FROM cart_items ci 
       JOIN products p ON ci.product_id = p.id 
       WHERE ci.cart_id = $1`, [cart.id]);
        res.json({
            ...cart,
            items: itemsResult.rows
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const addToCart = async (req, res) => {
    const { product_id, quantity } = req.body;
    try {
        // Get cart
        let cartResult = await pool.query('SELECT id FROM cart WHERE user_id = $1', [req.user.id]);
        if (cartResult.rows.length === 0) {
            cartResult = await pool.query('INSERT INTO cart (user_id) VALUES ($1) RETURNING id', [req.user.id]);
        }
        const cart_id = cartResult.rows[0].id;
        // Add or update item
        const itemResult = await pool.query(`INSERT INTO cart_items (cart_id, product_id, quantity) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (cart_id, product_id) 
       DO UPDATE SET quantity = cart_items.quantity + $3
       RETURNING *`, [cart_id, product_id, quantity]);
        res.status(201).json(itemResult.rows[0]);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const updateCartItem = async (req, res) => {
    const { id } = req.params;
    const { quantity } = req.body;
    try {
        const result = await pool.query('UPDATE cart_items SET quantity = $1 WHERE id = $2 RETURNING *', [quantity, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Cart item not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const removeCartItem = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM cart_items WHERE id = $1', [id]);
        res.json({ message: 'Item removed from cart' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const removeCartItemByProductId = async (req, res) => {
    const { productId } = req.params;
    try {
        const cartResult = await pool.query('SELECT id FROM cart WHERE user_id = $1', [req.user.id]);
        if (cartResult.rows.length === 0) {
            return res.status(404).json({ message: 'Cart not found' });
        }
        const cart_id = cartResult.rows[0].id;
        await pool.query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cart_id, productId]);
        res.json({ message: 'Product removed from cart' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const bulkAddToCart = async (req, res) => {
    const { items } = req.body; // Array of { product_id, quantity }
    if (!Array.isArray(items)) {
        return res.status(400).json({ message: 'items must be an array' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Get or create cart
        let cartResult = await client.query('SELECT id FROM cart WHERE user_id = $1', [req.user.id]);
        if (cartResult.rows.length === 0) {
            cartResult = await client.query('INSERT INTO cart (user_id) VALUES ($1) RETURNING id', [req.user.id]);
        }
        const cart_id = cartResult.rows[0].id;
        for (const item of items) {
            await client.query(`INSERT INTO cart_items (cart_id, product_id, quantity) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (cart_id, product_id) 
                 DO UPDATE SET quantity = cart_items.quantity + $3`, [cart_id, item.product_id, item.quantity]);
        }
        await client.query('COMMIT');
        res.status(200).json({ message: 'Cart synced successfully' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: error.message });
    }
    finally {
        client.release();
    }
};
//# sourceMappingURL=cart.controller.js.map