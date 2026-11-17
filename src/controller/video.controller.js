import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {ApiError} from "../utils/ApiError.js";
import {Video} from "../model/Video.model.js"
import mongoose from "mongoose";
import { deleteCache, getCache, getCacheVersion, incrementCacheVersion, setCache } from "../service/cache.service.js";
import { getFromS3 } from "../service/s3.service.js";
import videoQueue from "../queue/video.queue.js";

const publicVideoFileds = "title description owner thumbnail duration size format resolution views likesCount commentsCount publishedAt visibility status createdAt";

const PUBLIC_VIDEO_TTL = 300;
const VIDEO_LIST_TTL = 120;

const getAllVideo = asyncHandler(async(req, res) => { 
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;
    const version = await getCacheVersion("videos:public:version");
    const cacheKey = `videos:public:v${version}:page:${page}:limit:${limit}`;
    const cached = await getCache(cacheKey);

    if(cached) {
        return res.status(200).json({
            success: true,
            source: "cache",
            ...cached
        });
    }

    const filter = {
        status: "ready",
        visibility: "public"
    };

    const [videos, totalVideos] = await Promise.all([
        Video.find(filter)
        .select(publicVideoFileds)
        .sort({publishedAt: -1, _id: -1})
        .skip(skip)
        .limit(limit)
        .lean(),

        Video.countDocuments(filter)
    ]);

    const result = {
        videos,
        pagination: {
            limit: limit,
            currentPage: page,
            totalPages: Math.ceil(totalVideos / limit),
            totalVideos,
            hasNextPage: page < Math.ceil(totalVideos / limit),
            hasPrevPage: page > 1
        }
    }

    await setCache(cacheKey, result, VIDEO_LIST_TTL);

    return res.status(200).json({
        success: true,
        source: "database",
        ...result
    });
})

const getMyVideos = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    
    if(!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if(!mongoose.isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid UserId");
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const version = await getCacheVersion(`videos:user:${userId}:version`);
    const cacheKey = `videos:user:${userId}:v${version}:page:${page}:limit:${limit}`;

    const cached = await getCache(cacheKey);

    if(cached) {
        return res.status(200).json({
            success: true,
            source: "cache",
            ...cached
        })
    }

    const filter = {owner: userId};

    const [videos, totalVideos] = await Promise.all([
        Video.find(filter)
        .select("-originalKey -processedKey -previewSpriteKeys -previewVttKey")
        .sort({createdAt: -1, _id: -1})
        .skip(skip)
        .limit(limit)
        .lean(),

        Video.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalVideos / limit);

    const result = {
        videos,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalVideos,
                    limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
    }

    await setCache(cacheKey, result, VIDEO_LIST_TTL);
     return res.status(200).json({
            success: true,
            source: "database",
            ...result
        });
})

const getVideoById = asyncHandler(async (req, res) => {
    const {videoId} = req.params;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const cacheKey = `video:public:${videoId}`;
    const cached = await getCache(cacheKey);

    if (cached) {
            return res.status(200).json({
                success: true,
                source: "cache",
                video: cached
            })
    }

     const video = await Video.findOne({
            _id: videoId,
            status: "ready",
            visibility: { $in: ["public", "unlisted"] }
    }).select(publicVideoFileds)
    .lean();

    if (!video) {
            return res.status(404).json({
                success: false,
                message: "Video not found"
            });
    }

    await setCache(cacheKey, video, PUBLIC_VIDEO_TTL);

    return res.status(200).json({
            success: true,
            source: "database",
            video
    })
});

const getMyVideoById = asyncHandler(async (req, res) => {
    const {videoId} = req.params;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const userId = req.user._id;

    const video = await Video.findOne({
        _id: videoId,
        owner: userId
    }).select("-originalKey -processedKey").lean();

    if(!video) {
        throw new ApiError(404, "Video Not Found");
    }

    return res.status(200).json(
        new ApiResponse(200, video, "Video Fetched Successfully")
    )
})

const invalidateVideoCache = async(video) => {
    await Promise.all([
        deleteCache(`video:public:${video._id}`),
        incrementCacheVersion("videos:public:version"),
        incrementCacheVersion(`videos:user:${video.owner}:version`)
    ]);
}

const updateVideoMetaData = asyncHandler(async(req, res) => {
    const {title, description} = req.body;
    const userId = req.user._id;
    const {videoId} = req.params;
    if (title === undefined && description === undefined) {
        throw new ApiError(400, "Provide at least one field to update");
    }
    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(404, "Invalid VideoId");
    }
    const updateData = {};

    if(title !== undefined) {
        if(typeof title !== "string" || !title.trim()) {
            throw new ApiError(400, "Title Cannot Be Empty");
        }
        updateData.title = title.trim();
    }
    if(description !== undefined) {
        if(typeof description !== "string" || !description.trim()) {
            throw new ApiError(400, "Description Cannot Be Empty");
        }
        updateData.description = description.trim();
    }

    if(Object.keys(updateData).length === 0) {
        throw new ApiError(400, "Provide title or description to update");
    }

    const video = await Video.findOneAndUpdate(
        {_id: videoId, owner: userId},
        {$set: updateData},
        {new: true, runValidators: true}
    )

    if(!video) {
        throw new ApiError(404, "Video not found");
    }

    await invalidateVideoCache(video);

    return res.status(200).json(
        new ApiResponse(200, video, "Video Updated Successfully")
    );
});

