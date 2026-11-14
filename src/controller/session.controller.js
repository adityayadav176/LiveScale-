import { Session } from "../model/Session.model.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {ApiError} from "../utils/ApiError.js";
import {asyncHandler} from "../utils/asyncHandler.js";

const clearAuthCookies = (res) =>
  res
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions);

const getAllSessions = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const sessions = await Session.find({
        user: userId,
        revokedAt: null,
        expiresAt: { $gt: new Date() }
    })
        .select("-refreshTokenHash -user -__v")
        .sort({ lastActiveAt: -1 });

    return res.status(200).json(
        new ApiResponse(
            200,
            sessions,
            sessions.length
                ? "Sessions Fetched Successfully"
                : "No Active Sessions Found"
        )
    );
});

const logoutAllDevices = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    await Session.deleteMany({
        user: userId
    });

    return clearAuthCookies(res)
        .status(200)
        .json(
            new ApiResponse(200, {}, "Logged Out From All Devices Successfully")
        );
});

const logoutSpecificDevice = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
        throw new ApiError(400, "Invalid Session ID");
    }

    const session = await Session.findOneAndDelete({
        _id: sessionId,
        user: userId
    });

    if (!session) {
        throw new ApiError(404, "Session Not Found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Device Session Deleted Successfully"
        )
    );
});

export {
    getAllSessions,
    logoutAllDevices,
    logoutSpecificDevice
}