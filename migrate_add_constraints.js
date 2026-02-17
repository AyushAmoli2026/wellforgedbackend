import pool from './src/config/db.js';

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: Adding constraints...');

        // 1. UNIQUE constraint on payments(order_id) to support ON CONFLICT
        console.log('Adding UNIQUE constraint to payments(order_id)...');
        await client.query('ALTER TABLE payments ADD CONSTRAINT payments_order_id_unique UNIQUE (order_id)');

        // 2. UNIQUE constraint on orders(user_id, idempotency_key) for robustness
        console.log('Adding UNIQUE constraint to orders(user_id, idempotency_key)...');
        await client.query('ALTER TABLE orders ADD CONSTRAINT orders_user_id_idempotency_key_unique UNIQUE (user_id, idempotency_key)');

        console.log('Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
