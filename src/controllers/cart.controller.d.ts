import type { Response } from 'express';
export declare const getCart: (req: any, res: Response) => Promise<void>;
export declare const addToCart: (req: any, res: Response) => Promise<void>;
export declare const updateCartItem: (req: any, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const removeCartItem: (req: any, res: Response) => Promise<void>;
export declare const removeCartItemByProductId: (req: any, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const bulkAddToCart: (req: any, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=cart.controller.d.ts.map