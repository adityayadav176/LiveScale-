import { Worker } from "bullmq";
import redis from "../db/redis.js";
import { deleteFromS3, downloadFromS3, uploadFileToS3, uploadHLSDirectoryToS3 } from "../service/s3.service.js";
import { generateHLS, generatePreviewSprites } from "../service/ffmpeg.service.js";
import fs from "fs/promises"
import os from "os";
import path from "path";
import crypto from "crypto";

const videoWorker = new Worker("video-queue", 
    async (job) => {
        console.log(`Processing Job:`, job.id);
        console.log(`Job Type: ${job.name}`);

        switch(job.name) {
            case "process-video" : {
                const {videoId, userId, s3Key} = job.data;
                if (!videoId || !userId || !s3Key) {
    throw new Error("Video ID, User ID and S3 key are required");
}
                 const jobDir = path.join(os.tmpdir(), `livescale-${videoId}-${crypto.randomUUID()}`);

                 const inputPath = path.join(jobDir, "original.mp4");
                 const hlsDir = path.join(jobDir, "hls");
                 const previewDir = path.join(jobDir, "preview");

                 try {
                    await fs.mkdir(jobDir, {recursive : true});
                    // Download original video from S3

                    await downloadFromS3({
                        key: s3Key,
                        destination: inputPath
                    })
                     // Generate HLS resolutions

                     await generateHLS({
                        inputPath,
                        outputDir: hlsDir
                     })
                    // Generate timestamp previews

                    await generatePreviewSprites({
                        inputPath,
                        outputDir: previewDir
                    })

                    const previewImageKey = `videos/${videoId}/previews/preview.jpg`;
                    const previewVttKey = `videos/${videoId}/previews/preview.vtt`;

                    await uploadFileToS3({
                        filePath: path.join(previewDir, "preview.jpg"),
                        key: previewImageKey,
                        contentType: "image/jpeg"
                    })

                    await uploadFileToS3({
                        filePath: path.join(previewDir, "preview.vtt"),
                        key: previewVttKey,
                        contentType: "text/vtt"
                    })

                    // Upload HLS files

                    const hlsResult = await uploadHLSDirectoryToS3({
                        outputDir: hlsDir,
                        videoId
                    })

                    return {
                        success: true,
                        videoId,
                        hlsResult,
                        preview: {
                            imageKey: previewImageKey,
                            vttKey: previewVttKey
                        }
                    }
                } catch (error) {
    console.error("Video processing failed:", error);

    throw error;
} finally {
    await fs.rm(jobDir, {
        recursive: true,
        force: true
    });
}
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