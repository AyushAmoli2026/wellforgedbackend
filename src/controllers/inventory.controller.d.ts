import type { Request, Response } from 'express';
export declare const getBatchReport: (req: any, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getInventoryLogs: (req: Request, res: Response) => Promise<void>;
export declare const createBatchReport: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=inventory.controller.d.ts.map