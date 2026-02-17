import pool from './src/config/db.js';

async function checkSchema() {
    try {
        const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables:', tables.rows.map(r => r.table_name));

        const addressColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'addresses'");
        console.log('Addresses columns:', addressColumns.rows.map(r => r.column_name));

        const paymentsColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'payments'");
        console.log('Payments columns:', paymentsColumns.rows.map(r => r.column_name));

        const ordersColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'");
        console.log('Orders columns:', ordersColumns.rows.map(r => r.column_name));

        const constraints = await pool.query("SELECT conname, contype FROM pg_constraint WHERE conrelid = 'payments'::regclass");
        console.log('Payments constraints:', constraints.rows);

        const orderConstraints = await pool.query("SELECT conname, contype FROM pg_constraint WHERE conrelid = 'orders'::regclass");
        console.log('Orders constraints:', orderConstraints.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkSchema();
