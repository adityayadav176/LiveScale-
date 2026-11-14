import {User} from "../model/User.model.js";
import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import { emailQueue } from "../queue/email.queue.js";
import { cookieOption, generateAccessToken, generateRefreshToken } from "../utils/generateToken.js";
import { Session } from "../model/Session.model.js";
import { mongoose } from 'mongoose';
import { checkS3ObjectExists, deleteFromS3, getFromS3, getS3ObjectMetaData, uploadToS3 } from '../service/s3.service.js';
import { deleteOtp, generateOtp, otpKey, storeOtp, verifyOtp } from "../service/otp.service.js";
import crypto from "crypto";
import redis from "../db/redis.js";

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

    return res.status(201)
    .json(
        new ApiResponse(201, user, "User Account Created Successfully")
    )
})

const loginUser = asyncHandler(async (req, res) => {
    const {password, email, username} = req.body;

    if(!password || (!email && !username)) {
        throw new ApiError(400, "Password, Email and Username Required");
    }

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedUsername = username?.trim();

    const user = await User.findOne({
        $or: [{username: normalizedUsername}, {email: normalizedEmail}]
    }).select("+password");

    if(!user) {
        throw new ApiError(404, "User Not Found");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(password);

    if(!isPasswordCorrect) {
        throw new ApiError(401, "Invalid Credentials");
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await Session.create({
        user: user._id,
        refreshTokenHash: refreshToken,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    })

    return res.status(200)
    .cookie("accessToken", accessToken, {
        ...cookieOption(),
        maxAge: 15 * 60 * 1000
    })
    .cookie("refreshToken", refreshToken, {
        ...cookieOption,
        maxAge: 30 * 24 * 60 * 60 * 1000
    })
    .json(
        new ApiResponse(200, user, "Login SucccessFully")
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

    const user = await User.findById(userId);

    const key = user.avatarKey;

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

    const user = User.findById(userId);

    if(user) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const avatarKey = user.avatarKey;

    if(!avatarKey) {
        throw new ApiError(404, "Avatar Not Found");
    }

    const url = await getFromS3(avatarKey);

    return res.status(200)
    .json(
        new ApiResponse(200, url, "Avatar Fetched Successfully")
    )
})

const deleteAvatar = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId);

    const key = user.avatarKey;

    if (key) {
        throw new ApiError(404, "Avatar Not Found");
    }

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
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

    const user = await User.findById(userId);

    const key = user.coverImageKey

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
            console.error("Old Avatar Deletion Failed", error);
        }
    }

    return res.status(200)
    .json(
        new ApiResponse(200, user.coverImageKey, "Avatar Update Successfully")
    )
})

const getCoverImage = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    const user = User.findById(userId);

    if(user) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const CoverImageKey = user.coverImageKey;

    if(!CoverImageKey) {
        throw new ApiError(404, "Avatar Not Found");
    }

    const url = await getFromS3(coverImageKey);

    return res.status(200)
    .json(
        new ApiResponse(200, url, "CoverImage Fetched Successfully")
    )
})

const deleteCoverImage = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    const user = await User.findById(userId);

    const key = user.coverImageKey

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
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

    if(!userId || !mongoose.isvalidObjectId(userId)) {
        throw new ApiError(400, "Invalid UserId");
    }

    const user = await User.findById(userId);

    if(!user) {
        throw new ApiError(404, "User Not Found");
    }

    return res.status(200)
    .json(
        new ApiResponse(200, user, "User Fetched Successfully")
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
    
        await emailQueue.add({
            to: normalizedEmail,
            type: passwordReset,
            data: otp,
        });
    } catch (error) {
        throw new ApiError(400, "Otp Storing Failed");
    }

    const remainingTTL = await redis.ttl(otpKey(normalizedEmail));
    const expiresAt = Date.now() + remainingTTL * 1000;

    if (remainingTTL <= 0) {
        throw new ApiError(500, "OTP Expiry Could Not Be Retrieved");
    }

    const resetFlowToken = generatePasswordResetToken();
    await redis.set(`password-reset:${resetFlowToken}`, normalizedEmail, "EX", 1200);
    return res.status(200)
    .cookie("passwordResetToken", resetFlowToken, {
        ...cookieOption,
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

    const user = await User.findOneAndUpdate(
        { email },
        { $set: { password } },
        { new: true, runValidators: true }
    );

    if (!user) {
       throw new ApiError(404, "User Not Found");
    }

    await redis.del(`password-reset:${resetFlowToken}`);
    await deleteOtp(email);

    res.clearCookie("passwordResetToken", cookieOption);

    return res.status(200).json(
        new ApiResponse(200, "Password Changed Successfully")
    );
});

const sendVerificationOTP = asyncHandler(async(req, res) => {
    const user = await User.findById(req.user._id);
    const normalizedEmail = email.trim().toLowerCase();

    if (!user) {
        return res.status(200).json(
            new ApiResponse(200, "If Your Email Is Registered, OTP Will Be Sent")
        );
    }

    const email = user.email;

    try {
        const otp = generateOtp();
        await storeOtp(normalizedEmail, otp);

        await emailQueue.add({
            to: normalizedEmail,
            type: emailVerification,
            data: otp,
        })
    } catch (error) {
        throw new ApiError(400, "Otp Storing Failed");
    }

    const remainingTTL = await redis.ttl(otpKey(normalizedEmail));
    const expiresAt = Date.now() + remainingTTL * 1000;  
    
    if (remainingTTL <= 0) {
        throw new ApiError(500, "OTP Expiry Could Not Be Retrieved");
    }

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

    await Session.findOneAndDelete({ user: user._id });

    return res.status(200)
    .clearCookie("accessToken", cookieOption)
    .clearCookie("refreshToken", cookieOption)
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

    if(!decodedToken) {
        throw new ApiError(401, "Invalid Token. Unauthorized!");
    }

      const session = await Session.findOne({
        user: decodedToken._id,
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

    const accessToken = generateAccessToken(user._id);

    return res.status(200)
        .cookie("accessToken", accessToken, cookieOption)
        .json(
            new ApiResponse(200, {}, "Access Token Refreshed Successfully")
    );
})

const updateProfile = asyncHandler(async(req, res) => {
    const {username, fullName, description} = req.body;

    if (!username && !fullName) {
        throw new ApiError(400, "At Least One Field Is Required To Be Changed");
    }

    const userId = req.user._id;

    const updateFileds = {};

    if(username) updateFileds.username = username;
    if(fullName) updateFileds.fullName = fullName;
    if(description) updateFileds.description = description;

    const user = User.findByIdAndUpdate(
        { userId },
        { $set: updateFileds },
        { new: true, runValidators: true },
    )

    if(!user) {
        throw new ApiError(401, "Unauthorized Access Denied");
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