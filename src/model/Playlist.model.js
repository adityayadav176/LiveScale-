import mongoose, {Schema, model} from "mongoose";

const playlistSchema = new Schema({
    videos: [{
        type: Schema.Types.ObjectId,
        ref: "Video"
    }],
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        index: true
    }
}, {
    timestamps: true
})

playlistSchema.index({
    owner: 1,
    createdAt: -1
});

export const Playlist = model("Playlist", playlistSchema);