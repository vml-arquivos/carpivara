import type { Request,Response,NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './config.js';

export type AuthUser={id:string;email:string;name:string;role:string};
declare global { namespace Express { interface Request { user?:AuthUser } } }

export function signToken(user:AuthUser){return jwt.sign(user,env.JWT_SECRET,{expiresIn:env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']});}
export function auth(req:Request,res:Response,next:NextFunction){
  const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');
  if(!token)return res.status(401).json({error:'AUTH_REQUIRED'});
  try{req.user=jwt.verify(token,env.JWT_SECRET) as AuthUser;next();}catch{return res.status(401).json({error:'INVALID_TOKEN'});}
}
