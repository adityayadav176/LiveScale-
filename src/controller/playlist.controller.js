import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {Playlist} from "../model/Playlist.model.js"
import mongoose from "mongoose"
import { Video } from '../model/Video.model.js'

const createPlaylist = asyncHandler(async (req, res) => {
    const { title } = req.body;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (typeof title !== "string" || !title.trim()) {
        throw new ApiError(400, "Valid Playlist Title Is Required");
    }

    const playlist = await Playlist.create({
        title: title.trim(),
        owner: userId,
        videos: []
    });

    return res.status(201).json(
        new ApiResponse(201, playlist, "Playlist Created Successfully")
    );
});

const getMyPlaylist = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    let { page = 1, limit = 10 } = req.query;

    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.min(50, Math.max(1, parseInt(limit) || 10));

    const [playlists, total] = await Promise.all([
        Playlist.find({ owner: userId })
            .select("title createdAt")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * limitNumber)
            .limit(limitNumber)
            .lean(),

        Playlist.countDocuments({ owner: userId })
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                playlists,
                total,
                pageNumber,
                totalPages: Math.ceil(total / limitNumber)
            },
            "Playlists Fetched Successfully"
        )
    );
});

const getPlaylistById = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;

    if (!mongoose.isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid Playlist Id");
    }

    const playlist = await Playlist.findById(playlistId)
        .populate("videos", "title thumbnail duration")
        .populate("owner", "fullName username avatar");

    if (!playlist) {
        throw new ApiError(404, "Playlist Not Found");
    }

    return res.status(200).json(
        new ApiResponse(200, playlist, "Playlist Fetched Successfully")
    );
});

const addVideoInPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!mongoose.isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid Playlist Id");
    }

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid Video Id");
    }

    const video = await Video.findById(videoId).select("_id");

    if (!video) {
        throw new ApiError(404, "Video Not Found");
    }

    const updated = await Playlist.findOneAndUpdate(
        {
            _id: playlistId,
            owner: userId,
            videos: { $ne: videoId }
        },
        {
            $addToSet: {
                videos: videoId
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!updated) {
        throw new ApiError(404, "Playlist Not Found or Video Already Added");
    }

    return res.status(200).json(
        new ApiResponse(200, updated, "Video Added Successfully")
    );
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!mongoose.isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid Playlist Id");
    }

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid Video Id");
    }

    const updated = await Playlist.findOneAndUpdate(
        {
            _id: playlistId,
            owner: userId,
            videos: videoId
        },
        {
            $pull: {
                videos: videoId
            }
        },
        {
            new: true
        }
    );

    if (!updated) {
        throw new ApiError(404, "Playlist Not Found or Video Not Present");
    }

    return res.status(200).json(
        new ApiResponse(200, updated, "Video Removed Successfully")
    );
});

const deletePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!mongoose.isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid Playlist Id");
    }

    const deleted = await Playlist.findOneAndDelete({
        _id: playlistId,
        owner: userId
    });

    if (!deleted) {
        throw new ApiError(404, "Playlist Not Found");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Playlist Deleted Successfully")
    );
});

const updatePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;
    const { title } = req.body;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!mongoose.isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid Playlist Id");
    }

    if (typeof title !== "string" || !title.trim()) {
        throw new ApiError(400, "Valid Playlist Title Is Required");
    }

    const updated = await Playlist.findOneAndUpdate(
        {
            _id: playlistId,
            owner: userId
        },
        {
            $set: {
                title: title.trim()
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!updated) {
        throw new ApiError(404, "Playlist Not Found");
    }

    return res.status(200).json(
        new ApiResponse(200, updated, "Playlist Updated Successfully")
    );
});

export {
    createPlaylist,
    updatePlaylist,
    addVideoInPlaylist,
    deletePlaylist,
    removeVideoFromPlaylist,
    getPlaylistById,
    getMyPlaylist
}