const publishVideo = asyncHandler(async (req, res) => {
    const {videoId} = req.params;
    const userId = req.user._id;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoID");
    }

    const video = await Video.findOne({
        _id: videoId,
        owner: userId,
    });

    if(!video) {
        throw new ApiError(404, "Video Not Found");
    }

    if(video.status !== "ready") {
        throw new ApiError(400, "Only processed videos can be published");
    }

    video.visibility = "public";
    video.publishedAt = new Date();

    await video.save();
    await invalidateVideoCache(video);

    return res.status(200).json(
        new ApiResponse(200, video, "Video Publised Successfully")
    )
})

const unPublishedVideo = asyncHandler(async(req, res) => {
    const {videoId} = req.params;
    const userId = req.user._id;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoID");
    }

    const video = await Video.findOne({
        _id: videoId,
        owner: userId,
    });

    if(!video) {
        throw new ApiError(404, "Video Not Found");
    }

    video.visibility = "private";
    video.publishedAt = null;

    await video.save();
    await invalidateVideoCache(video);

    return res.status(200).json(
        new ApiResponse(200, video, "Video UnPublised Successfully")
    )
})

const deleteVideo = asyncHandler(async(req, res) => {
    const {videoId} = req.params;
    const userId = req.user._id;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoID");
    }

    const video = await Video.findOne({
        _id: videoId,
        owner: userId,
    });

    if(!video) {
        throw new ApiError(404, "Video Not Found");
    }

    const s3Keys = [
            video.originalKey,
            video.processedKey,
            ...(video.previewSpriteKeys || []),
            video.previewVttKey,
            video.thumbnail
    ].filter(Boolean);
    await video.deleteOne();
    await videoQueue.add(
        "delete-video-files",
        {s3Keys},
    )
    await invalidateVideoCache(video);

    return res.status(200).json(
        new ApiResponse(200, video, "Video deleted successfully. S3 cleanup has been scheduled.")
    )
})

const getVideoPlaybackURL = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    // Optional authentication: guest users are allowed.
    const userId = req.user?._id;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const video = await Video.findById(videoId);

    if (!video || video.status !== "ready") {
        throw new ApiError(404, "Video is not available for playback");
    }

    const isOwner =
        userId && video.owner.equals(userId);

    const isPublic =
        video.visibility === "public";

    const isUnlisted =
        video.visibility === "unlisted";

    const canWatch =
        isPublic || isUnlisted || isOwner;

    if (!canWatch) {
        throw new ApiError(403, "You are not authorized to watch this video");
    }

    if (!video.processedKey) {
        throw new ApiError(404, "Processed video is not available");
    }

    const playbackURL = await getFromS3(video.processedKey);

    return res.status(200).json(
        new ApiResponse(200, {
            playbackURL,
            expiresIn: 60
        }, "Playback URL generated successfully")
    );
});

export {
    getVideoPlaybackURL,
    deleteVideo,
    unPublishedVideo,
    getMyVideoById,
    getVideoById,
    getAllVideo,
    getMyVideos,
    publishVideo,
    updateVideoMetaData
}