
import mongoose, { Schema, model } from "mongoose";

const notificationSchema = new Schema(
    {
        recipient: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        type: {
            type: String,
            enum: [
                "like",
                "comment",
                "reply",
                "subscription",
                "video_upload",
            ],
            required: true,
        },

        content: {
            type: String,
            required: true,
            trim: true,
        },

        video: {
            type: Schema.Types.ObjectId,
            ref: "Video",
            default: null,
        },

        comment: {
            type: Schema.Types.ObjectId,
            ref: "Comment",
            default: null,
        },

        isRead: {
            type: Boolean,
            default: false,
        },

        readAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

notificationSchema.index({
    recipient: 1,
    createdAt: -1,
});

export const Notification = model(
    "Notification",
    notificationSchema
);
