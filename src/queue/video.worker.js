import { Worker } from "bullmq";
import Redis from "ioredis";
import redis from "../db/redis";
import { deleteFromS3 } from "../service/s3.service";

const videoWorker = new Worker("video-queue", 
    async (job) => {
        console.log(`Processing Job:`, job.id);
        console.log(`Job Type: ${job.name}`);

        switch(job.name) {
            case "process-video" : {
                const {videoId, userId, s3Key} = job.data;
                console.log("VideoID:", videoId);
                console.log("UserId:", userId);
                console.log("S3KEY", s3Key);
                  // TODO:
                // 1. Download original video from S3
                // 2. Process video using FFmpeg
                // 3. Upload processed video to S3
                // 4. Update MongoDB video status
                return {
                    success: true,
                    videoId,
                    message: "Video Processed Successfully"
                };
            }
            case "delete-video-files": {
                const {s3Keys} = job.data;

                if(!Array.isArray(s3Keys)) {
                    throw new Error("Invalid s3 keys");
                }

                let deletedCount = 0;
                
                for(const key of s3Keys) {
                    if(!key) continue;
                    console.log("Deleting S3 object:", key);
                    await deleteFromS3(key);
                    deletedCount++;
                }

                return {
                    success: true,
                    deletedCount,
                    message: "S3 Video files Deleted Successfully"
                }
            }

            default:
                throw new Error(`Unknown job type: ${job.name}`);
        }
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