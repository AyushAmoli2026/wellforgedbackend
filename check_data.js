import pool from './src/config/db.js';

async function checkData() {
    try {
        const payments = await pool.query("SELECT * FROM payments ORDER BY created_at DESC LIMIT 5");
        console.log('Recent Payments:', payments.rows);

        const orders = await pool.query("SELECT id, status, payment_status, total_amount, created_at FROM orders ORDER BY created_at DESC LIMIT 5");
        console.log('Recent Orders:', orders.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkData();
