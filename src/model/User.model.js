
import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new Schema(
    {
        username: {
            type: String,
            unique: true,
            required: true,
            trim: true,
            lowercase: true,
        },

        fullName: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            trim: true,
            default: "",
            select: false,
        },

        email: {
            type: String,
            unique: true,
            required: true,
            trim: true,
            lowercase: true,
        },

        password: {
            type: String,
            required: true,
            select: false,
            minlength: 8,
        },

        isEmailVerified: {
            type: Boolean,
            default: false,
            select: false,
        },

        avatarKey: {
            type: String,
            default: null,
            select: false,
        },

        coverImageKey: {
            type: String,
            default: null,
            select: false,
        },

        passwordChangedAt: {
            type: Date,
            select: false,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

export const User = mongoose.model("User", userSchema);
