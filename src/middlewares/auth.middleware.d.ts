import type { Response, NextFunction } from 'express';
import type { UserRole } from '../types/index.js';
export declare const authenticate: (req: any, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const optionalAuthenticate: (req: any, res: Response, next: NextFunction) => void;
export declare const authorize: (roles: UserRole[]) => (req: any, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.middleware.d.ts.map