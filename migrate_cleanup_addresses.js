import pool from './src/config/db.js';

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: Removing address_line2 and country from addresses...');
        await client.query('ALTER TABLE addresses DROP COLUMN IF EXISTS address_line2');
        await client.query('ALTER TABLE addresses DROP COLUMN IF EXISTS country');
        console.log('Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
