import type { Request, Response } from 'express';
import pool from '../config/db.js';

export const getProducts = async (req: Request, res: Response) => {
    try {
        const { category, search } = req.query;
        let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = true AND p.deleted_at IS NULL';
        const params: any[] = [];

        if (category) {
            params.push(category);
            query += ` AND c.slug = $${params.length}`;
        }

        if (search) {
            params.push(`%${search}%`);
            query += ` AND (p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`;
        }

        query += ' ORDER BY p.created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getProductBySlug = async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;
        const result = await pool.query(
            'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = $1 AND p.deleted_at IS NULL',
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const product = result.rows[0];

        // Fetch images
        const images = await pool.query(
            'SELECT id, image_url, is_primary, sort_order FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC',
            [product.id]
        );

        product.images = images.rows;

        res.json(product);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createProduct = async (req: Request, res: Response) => {
    const { name, slug, sku, description, price, stock, category_id, is_active } = req.body;

    try {
        const result = await pool.query(
            'INSERT INTO products (name, slug, sku, description, price, stock, category_id, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [name, slug, sku, description, price, stock, category_id, is_active]
        );

        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
