import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export const signup = async (req: Request, res: Response) => {
    const { first_name, last_name, email, mobile_number, otp, terms_accepted, whatsapp_opt_in } = req.body;

    try {
        // 1. Verify OTP (default 1234)
        if (otp !== '1234') {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // 2. Check if user exists by mobile_number
        const userExists = await pool.query('SELECT * FROM users WHERE mobile_number = $1', [mobile_number]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists, please login' });
        }

        // 3. Create user (password is not used in OTP flow but kept in DB if needed, using a random one)
        const password = await bcrypt.hash(Math.random().toString(36), 10);

        const newUser = await pool.query(
            'INSERT INTO users (first_name, last_name, email, mobile_number, password, terms_accepted, whatsapp_opt_in) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, first_name, last_name, email, mobile_number, role',
            [first_name, last_name, email, mobile_number, password, terms_accepted || false, whatsapp_opt_in || false]
        );

        const user = newUser.rows[0];

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET is not defined');
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            jwtSecret,
            { expiresIn: (process.env.JWT_EXPIRES_IN as any) || '7d' }
        );

        res.status(201).json({ token, user });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const login = async (req: Request, res: Response) => {
    const { mobile_number, otp } = req.body;

    try {
        // 1. Verify OTP
        if (otp !== '1234') {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // 2. Find user
        const userResult = await pool.query('SELECT * FROM users WHERE mobile_number = $1', [mobile_number]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found, please signup' });
        }

        const user = userResult.rows[0];

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET is not defined');
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            jwtSecret,
            { expiresIn: (process.env.JWT_EXPIRES_IN as any) || '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                mobile_number: user.mobile_number,
                role: user.role,
            },
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getProfile = async (req: any, res: Response) => {
    try {
        const userResult = await pool.query(
            'SELECT id, first_name, last_name, email, mobile_number, role, is_verified, created_at FROM users WHERE id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(userResult.rows[0]);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
