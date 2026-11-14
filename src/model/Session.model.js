
import mongoose, { Schema, model } from "mongoose";
import bcrypt from "bcrypt";

const sessionSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        refreshTokenHash: {
            type: String,
            required: true,
            select: false
        },

        // Device information
        deviceName: {
            type: String,
            default: "Unknown Device"
        },

        browser: {
            type: String,
            default: "Unknown"
        },

        browserVersion: {
            type: String,
            default: null
        },

        os: {
            type: String,
            default: "Unknown"
        },

        osVersion: {
            type: String,
            default: null
        },

        deviceType: {
            type: String,
            enum: ["desktop", "mobile", "tablet", "other"],
            default: "other"
        },

        ipAddress: {
            type: String,
            default: null
        },

        lastActiveAt: {
            type: Date,
            default: Date.now
        },

        expiresAt: {
            type: Date,
            required: true
        },

        revokedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

sessionSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

sessionSchema.pre("save", async function () {
    if (!this.isModified("refreshTokenHash")) return;

    this.refreshTokenHash = await bcrypt.hash(this.refreshTokenHash, 12);
});

sessionSchema.methods.isRefreshTokenCorrect = async function (refreshToken) {
    return bcrypt.compare(refreshToken, this.refreshTokenHash);
};

export const Session = model("Session", sessionSchema);
