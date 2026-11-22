
import mongoose, { Schema } from "mongoose";

const videoSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },

        description: {
            type: String,
            trim: true,
            default: "",
        },

        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // Main video cover thumbnail
        thumbnail: {
            type: String,
            default: null,
        },

        // Original uploaded video S3 key
        originalKey: {
            type: String,
            required: true,
        },

        // FFmpeg processed video S3 key
        processedKey: {
            type: String,
            default: null,
        },

        // Video metadata
        duration: {
            type: Number,
            default: null,
            min: 0,
        },

        size: {
            type: Number,
            required: true,
            min: 0,
        },

        format: {
            type: String,
            required: true,
            lowercase: true,
        },

        resolution: {
            type: String,
            default: null,
        },

        // FFmpeg timeline preview assets
        previewSpriteKeys: {
            type: [String],
            default: [],
        },

        previewVttKey: {
            type: String,
            default: null,
        },

        // Engagement counters
        views: {
            type: Number,
            default: 0,
            min: 0,
        },

        likesCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        commentsCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Publishing information
        publishedAt: {
            type: Date,
            default: null,
        },

        visibility: {
            type: String,
            enum: ["public", "private", "unlisted"],
            default: "private",
        },

        status: {
            type: String,
            enum: ["uploading", "uploaded", "processing", "ready", "failed"],
            default: "uploading",
        },
    },
    {
        timestamps: true,
    }
);

videoSchema.index({
    visibility: 1,
    status: 1,
    publishedAt: -1,
    _id: -1
});

videoSchema.index({
    owner: 1,
    createdAt: -1,
    _id: -1
});

export const Video = mongoose.model("Video", videoSchema);
