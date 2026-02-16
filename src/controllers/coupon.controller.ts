import type { Request, Response } from 'express';
import pool from '../config/db.js';

export const validateCoupon = async (req: Request, res: Response) => {
    const { code, subtotal } = req.body;

    try {
        // Find coupon by code
        const couponResult = await pool.query(
            `SELECT * FROM coupons 
             WHERE code = $1 
             AND is_active = true 
             AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP) 
             AND (valid_till IS NULL OR valid_till >= CURRENT_TIMESTAMP)`,
            [code]
        );

        if (couponResult.rows.length === 0) {
            return res.status(404).json({
                valid: false,
                message: 'Invalid or expired coupon code'
            });
        }

        const coupon = couponResult.rows[0];

        // Check minimum order amount
        if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
            return res.status(400).json({
                valid: false,
                message: `Minimum order amount of ₹${coupon.min_order_amount} required`
            });
        }

        // Check usage limit
        if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
            return res.status(400).json({
                valid: false,
                message: 'Coupon usage limit reached'
            });
        }

        // Calculate discount
        let discount_amount = 0;
        if (coupon.discount_type === 'percentage') {
            discount_amount = (subtotal * coupon.discount_percentage) / 100;

            // Apply max discount limit
            if (coupon.max_discount_amount && discount_amount > coupon.max_discount_amount) {
                discount_amount = coupon.max_discount_amount;
            }
        } else if (coupon.discount_type === 'fixed') {
            discount_amount = coupon.discount_value;
        }

        res.json({
            valid: true,
            coupon_id: coupon.id,
            code: coupon.code,
            discount_type: coupon.discount_type,
            discount_amount: parseFloat(discount_amount.toFixed(2)),
            message: 'Coupon applied successfully'
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getAllCoupons = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(
            'SELECT * FROM coupons WHERE is_active = true ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
