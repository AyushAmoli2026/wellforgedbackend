import type { Request, Response } from 'express';
import pool from '../config/db.js';

export const getBatchReport = async (req: any, res: Response) => {
    const { product_id, batch_number } = req.query;

    try {
        let batchResult;
        if (product_id) {
            batchResult = await pool.query(
                'SELECT rb.*, p.name as "productName" FROM report_batches rb JOIN products p ON rb.product_id = p.id WHERE rb.product_id = $1 AND rb.batch_number = $2',
                [product_id, batch_number]
            );
        } else {
            batchResult = await pool.query(
                'SELECT rb.*, p.name as "productName" FROM report_batches rb JOIN products p ON rb.product_id = p.id WHERE rb.batch_number = $1',
                [batch_number]
            );
        }

        if (batchResult.rows.length === 0) {
            // Log failed check
            await pool.query(
                'INSERT INTO report_check_logs (product_id, batch_number, fetch_status, ip_address, user_id) VALUES ($1, $2, $3, $4, $5)',
                [product_id || null, batch_number, 'not_found', req.ip, req.user?.id || null]
            );
            return res.status(404).json({ message: 'Batch report not found' });
        }

        const batch = batchResult.rows[0];
        const resultsResult = await pool.query(
            'SELECT test_name as name, test_value as result, unit as limit, pass_status as status FROM report_test_results WHERE batch_id = $1 ORDER BY created_at ASC',
            [batch.id]
        );

        // Convert boolean status to string 'passed'/'failed'
        const tests = resultsResult.rows.map(t => ({
            ...t,
            status: t.status ? 'passed' : 'failed'
        }));

        // Log successful check
        await pool.query(
            'INSERT INTO report_check_logs (product_id, batch_number, fetch_status, ip_address, user_id) VALUES ($1, $2, $3, $4, $5)',
            [batch.product_id, batch_number, 'success', req.ip, req.user?.id || null]
        );

        res.json({
            batchNumber: batch.batch_number,
            productName: batch.productName,
            testDate: batch.testing_date,
            labName: batch.tested_by,
            status: tests.every(t => t.status === 'passed') ? 'passed' : 'failed',
            tests: tests
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getInventoryLogs = async (req: Request, res: Response) => {
    const { product_id } = req.params;

    try {
        const result = await pool.query(
            'SELECT * FROM inventory_logs WHERE product_id = $1 ORDER BY created_at DESC',
            [product_id]
        );
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createBatchReport = async (req: Request, res: Response) => {
    const { product_id, batch_number, testing_date, tested_by, test_results } = req.body;

    if (!Array.isArray(test_results)) {
        return res.status(400).json({ message: 'test_results must be an array' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const batchResult = await client.query(
            'INSERT INTO report_batches (product_id, batch_number, testing_date, tested_by) VALUES ($1, $2, $3, $4) RETURNING *',
            [product_id, batch_number, testing_date, tested_by]
        );
        const batch = batchResult.rows[0];

        for (const test of test_results) {
            await client.query(
                'INSERT INTO report_test_results (batch_id, test_name, test_value, unit, pass_status) VALUES ($1, $2, $3, $4, $5)',
                [batch.id, test.test_name, test.test_value, test.unit, test.pass_status]
            );
        }

        await client.query('COMMIT');
        res.status(201).json(batch);
    } catch (error: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: error.message });
    } finally {
        client.release();
    }
};
