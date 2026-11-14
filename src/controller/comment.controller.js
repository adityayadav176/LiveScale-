import mongoose from "mongoose";
import { Comment } from "../model/Comment.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../model/Video.model.js";

const addComment = asyncHandler(async (req, res) => {
    const { content, parentComment = null } = req.body;
    const { videoId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!content || typeof content !== "string" || !content.trim()) {
        throw new ApiError(400, "Comment Cannot Be Empty");
    }

    if (!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const videoExists = await Video.exists({ _id: videoId });

    if (!videoExists) {
        throw new ApiError(404, "Video Not Found");
    }

    if (parentComment !== null) {
        if (!mongoose.isValidObjectId(parentComment)) {
            throw new ApiError(400, "Invalid Parent Comment ID");
        }

        const parentExists = await Comment.exists({
            _id: parentComment,
            video: videoId
        });

        if (!parentExists) {
            throw new ApiError(404, "Parent Comment Not Found");
        }
    }

    const comment = await Comment.create({
        content: content.trim(),
        video: videoId,
        commentedBy: userId,
        parentComment
    });

    return res.status(201).json(
        new ApiResponse(201, comment, "Comment Successfully Created")
    );
});


const updateComment = asyncHandler(async (req, res) => {
    const { content } = req.body;
    const { commentId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!content || typeof content !== "string" || !content.trim()) {
        throw new ApiError(400, "Comment Cannot Be Empty");
    }

    if (!commentId || !mongoose.isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid CommentId");
    }

    const updatedComment = await Comment.findOneAndUpdate(
        {
            _id: commentId,
            commentedBy: userId
        },
        {
            $set: {
                content: content.trim(),
                isContentEdited: true
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!updatedComment) {
        throw new ApiError(
            404,
            "Comment Not Found Or You Are Not Allowed To Update It"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            updatedComment,
            "Comment Updated Successfully"
        )
    );
});


const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    if (!commentId || !mongoose.isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid CommentId");
    }

    const deletedComment = await Comment.findOneAndDelete({
        _id: commentId,
        commentedBy: userId
    });

    if (!deletedComment) {
        throw new ApiError(
            404,
            "Comment Not Found Or You Are Not Allowed To Delete It"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Comment Deleted Successfully"
        )
    );
});


const getVideoComment = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(
        100,
        Math.max(1, parseInt(limit, 10) || 10)
    );

    const skip = (pageNumber - 1) * limitNumber;

    const videoExists = await Video.exists({ _id: videoId });

    if (!videoExists) {
        throw new ApiError(404, "Video Not Found");
    }

    const [totalComments, comments] = await Promise.all([
        Comment.countDocuments({ video: videoId }),

        Comment.find({ video: videoId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .populate("commentedBy", "username avatar")
    ]);

    const totalPages = Math.ceil(totalComments / limitNumber);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                comments,
                totalComments,
                currentPage: pageNumber,
                totalPages,
                hasNextPage: pageNumber < totalPages,
                hasPreviousPage: pageNumber > 1
            },
            comments.length
                ? "Comments Fetched Successfully"
                : "No Comments Yet"
        )
    );
});


export {
    addComment,
    updateComment,
    deleteComment,
    getVideoComment
};
