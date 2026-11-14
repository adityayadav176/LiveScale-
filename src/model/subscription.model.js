
import mongoose, { Schema, model } from "mongoose";

const subscriptionSchema = new Schema(
    {
        subscriber: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        channel: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

subscriptionSchema.index(
    { subscriber: 1, channel: 1 },
    { unique: true }
);

// Prevent users from subscribing to themselves
subscriptionSchema.pre("validate", function () {
    if (this.subscriber && this.subscriber.equals(this.channel)) {
        this.invalidate("channel", "You cannot subscribe to your own channel.");
    }
});

export const Subscription = model("Subscription", subscriptionSchema);
