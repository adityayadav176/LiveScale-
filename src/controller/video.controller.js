import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {ApiError} from "../utils/ApiError.js";
import {Video} from "../model/Video.model.js"
import mongoose from "mongoose";
import { deleteCache, getCache, getCacheVersion, incrementCacheVersion, setCache } from "../service/cache.service.js";
import { getFromS3 } from "../service/s3.service.js";
import videoQueue from "../queue/video.queue.js";
import { invalidateVideoCache } from "../service/cache.service.js";
const publicVideoFileds = "title description owner thumbnail duration size format resolution views likesCount commentsCount publishedAt visibility status createdAt";

const PUBLIC_VIDEO_TTL = 300;
const VIDEO_LIST_TTL = 120;

const encodeCursor = (video) => {
    return Buffer.from(
        JSON.stringify({
            publishedAt: video.publishedAt,
            id: video._id.toString()
        })
    ).toString("base64url");
};

const decodeCursor = (cursor) => {
    try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));

        const publishedAt = new Date(decoded.publishedAt);

        if (!/^[0-9a-fA-F]{24}$/.test(decoded.id) ||!Number.isFinite(publishedAt.getTime())) {
            return null;
        }

        return {
            publishedAt,
            id: decoded.id
        };

    } catch (error) {
        return null;
    }
};


