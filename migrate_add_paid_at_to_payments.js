import pool from './src/config/db.js';

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: Adding paid_at to payments table...');
        await client.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP');
        console.log('Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
