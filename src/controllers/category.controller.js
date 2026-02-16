import pool from '../config/db.js';
export const getCategories = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
        res.json(result.rows);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const createCategory = async (req, res) => {
    const { name, slug } = req.body;
    try {
        const result = await pool.query('INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING *', [name, slug]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
//# sourceMappingURL=category.controller.js.map