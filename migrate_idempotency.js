import pool from './src/config/db.js';

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: Adding idempotency_key to orders table...');
        await client.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(user_id, idempotency_key)');
        console.log('Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
