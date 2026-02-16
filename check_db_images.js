
import pool from './src/config/db.ts';
import fs from 'fs';

async function checkImages() {
    try {
        let output = '';
        const products = await pool.query('SELECT id, name FROM products');
        output += '--- Products ---\n';
        products.rows.forEach(p => output += `${p.id}: ${p.name}\n`);

        const images = await pool.query('SELECT * FROM product_images');
        output += '\n--- Product Images ---\n';
        images.rows.forEach(img => output += `${img.product_id} [${img.is_primary}]: ${img.image_url}\n`);

        fs.writeFileSync('db_output_utf8.txt', output);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkImages();
