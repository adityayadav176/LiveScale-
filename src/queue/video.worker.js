import { Worker } from "bullmq";
import Redis from "ioredis";
import redis from "../db/redis";

const videoWorker = new Worker("video-queue", 
    async (job) => {
        console.log(`Processing Job:`, job.id);
        const {videoId, userId, s3Key} = job.data;
        
        console.log("VideoID:", videoId);
        console.log("UserId:", userId);
        console.log("S3KEY", s3Key);
        
        // Todo work ffmpeg, s3

        return {
            success: true,
            videoId,
            message: "Video Processed Successfully"
        };
    },

    {
        connection: redis,
        concurrency: 2,
    }
);

videoWorker.on("completed", (job, result) => {
    console.log(`Job ${job.id} Completed`);
    console.log("Result:", result);    
})

videoWorker.on("failed", (job, err) => {
    console.log(`Job ${job?.id} Failed`, err.message);
})

videoWorker.on("error", (err) => {
    console.log(`Worker Error`, err);
})

export default videoWorker;