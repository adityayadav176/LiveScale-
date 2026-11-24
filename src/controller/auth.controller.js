import {User} from "../model/User.model.js";
import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import { emailQueue } from "../queue/email.queue.js";
import { cookieOption, generateAccessToken, generateRefreshToken } from "../utils/generateToken.js";
import { Session } from "../model/Session.model.js";
import { checkS3ObjectExists, deleteFromS3, uploadToS3 } from '../service/s3.service.js';
import { deleteOtp, generateOtp, otpKey, storeOtp, verifyOtp } from "../service/otp.service.js";
import crypto from "crypto";
import redis from "../db/redis.js";
import mongoose from "mongoose"
import jwt from "jsonwebtoken";
import {UAParser} from "ua-parser-js";
import {getSignedCloudFrontURL } from '../service/cloudfront.service.js';

const generatePasswordResetToken = () => {
    return crypto.randomBytes(32).toString("hex");
};

const SignupUser = asyncHandler(async(req, res) => {
    const {username, fullName, email, password, confirmPassword} = req.body;

    if([username, fullName, email, password, confirmPassword].some((item) => !item.trim())) {
        throw new ApiError(400, "All Fields Are Requierd");
    }

    if(password.length < 8) {
        throw new ApiError(400, "Password Must Be Atleast 8 Character");
    }

    if(password !== confirmPassword) {
        throw new ApiError(400, "InCorrect Confirm Password");
    }

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const existingAccount = await User.findOne({
        $or: [{username: normalizedUsername}, {email: normalizedEmail}]
    });

    if(existingAccount) {
        throw new ApiError(409, "Account Already Exists");
    }

    const user = await User.create({
        username: normalizedUsername,
        fullName,
        email: normalizedEmail,
        password
    })

    if(!user) {
        throw new ApiError(500, "Account Not Created");
    }

    await emailQueue.add("send-email", {
        to: normalizedEmail,
        type: "welcome",
        data: {fullName}
    })

    const safeUser = user.toObject();
    delete safeUser.password;
    delete safeUser.passwordChangedAt;
    delete safeUser.isEmailVerified;

    return res.status(201)
    .json(
        new ApiResponse(201, safeUser, "User Account Created Successfully")
    )
})

const loginUser = asyncHandler(async (req, res) => {
    const {password, email, username} = req.body;

    if(!password || (!email && !username)) {
        throw new ApiError(400, "Password, Email and Username Required");
    }

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedUsername = username?.trim();

    const conditions = [];

    if(normalizedEmail) {
        conditions.push({email: normalizedEmail});
    }

    if(normalizedUsername) {
        conditions.push({username: normalizedUsername});
    }

    const user = await User.findOne({
        $or: conditions
    }).select("+password");

    if(!user) {
        throw new ApiError(401, "Invalid Credentials");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(password);

    if(!isPasswordCorrect) {
        throw new ApiError(401, "Invalid Credentials");
    }

    const sessionId = crypto.randomUUID();

    const accessToken = generateAccessToken(user._id, sessionId);
    const refreshToken = generateRefreshToken(user._id, sessionId);

    const parser = new UAParser(req.headers["user-agent"]);
    const deviceInfo = parser.getResult();

    // Create session
    await Session.create({
        user: user._id,
        refreshTokenHash: refreshToken,
        sessionId,
        deviceName:
            deviceInfo.device.model ||
            deviceInfo.os.name ||
            "Unknown Device",

        browser: deviceInfo.browser.name || "Unknown",
        browserVersion: deviceInfo.browser.version || null,

        os: deviceInfo.os.name || "Unknown",
        osVersion: deviceInfo.os.version || null,

        deviceType: deviceInfo.device.type || "desktop",

        ipAddress: req.ip,
        lastActiveAt: new Date(),

        expiresAt: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
        )
    });

    const safeUser = user.toObject();
    delete safeUser.password;

    return res.status(200)
    .cookie("accessToken", accessToken, {
        ...cookieOption(),
        maxAge: 15 * 60 * 1000
    })
    .cookie("refreshToken", refreshToken, {
        ...cookieOption(),
        maxAge: 30 * 24 * 60 * 60 * 1000
    })
    .json(
        new ApiResponse(200, safeUser, "Login SucccessFully")
    )
})

const generateAvatarUploadUrl  = asyncHandler(async(req, res) => {
    const allowedTypes = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
    };

    const { fileName, contentType, fileSize } = req.body;

    if (!fileName || !contentType || !fileSize) {
        throw new ApiError(400, "Avatar file information is required");
    }

    if(!allowedTypes[contentType]) {
        throw new ApiError(400, "Invalid Image Format");
    }

    if (fileSize > 5 * 1024 * 1024) {
        throw new ApiError(400, "Avatar size must not exceed 5MB");
    }

    const {url, key} = await uploadToS3({fileName, contentType});

    return res.status(200)
    .json(
        new ApiResponse(200, {data: key, url}, "Avatar upload URL generated successfully")
    )
})

