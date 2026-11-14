import mongoose, { Schema, model } from "mongoose";

const watchHistorySchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        video: {
            type: Schema.Types.ObjectId,
            ref: "Video",
            required: true,
        },

        lastWatchedAt: {
            type: Date,
            default: Date.now,
        },

        progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
},

        isComplete: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

watchHistorySchema.index(
    { user: 1, video: 1 },
    { unique: true }
);

export const WatchHistory = model("WatchHistory", watchHistorySchema);