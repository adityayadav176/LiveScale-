import mongoose, {Schema, model} from "mongoose";

const likeSchema = new Schema({
    video: {
        type: Schema.Types.ObjectId,
        ref: "Video",
        required: true,
    },
    likedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    comment: {
        type: Schema.Types.ObjectId,
        ref: "Comment",
        required: true,
    }
}, {
    timestamps: true
})

likeSchema.index(
    { likedBy: 1, video: 1 },
    { unique: true, partialFilterExpression: { video: { $type: "objectId" } } }
);

likeSchema.index(
    { likedBy: 1, comment: 1 },
    { unique: true, partialFilterExpression: { comment: { $type: "objectId" } } }
);

export const Like = model("Like", likeSchema);