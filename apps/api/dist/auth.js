import jwt from 'jsonwebtoken';
import { env } from './config.js';
export function signToken(user) { return jwt.sign(user, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN }); }
export function auth(req, res, next) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token)
        return res.status(401).json({ error: 'AUTH_REQUIRED' });
    try {
        req.user = jwt.verify(token, env.JWT_SECRET);
        next();
    }
    catch {
        return res.status(401).json({ error: 'INVALID_TOKEN' });
    }
}