const updateAvatar = asyncHandler(async(req, res) => {
    const userId = req.user._id;
    const { key } = req.body;

    const user = await User.findById(userId).select("+avatarKey");

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if(!key) {
        throw new ApiError(400, "AWS S3 key is Required");
    }

    const expectedPrefix = "uploads/user-uploads/";

    if(!key.startsWith(expectedPrefix)) {
        throw new ApiError(403, "Invalid Avatar S3 key");
    }

    const exists = await checkS3ObjectExists(key);

    if(!exists) {
        throw new ApiError(404, "Avatar Image Not Found in S3");
    }

    const oldAvatarKey = user.avatarKey;

    user.avatarKey = key;

    await user.save();

    if(oldAvatarKey && oldAvatarKey !== key) {
        try {
            await deleteFromS3(oldAvatarKey);
        } catch (error) {
            console.error("Old Avatar Deletion Failed", error);
        }
    }

    return res.status(200)
    .json(
        new ApiResponse(200, user.avatarKey, "Avatar Update Successfully")
    )
})

const getAvatar = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId).select("+avatarKey");

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const avatarKey = user.avatarKey;

    if(!avatarKey) {
        throw new ApiError(404, "Avatar Not Found");
    }

    const url = await getSignedCloudFrontURL(avatarKey, 600);

    return res.status(200)
    .json(
        new ApiResponse(200, url, "Avatar Fetched Successfully")
    )
})

const deleteAvatar = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId).select("+avatarKey");

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const key = user.avatarKey;

    if (!key) {
        throw new ApiError(404, "Avatar Not Found");
    }

    await deleteFromS3(key);

    await User.findByIdAndUpdate(
        userId,
        {$unset: {avatarKey: 1}},
        {new: true}
    )

    return res.status(200)
    .json(
        new ApiResponse(200, "Avatar Deleted Successfully")
    )
})

const generateCoverImageUploadUrl  = asyncHandler(async(req, res) => {
    const allowedTypes = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
    };

    const { fileName, contentType, fileSize } = req.body;

    if (!fileName || !contentType || !fileSize) {
        throw new ApiError(400, "CoverImage file information is required");
    }

    if(!allowedTypes[contentType]) {
        throw new ApiError(400, "Invalid Image Format");
    }

    if (fileSize > 5 * 1024 * 1024) {
        throw new ApiError(400, "CoverImage size must not exceed 5MB");
    }

    const {url, key} = await uploadToS3({fileName, contentType});

    return res.status(200)
    .json(
        new ApiResponse(200, {data: key, url}, "CoverImage upload URL generated successfully")
    )
})

const updateCoverImage = asyncHandler(async(req, res) => {
    const userId = req.user._id;
    const { key } = req.body;

    const user = await User.findById(userId).select("+coverImageKey");

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if(!key) {
        throw new ApiError(400, "AWS S3 key is Required");
    }

    const expectedPrefix = "uploads/user-uploads/";

    if(!key.startsWith(expectedPrefix)) {
        throw new ApiError(403, "Invalid CoverImage S3 key");
    }

    const exists = await checkS3ObjectExists(key);

    if(!exists) {
        throw new ApiError(404, "CoverImage Not Found in S3");
    }

    const oldCoverImageKey = user.coverImageKey;

    user.coverImageKey = key;

    await user.save();

    if(oldCoverImageKey && oldCoverImageKey !== key) {
        try {
            await deleteFromS3(oldCoverImageKey);
        } catch (error) {
            console.error("Old CoverImage Deletion Failed", error);
        }
    }

    return res.status(200)
    .json(
        new ApiResponse(200, user.coverImageKey, "CoverImage Update Successfully")
    )
})

const getCoverImage = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId).select("+coverImageKey");

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const CoverImageKey = user.coverImageKey;

    if(!CoverImageKey) {
        throw new ApiError(404, "CoverImage Not Found");
    }

    const url = await getSignedCloudFrontURL(CoverImageKey, 600);

    return res.status(200)
    .json(
        new ApiResponse(200, url, "CoverImage Fetched Successfully")
    )
})

const deleteCoverImage = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId).select("+coverImageKey");

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const key = user.coverImageKey

    if(!key) {
        throw new ApiError(404, "Cover Image Not Found");
    }

    await deleteFromS3(key);

    await User.findByIdAndUpdate(
        userId,
        {$unset: {coverImageKey: 1}},
        {new: true}
    )

    return res.status(200)
    .json(
        new ApiResponse(200, "CoverImage Deleted Successfully")
    )
})