const getAllVideo = asyncHandler(async(req, res) => { 
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const cursor = req.query.cursor || null;
    const cursorData = cursor ? decodeCursor(cursor) : null;


    if(cursor && !cursorData) {
        throw new ApiError(400, "Invalid cursor");
    }

     const version = await getCacheVersion("videos:public:version");
     const cacheKey =
    `videos:public:v${version}:cursor:${cursor || "first"}:limit:${limit}`;
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

    const queryFilter = cursorData ? {
    ...filter,
    $or: [
        {
            publishedAt: {
                $lt: cursorData.publishedAt
            }
        },
        {
            publishedAt: cursorData.publishedAt,
            _id: {
                $lt: cursorData.id
            }
        }
    ]
} : filter;

    const videos = await Video.find(queryFilter)
    .select("title owner thumbnail processedKey duration views publishedAt")
    .sort({publishedAt: -1, _id: -1})
    .limit(limit + 1)
    .lean();

    const hasMore = videos.length > limit;
    if(hasMore) videos.pop();

    const lastVideo = videos[videos.length - 1];

    const nextCursor = hasMore && lastVideo ? encodeCursor(lastVideo) : null;

    const videoWithThumbnail = videos.map(video => ({
        ...video,
        thumbnail: video.thumbnail ? `${process.env.CLOUDFRONT_DOMAIN}/${video.thumbnail}` : null
    }))

    const result = {
        videos: videoWithThumbnail,
        pagination: {
            limit,
            hasMore,
            nextCursor
        }
    }

    await setCache(cacheKey, result, VIDEO_LIST_TTL);
    return res.status(200).json({
        success: true,
        source: "database",
        ...result,
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

    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));

     const cursor = req.query.cursor || null;
     const cursorData = cursor ? decodeCursor(cursor) : null;

     if (cursor && !cursorData) {
        throw new ApiError(400, "Invalid cursor");
    }


        const version = await getCacheVersion(
        `videos:user:${userId}:version`
    );
     const cacheKey =
        `videos:user:${userId}:v${version}:cursor:${cursor || "first"}:limit:${limit}`;


    const cached = await getCache(cacheKey);

    if(cached) {
        return res.status(200).json({
            success: true,
            source: "cache",
            ...cached
        })
    }

    const filter = {owner: userId};

     const queryFilter = cursorData
    ? {
        ...filter,
        publishedAt: { $ne: null },
        $or: [
            { publishedAt: { $lt: cursorData.publishedAt } },
            {
                publishedAt: cursorData.publishedAt,
                _id: { $lt: cursorData.id }
            }
        ]
    }
    : {
        ...filter,
        publishedAt: { $ne: null }
    };

   const videos = await Video.find(queryFilter)
    .select("-originalKey -processedKey -previewSpriteKeys -previewVttKey")
    .sort({ publishedAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

      const hasMore = videos.length > limit;


    if (hasMore) {
        videos.pop();
    }

    const lastVideo = videos[videos.length - 1];

     const nextCursor =
        hasMore && lastVideo
            ? encodeCursor(lastVideo)
            : null;
    
    const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN?.replace(/\/$/, "");

    const videosWithThumbnails = videos.map(video => ({
        ...video,
        thumbnail: video.thumbnail && cloudFrontDomain
            ? `${cloudFrontDomain}/${video.thumbnail}`
            : null
    }));

    const result = {
        videos: videosWithThumbnails,
                        pagination: {
            limit,
            hasMore,
            nextCursor
        }
    }

    await setCache(cacheKey, result, VIDEO_LIST_TTL);
     return res.status(200).json({
            success: true,
            source: "database",
            ...result,
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
        throw new ApiError(404, "Video not found");
    }

     const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN?.replace(/\/$/, "");

      const videoWithThumbnail = {
        ...video,
        thumbnail: video.thumbnail && cloudFrontDomain ? `${cloudFrontDomain}/${video.thumbnail}` : null
    };

    await setCache(cacheKey, videoWithThumbnail, PUBLIC_VIDEO_TTL);
    return res.status(200).json({
            success: true,
            source: "database",
            video: videoWithThumbnail
    })
});

const getMyVideoById = asyncHandler(async (req, res) => {
    const {videoId} = req.params;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

      const version = await getCacheVersion(
        `video:user:${userId}:${videoId}:version`
    );

    const cacheKey =
        `video:user:${userId}:${videoId}:v${version}`;

     const cached = await getCache(cacheKey);

     if (cached) {
        return res.status(200).json(
            new ApiResponse(
                200,
                cached,
                "Video Fetched Successfully"
            )
        );
    }

    const userId = req.user._id;

    const video = await Video.findOne({
        _id: videoId,
        owner: userId
    }).select("-originalKey -processedKey").lean();

    if(!video) {
        throw new ApiError(404, "Video Not Found");
    }

    const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN?.replace(/\/$/, "");

    const videoWithThumbnail = {
        ...video,
        thumbnail: video.thumbnail && cloudFrontDomain ? `${cloudFrontDomain}/${video.thumbnail}` : null
    };

      await setCache(
        cacheKey,
        videoWithThumbnail,
        PUBLIC_VIDEO_TTL
    );

    return res.status(200).json(
        new ApiResponse(200, videoWithThumbnail, "Video Fetched Successfully")
    )
})

const updateVideoMetaData = asyncHandler(async (req, res) => {
    const { title, description } = req.body;
    const userId = req.user._id;
    const { videoId } = req.params;

    if (title === undefined && description === undefined) {
        throw new ApiError(400, "Provide at least one field to update");
    }

    if (!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const updateData = {};

    if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
            throw new ApiError(400, "Title Cannot Be Empty");
        }
        updateData.title = title.trim();
    }

    if (description !== undefined) {
        if (typeof description !== "string" || !description.trim()) {
            throw new ApiError(400, "Description Cannot Be Empty");
        }
        updateData.description = description.trim();
    }

    const video = await Video.findOneAndUpdate(
        { _id: videoId, owner: userId },
        { $set: updateData },
        { new: true, runValidators: true }
    );

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    await invalidateVideoCache(video);

    return res.status(200).json(
        new ApiResponse(200, video, "Video Updated Successfully")
    );
});

const publishVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const video = await Video.findOneAndUpdate(
        {
            _id: videoId,
            owner: userId,
            status: "ready"
        },
        {
            $set: {
                visibility: "public",
                publishedAt: new Date()
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!video) {
        throw new ApiError(
            404,
            "Video not found or not ready for publishing"
        );
    }

    await invalidateVideoCache(video);

    return res.status(200).json(
        new ApiResponse(200, video, "Video Published Successfully")
    );
});

const unPublishedVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const video = await Video.findOneAndUpdate(
        {
            _id: videoId,
            owner: userId
        },
        {
            $set: {
                visibility: "private",
                publishedAt: null
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!video) {
        throw new ApiError(404, "Video Not Found");
    }

    await invalidateVideoCache(video);

    return res.status(200).json(
        new ApiResponse(
            200,
            video,
            "Video Unpublished Successfully"
        )
    );
});

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

    await invalidateVideoCache(video);

    await videoQueue.add(
        "delete-video-files",
        {s3Keys},
    )

    return res.status(200).json(
        new ApiResponse(200, video, "Video deleted successfully. S3 cleanup has been scheduled.")
    )
})

const getVideoPlaybackURL = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const userId = req.user?._id;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const video = await Video.findById(videoId)
        .select("owner status visibility processedKey")
        .lean();

    if (!video || video.status !== "ready") {
        throw new ApiError(404, "Video is not available for playback");
    }

    const isOwner =
        userId && video.owner.toString() === userId.toString();

    const canWatch =
        video.visibility === "public" ||
        video.visibility === "unlisted" ||
        isOwner;

    if (!canWatch) {
        throw new ApiError(403, "You are not authorized to watch this video");
    }

    if (!video.processedKey) {
        throw new ApiError(404, "Processed video is not available");
    }

    const playbackURL = await getFromS3(video.processedKey);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                playbackURL,
                expiresIn: 60
            },
            "Playback URL generated successfully"
        )
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
    updateVideoMetaData,
}