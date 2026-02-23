import type { Request, Response } from 'express';
import pool from '../config/db.js';

export const getBatchReport = async (req: any, res: Response) => {
    const { product_id, batch_number } = req.query;

    try {
        let batchResult;
        if (product_id) {
            batchResult = await pool.query(
                'SELECT b.*, p.name as "productName" FROM batches b JOIN products p ON b.product_id = p.id WHERE b.product_id = $1 AND b.batch_number = $2',
                [product_id, batch_number]
            );
        } else {
            batchResult = await pool.query(
                'SELECT b.*, p.name as "productName" FROM batches b JOIN products p ON b.product_id = p.id WHERE b.batch_number = $1',
                [batch_number]
            );
        }

        if (batchResult.rows.length === 0) {
            // Log failed check (using report_access_logs)
            await pool.query(
                'INSERT INTO report_access_logs (batch_number, ip_address, profile_id) VALUES ($1, $2, $3)',
                [batch_number, req.ip, req.user?.id || null]
            );
            return res.status(404).json({ message: 'Batch report not found' });
        }

        const batch = batchResult.rows[0];
        const resultsResult = await pool.query(
            'SELECT parameter as name, value as result, limit_val as limit, status FROM batch_test_results WHERE batch_id = $1 ORDER BY created_at ASC',
            [batch.id]
        );

        // Convert boolean status to string 'passed'/'failed'
        const tests = resultsResult.rows.map(t => ({
            ...t,
            status: t.status ? 'passed' : 'failed'
        }));

        // Log successful check
        await pool.query(
            'INSERT INTO report_access_logs (batch_number, ip_address, profile_id) VALUES ($1, $2, $3)',
            [batch_number, req.ip, req.user?.id || null]
        );

        res.json({
            batchNumber: batch.batch_number,
            productName: batch.productName,
            testDate: batch.mfg_date, // Using mfg_date as test date fallback
            labName: 'WellForged Internal Lab', // Default or fetch from product metadata
            status: tests.every(t => t.status === 'passed') ? 'passed' : 'failed',
            tests: tests
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getInventoryLogs = async (req: Request, res: Response) => {
    const { sku_id } = req.params;

    try {
        const result = await pool.query(
            'SELECT * FROM inventory_logs WHERE sku_id = $1 ORDER BY created_at DESC',
            [sku_id]
        );
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createBatchReport = async (req: Request, res: Response) => {
    const { product_id, batch_number, mfg_date, exp_date, test_results } = req.body;

    if (!Array.isArray(test_results)) {
        return res.status(400).json({ message: 'test_results must be an array' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const batchResult = await client.query(
            'INSERT INTO batches (product_id, batch_number, mfg_date, exp_date) VALUES ($1, $2, $3, $4) RETURNING *',
            [product_id, batch_number, mfg_date, exp_date]
        );
        const batch = batchResult.rows[0];

        for (const test of test_results) {
            await client.query(
                'INSERT INTO batch_test_results (batch_id, parameter, value, limit_val, status) VALUES ($1, $2, $3, $4, $5)',
                [batch.id, test.parameter, test.value, test.limit_val, test.status]
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
