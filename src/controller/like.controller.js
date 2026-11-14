import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../model/Video.model.js";
import { Comment } from "../model/Comment.model.js";
import { Like } from "../model/Like.model.js";

const ToggleVideoLike = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video Not Found");
    }

    const existingLike = await Like.findOne({
        video: videoId,
        likedBy: userId
    });

    let message;

    if (existingLike) {
        await Like.deleteOne({ _id: existingLike._id });
        message = "Video Unliked";
    } else {
        await Like.create({
            video: videoId,
            likedBy: userId
        });

        message = "Video Liked";
    }

    return res.status(200).json(
        new ApiResponse(200, null, message)
    );
});


const toggleCommentLike = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!commentId || !mongoose.isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid CommentId");
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
        throw new ApiError(404, "Comment Not Found");
    }

    const existingLike = await Like.findOne({
        likedBy: userId,
        comment: commentId
    });

    let message;

    if (existingLike) {
        await Like.deleteOne({ _id: existingLike._id });
        message = "Comment Unliked";
    } else {
        await Like.create({
            likedBy: userId,
            comment: commentId
        });

        message = "Comment Liked";
    }

    return res.status(200).json(
        new ApiResponse(200, null, message)
    );
});


const getLikedVideo = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const likedVideos = await Like.find({
        likedBy: userId,
        video: { $exists: true, $ne: null }
    })
        .populate("video")
        .sort({ createdAt: -1 });

    return res.status(200).json(
        new ApiResponse(
            200,
            likedVideos,
            "Liked Videos Fetched Successfully"
        )
    );
});


export {
    getLikedVideo,
    ToggleVideoLike,
    toggleCommentLike
};
