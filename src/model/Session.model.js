
import mongoose, { Schema, model } from "mongoose";
import bcrypt from "bcrypt";

const sessionSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        refreshTokenHash: {
            type: String,
            required: true,
            select: false,
        },

        userAgent: {
            type: String,
            default: null,
        },

        ipAddress: {
            type: String,
            default: null,
        },

        expiresAt: {
            type: Date,
            required: true,
        },

        revokedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
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
