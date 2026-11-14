import {ApiError} from "../utils/ApiError.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import mongoose from "mongoose";
import { User } from '../model/User.model.js';
import { WatchHistory } from "../model/WatchHistory.model.js";
import { Video } from '../model/Video.model.js';


const addToWatchHistory = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { currentTime } = req.body;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    if ( typeof currentTime !== "number" || !Number.isFinite(currentTime) || currentTime < 0) {
        throw new ApiError(400, "Invalid Current Playback Time")
    }

    const video = await Video.findById(videoId).select("duration");

    if (!video) {
        throw new ApiError(404, "Video Not Found");
    }

    const duration = video.duration;

    if (!Number.isFinite(duration) || duration <= 0) {
        throw new ApiError(400, "Invalid Video Duration");
    }

    const watchTime = Math.min(currentTime, duration);

    const progress = Math.min(
        100,
        (watchTime / duration) * 100
    );

    const isComplete = progress >= 90;

    const watchHistory = await WatchHistory.findOneAndUpdate(
        {
            user: userId,
            video: videoId
        },
        {
            $set: {
                lastWatchedAt: new Date(),
                progress,
                isComplete
            }
        },
        {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true
        }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            watchHistory,
            "Watch History Updated Successfully"
        )
    );
});

const getWatchHistory = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    if(!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const watchHistory = await WatchHistory.findOne({
        user: userId
    }).populate("video").sort({lastWatchedAt: -1});

    if(!watchHistory.length) {
        throw new ApiError(404, "Watch History Not Found");
    }

    return res.status(200)
    .json(
        new ApiResponse(200, watchHistory, "WatchHistory Fetched Successfully")
    )
});

const removeFromWatchHistory = asyncHandler(async(req, res) => {
    const {videoId} = req.params;
    const userId = req.user._id;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    if(!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const watchHistory = await WatchHistory.findOneAndDelete({
        user: userId,
        video: videoId
    });

    if(!watchHistory) {
        throw new ApiError(404, "WatchHistory Not Found");
    }

    return res.status(200)
    .json(
        new ApiResponse(200, {}, "Video Removed Successfully")
    )
});

export {
    removeFromWatchHistory,
    getWatchHistory,
    addToWatchHistory
}