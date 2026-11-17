
import mongoose, { Schema, model } from "mongoose";

const uploadSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        video: {
            type: Schema.Types.ObjectId,
            ref: "Video",
            required: true,
        },

        uploadId: {
            type: String,
            required: true,
            unique: true,
        },

        s3Key: {
            type: String,
            required: true,
        },

        fileName: {
            type: String,
            required: true,
        },

        fileSize: {
            type: Number,
            required: true,
            min: 1,
        },

        mimeType: {
            type: String,
            required: true,
        },

        totalParts: {
            type: Number,
            required: true,
            min: 1,
        },

        uploadedParts: [
            {
                partNumber: {
                    type: Number,
                    required: true,
                },

                etag: {
                    type: String,
                    required: true,
                },
            },
        ],

        status: {
            type: String,
            enum: [
                "pending",
                "uploading",
                "completed",
                "completing",
                "failed",
                "aborted",
            ],
            default: "pending",
        },

        expiresAt: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

uploadSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

uploadSchema.index({ user: 1, status: 1 });

export const Upload = model("Upload", uploadSchema);
