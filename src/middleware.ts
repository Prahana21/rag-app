import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
//By default, Express's Request object has no userId field. When we do req.userId = decoded.userId TypeScript will throw error
//So we create a new type AuthRequest that extends Request and adds userId to it.
export interface AuthRequest extends Request {
    userId?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        // Step 1: Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer "))
            return res.status(401).json({ error: "No token provided" });

        // Step 2: Extract token (remove "Bearer " prefix)
        const token = authHeader.split(" ")[1];

        // Step 3: Verify token using our secret
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        //The as { userId: string } part is just telling TypeScript "trust me, the decoded object has a userId field."

        // Step 4: Attach userId to request so routes can use it
        req.userId = decoded.userId;

        // Step 5: Pass control to the actual route
        next();

    } catch (error) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