const fetchUser = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    if(!userId || !mongoose.isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid UserId");
    }

    const user = await User.findById(userId).select("+description +avatarKey +coverImageKey");

    if(!user) {
        throw new ApiError(404, "User Not Found");
    }

    const safeUser = user.toObject();

const avatarKey = safeUser.avatarKey;
const coverImageKey = safeUser.coverImageKey;

delete safeUser.avatarKey;
delete safeUser.coverImageKey;

safeUser.avatarUrl = avatarKey
    ? getSignedCloudFrontURL(avatarKey, 600)
    : null;

safeUser.coverImageUrl = coverImageKey
    ? getSignedCloudFrontURL(coverImageKey, 600)
    : null;

    return res.status(200)
    .json(
        new ApiResponse(200, safeUser, "User Fetched Successfully")
    )
})

const sendUpdatePasswordOTP = asyncHandler(async(req, res) => {
    const {email} = req.body;

    if(!email) {
        throw new ApiError(400, "Email Is Requierd");
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
        return res.status(200).json(
            new ApiResponse(200, "If Your Email Is Registered, OTP Will Be Sent")
        );
    }

    try {
        const otp = generateOtp();
        await storeOtp(normalizedEmail, otp);

        await emailQueue.add("send-email", {
            to: normalizedEmail,
            type: "passwordReset",
            data: {otp},
        })
    } catch (error) {
        throw new ApiError(400, "Otp Storing Failed");
    }

    const remainingTTL = await redis.ttl(otpKey(normalizedEmail));
    if (remainingTTL <= 0) {
        throw new ApiError(500, "OTP Expiry Could Not Be Retrieved");
    }
    const expiresAt = Date.now() + remainingTTL * 1000;

    const resetFlowToken = generatePasswordResetToken();
    await redis.set(`password-reset:${resetFlowToken}`, normalizedEmail, "EX", 1200);
    return res.status(200)
    .cookie("passwordResetToken", resetFlowToken, {
        ...cookieOption(),
        maxAge: 20 * 60 * 1000
    })
    .json(
        new ApiResponse(200, {expiresAt, expiresIn: remainingTTL}, "Otp Send To Your Email")
    )
})

const updatePassword = asyncHandler(async (req, res) => {
    const { otp, password, confirmPassword } = req.body;

    const resetFlowToken = req.cookies?.passwordResetToken;

    if (!resetFlowToken) {
        throw new ApiError(401, "Password Reset Session Expired");
    }

    const email = await redis.get(
        `password-reset:${resetFlowToken}`
    );

    if (!email) {
        throw new ApiError(401, "Password Reset Session Expired");
    }

    if (!otp || !password || !confirmPassword) {
        throw new ApiError(400, "OTP, Password and Confirm Password Are Required");
    }

    if (password.length < 8) {
        throw new ApiError(400, "Password Must Be At Least 8 Characters");
    }

    if (password !== confirmPassword) {
        throw new ApiError(400, "Password and Confirm Password Do Not Match");
    }

    const result = await verifyOtp(otp, email);

    if (result === "EXPIRED") {
        throw new ApiError(400, "OTP Is Expired. Try Another One.");
    }

    if (result === "MAX_ATTEMPTS") {
        throw new ApiError(429, "Maximum OTP Attempts Exceeded");
    }

    if (result !== "VERIFIED") {
        throw new ApiError(400, "Invalid OTP");
    }

    const user = await User.findOne({email}).select("+password");

    if (!user) {
       throw new ApiError(404, "User Not Found");
    }

    user.password = password;
    user.passwordChangedAt = new Date();

    await user.save();

    await Session.updateMany(
        { user: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } }
    );

    await redis.del(`password-reset:${resetFlowToken}`);
    await deleteOtp(email);

    res.clearCookie("passwordResetToken", cookieOption());

    return res.status(200).json(
        new ApiResponse(200, "Password Changed Successfully")
    );
});

const sendVerificationOTP = asyncHandler(async(req, res) => {
    const user = await User.findById(req.user._id).select("+isEmailVerified");

    if (!user) {
        return res.status(200).json(
            new ApiResponse(200, "If Your Email Is Registered, OTP Will Be Sent")
        );
    }

    if(user.isEmailVerified) {
        throw new ApiError(400, "Email Already Verified");
    }

    const normalizedEmail = user.email.trim().toLowerCase();

    try {
        const otp = generateOtp();
        await storeOtp(normalizedEmail, otp);

        await emailQueue.add("send-email", {
            to: normalizedEmail,
            type: "emailVerification",
            data: {otp},
        })
    } catch (error) {
        throw new ApiError(400, "Otp Storing Failed");
    }

    const remainingTTL = await redis.ttl(otpKey(normalizedEmail));
    if (remainingTTL <= 0) {
        throw new ApiError(500, "OTP Expiry Could Not Be Retrieved");
    }
    const expiresAt = Date.now() + remainingTTL * 1000;  

    return res.status(200)
    .json(
        new ApiResponse(200, {expiresAt, expiresIn: remainingTTL}, "OTP Send Successfully")
    )
})

