import { Queue } from "bullmq";
import redis from "../db/redis";

const videoQueue = new Queue("video-queue", {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,

        backoff: {
            type: "exponential",
            delay: 2000,
        },

        removeOnComplete: 100,
        removeOnFail: 500,
    },
});

export default videoQueue;