import mongoose, {Schema, model} from "mongoose";

const commentSchema = new Schema({
    content: {
        type: String,
        trim: true,
        required: true,
    },

    isContentEdited: {
        type: Boolean,
        default: false,
    },

    video: {
        type: Schema.Types.ObjectId,
        ref: "Video",
        required: true,
        index: true
    },

    parentComment: {
        type: Schema.Types.ObjectId,
        ref: "Comment",
        default: null,
        index: true
    },

    commentedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, {
    timestamps: true
})

export const Comment = model("Comment", commentSchema);