const verifyEmail = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    const normalizedEmail = user.email.trim().toLowerCase();

    const {otp} = req.body;

    if(!otp) {
        throw new ApiError(400, "OTP is Required");
    }

    const result = await verifyOtp(otp, normalizedEmail);

    if (result === "EXPIRED") {
        throw new ApiError(400, "OTP Is Expired. Try Another One.");
    }

    if (result === "MAX_ATTEMPTS") {
        throw new ApiError(429, "Maximum OTP Attempts Exceeded");
    }

    if (result !== "VERIFIED") {
        throw new ApiError(400, "Invalid OTP");
    }

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { isEmailVerified: true } },
        { runValidators: true, new: true }
    );

    if (!updatedUser) {
        throw new ApiError(404, "User Not Found");
    }

    await deleteOtp(normalizedEmail);

    return res.status(200).json(
        new ApiResponse(200, updatedUser.email, "Email Verified Successfully")
    )
})

const logoutUser = asyncHandler(async(req, res) => {
    const user = await User.findById(req.user._id);

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    await Session.findOneAndDelete({ user: user._id, sessionId: req.sessionId });

    return res.status(200)
    .clearCookie("accessToken", cookieOption())
    .clearCookie("refreshToken", cookieOption())
    .json(
        new ApiResponse(200, {}, "User Logout Successfully")
    )
})

const refreshAccessToken = asyncHandler(async(req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if(!refreshToken) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    let decodedToken;

    try {
        decodedToken = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)
    } catch (error) {
        throw new ApiError(401, "Invalid or Expired Refresh Token");
    }

      const session = await Session.findOne({
        sessionId: decodedToken.sessionId,
        user: decodedToken.userId,
        revokedAt: null,
        expiresAt: { $gt: new Date() }
    }).select("+refreshTokenHash");

    if (!session) {
        throw new ApiError(401, "Session Expired or Revoked");
    }

    const isValid = await session.isRefreshTokenCorrect(refreshToken);

    if (!isValid) {
        throw new ApiError(401, "Invalid Refresh Token");
    }

    const user = await User.findById(session.user);

    if (!user) {
        throw new ApiError(401, "User Not Found");
    }

    const accessToken = generateAccessToken(user._id, session.sessionId);

    return res.status(200)
        .cookie("accessToken", accessToken, {
            ...cookieOption(),
            maxAge: 15 * 60 * 1000
        })
        .json(
            new ApiResponse(200, {}, "Access Token Refreshed Successfully")
    );
})

const updateProfile = asyncHandler(async(req, res) => {
    const {username, fullName, description} = req.body;

    if (username === undefined && fullName === undefined && description === undefined) {
        throw new ApiError(400, "At Least One Field Is Required To Be Changed");
    }

    const userId = req.user._id;

    const updateFields  = {};

    if(username !== undefined) updateFields.username = username.trim().toLowerCase();
    if(fullName !== undefined) updateFields.fullName = fullName;
    if(description !== undefined) updateFields.description = description;

    const user = await User.findOneAndUpdate(
        { _id: userId },
        { $set: updateFields  },
        { new: true, runValidators: true },
    ).select("+description")

    if(!user) {
        throw new ApiError(404, "User Not Found");
    }

    return res.status(200).
    json(
        new ApiResponse(200, user, "UserProfile Updated successfully")
    )
})

const checkUsernameExists = asyncHandler(async(req, res) => {
    const {username} = req.body;

    if(!username || !username.trim()) {
        throw new ApiError(400, "Username Is Required");
    }

    const normalizedUsername = username.trim().toLowerCase();

    const exists = await User.exists({
        username: normalizedUsername
    })

    return res.status(200).json(
        new ApiResponse(200, {available: !exists}, exists ? "Username Already Taken" : "Username Is Available")
    )
})

export {
    SignupUser,
    loginUser,
    updateAvatar,
    generateAvatarUploadUrl,
    getAvatar,
    fetchUser,
    sendUpdatePasswordOTP,
    updatePassword,
    verifyEmail,
    sendVerificationOTP,
    updateCoverImage,
    getCoverImage,
    generateCoverImageUploadUrl,
    updateProfile,
    checkUsernameExists,
    deleteAvatar,
    deleteCoverImage,
    logoutUser,
    refreshAccessToken
}