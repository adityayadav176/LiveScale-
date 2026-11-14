import { Session } from "../model/Session.model.js";
import { User } from "../model/User.model.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from 'jsonwebtoken';
import { asyncHandler } from "../utils/asyncHandler.js";

export const verifyUser = asyncHandler(async(req, res, next) => {
  const token = req.cookies?.accessToken;

    if(!token) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    let decodedToken;

    try {
        decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
        throw new ApiError(401, "Invalid or expired access token");
    }

    const {userId} = decodedToken;
 
    if (!userId) {
        throw new ApiError(401, "Invalid access token payload");
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(401, "User not found");
    }

    const session = await Session.findOne({
        user: userId,
        revokedAt: null,
        expiresAt: {$gt: new Date()}
    });
    
    if (!session) {
        throw new ApiError(401, "Session expired. Please log in again.");
    }

    req.user = user;
    req.session = session;

    next();  
})