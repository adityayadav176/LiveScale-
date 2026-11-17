import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Subscription } from "../model/subscription.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../model/Video.model.js";
import { User } from "../model/User.model.js";
import { Comment } from "../model/Comment.model.js";
import { Like } from "../model/Like.model.js";

const toggleSubscribe = asyncHandler(async(req, res) => {
    const userId = req.user._id;

    if(!userId || !mongoose.isValidObjectId(userId)) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const {channelId} = req.params;

    if(!channelId || !mongoose.isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid ChannelId");
    }

    const existingSubscriber = await Subscription.findOne({
        subscriber: userId,
        channel: channelId
    });

    if (userId.toString() === channelId) {
        throw new ApiError(
            400,
            "You cannot subscribe to your own channel"
    );
}

    let message;
    let isSubscribed;

    if(existingSubscriber) {
      await Subscription.deleteOne({
            subscriber: userId,
            channel: channelId
        });
        message = "Channel UnSubscribe";
        isSubscribed = false;
    } else {
       await Subscription.create({
            subscriber: userId,
            channel: channelId
        })
        isSubscribed = true;
        message = "Channel Subscribed";
    }

    return res.status(200)
    .json(
        new ApiResponse(200, isSubscribed, message)
    )
})

const channelSubscribers = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId || !mongoose.isValidObjectId(userId)) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const { page, limit } = req.query;

    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 10));

    const skip = (pageNumber - 1) * limitNumber;

    const [subscribers, totalSubscribers] = await Promise.all([
        Subscription.find({ channel: userId })
            .populate("subscriber", "fullName username avatar")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber),

        Subscription.countDocuments({ channel: userId })
    ]);

    const totalPages = Math.ceil(totalSubscribers / limitNumber);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                subscribers,
                pagination: {
                    totalSubscribers,
                    currentPage: pageNumber,
                    limit: limitNumber,
                    totalPages,
                    hasNextPage: pageNumber < totalPages,
                    hasPrevPage: pageNumber > 1
                }
            },
            "Subscribers Fetched Successfully"
        )
    );
});

const getSubscribedChannels = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const { page, limit } = req.query;

    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 10));

    const skip = (pageNumber - 1) * limitNumber;

    const [channels, totalChannels] = await Promise.all([
        Subscription.find({ subscriber: userId })
            .populate("channel", "fullName username avatar coverImage")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber),

        Subscription.countDocuments({ subscriber: userId })
    ]);

    const totalPages = Math.ceil(totalChannels / limitNumber);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                channels,
                pagination: {
                    totalChannels,
                    currentPage: pageNumber,
                    limit: limitNumber,
                    totalPages,
                    hasNextPage: pageNumber < totalPages,
                    hasPrevPage: pageNumber > 1
                }
            },
            "Subscribed Channels Fetched Successfully"
        )
    );
});

const getChannelStats = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId || !mongoose.isValidObjectId(userId)) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const channel = await User.findById(userId)
        .select("fullname username avatar coverImage createdAt updatedAt")
        .lean();

    if (!channel) {
        throw new ApiError(404, "Channel Not Found");
    }

    // Fetch channel videos and subscriber count
    const [videos, totalSubscribers] = await Promise.all([
        Video.find({ owner: userId })
            .select("_id views")
            .lean(),

        Subscription.countDocuments({
            channel: userId
        })
    ]);

    // Calculate total video views using JavaScript
    const totalViews = videos.reduce(
        (total, video) => total + (video.views || 0),
        0
    );

    const videoIds = videos.map(video => video._id);

    // Fetch total likes and comments
    const [totalLikes, totalComments] = await Promise.all([
        Like.countDocuments({
            video: { $in: videoIds }
        }),

        Comment.countDocuments({
            video: { $in: videoIds }
        })
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                channel: {
                    fullname: channel.fullname,
                    username: channel.username,
                    avatar: channel.avatar,
                    coverImage: channel.coverImage,
                    createdAt: channel.createdAt,
                    updatedAt: channel.updatedAt
                },

                statistics: {
                    totalSubscribers,
                    totalVideos: videos.length,
                    totalViews,
                    totalLikes,
                    totalComments
                }
            },
            "Channel Stats Fetched Successfully"
        )
    );
});

export {
    toggleSubscribe,
    channelSubscribers,
    getChannelStats,
    getSubscribedChannels
}
