import jwt from "jsonwebtoken";

const generateAccessToken = (userId, sessionId) => {
    return jwt.sign(
        { userId, sessionId },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );
};

const generateRefreshToken = (userId, sessionId) => {
    return jwt.sign(
        { userId, sessionId },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
    );
};


const cookieOption = () => {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    };
};


export {
    generateAccessToken,
    generateRefreshToken,
    cookieOption
};
