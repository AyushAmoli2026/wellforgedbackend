import pool from '../config/db.js';
export const getAddresses = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC', [req.user.id]);
        res.json(result.rows);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const createAddress = async (req, res) => {
    const { full_name, mobile_number, address_line1, address_line2, city, state, country, pincode, is_default } = req.body;
    try {
        if (is_default) {
            await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [req.user.id]);
        }
        const result = await pool.query(`INSERT INTO addresses (user_id, full_name, mobile_number, address_line1, address_line2, city, state, country, pincode, is_default) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`, [req.user.id, full_name, mobile_number, address_line1, address_line2, city, state, country, pincode, is_default]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const deleteAddress = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM addresses WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        res.json({ message: 'Address deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
//# sourceMappingURL=address.controller.js.map