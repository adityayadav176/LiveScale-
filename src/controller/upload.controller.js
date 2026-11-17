import { randomUUID } from "crypto";
import { Upload } from "../model/upload.model.js"
import { Video } from "../model/Video.model.js"
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js"
import { abortMultipartUpload, checkS3ObjectExists, completeMutipartUpload, createMultipartUpload, deleteFromS3, getFromS3, getMultipartUploadUrl, getThumbnailuploadUrl } from "../service/s3.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import videoQueue from './../queue/video.queue';
import mongoose from "mongoose";
import { invalidateVideoCache } from "../service/cache.service.js";

// part size : 10 MB
const PART_SIZE = 10 * 1024 * 1024;
// max video Size : 5b
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;
// upload expiry : 24 hours 
const UPLOAD_EXPIRY = 24 * 60 * 60 * 1000;
// maximum parts
const MAX_PARTS_PER_REQUEST = 20;

const initiateVideoUpload = asyncHandler(async (req, res) => {
    const { title, description = "", fileName, fileSize, mimeType } = req.body;

    if (!title || !fileName || !fileSize || !mimeType) {
        throw new ApiError(400, "Required video information is missing");
    }

    if (typeof title !== "string" || !title.trim()) {
        throw new ApiError(400, "Video Title Is Required");
    }

    if (typeof fileName !== "string" || !fileName.trim()) {
        throw new ApiError(400, "Invalid File Name");
    }

    if (typeof description !== "string") {
        throw new ApiError(400, "Invalid video description");
    }

    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_VIDEO_SIZE) {
        throw new ApiError(400, "Invalid video file Size");
    }

    const allowedMimeTypes = [
        "video/mp4",
        "video/webm",
        "video/quicktime",
    ]

    if (!allowedMimeTypes.includes(mimeType)) {
        throw new ApiError(400, "Unsupported Video Format");
    }

    const totalParts = Math.ceil(fileSize / PART_SIZE);

    const safeFileName = fileName.replace(/\\/g, "/").split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "_");

    if (!safeFileName) {
        throw new ApiError(400, "Invalid file name");
    }

    const s3Key = `uploads/videos/${randomUUID()}-${safeFileName}`;

    const uploadId = await createMultipartUpload({
        key: s3Key,
        contentType: mimeType
    });

    let video = null;
    try {
        video = await Video.create({
            title: title.trim(),
            description: description.trim(),
            owner: req.user._id,
            originalKey: s3Key,
            size: fileSize,
            format: mimeType.split("/")[1],
            status: "uploading",
            visibility: "private"
        });

        const upload = await Upload.create({
            user: req.user._id,
            video: video._id,
            uploadId,
            s3Key,
            fileName: safeFileName,
            fileSize,
            status: "pending",
            mimeType,
            totalParts,
            expiresAt: new Date(Date.now() + UPLOAD_EXPIRY),
        })

        return res.status(201).json(
            new ApiResponse(201, {
                videoId: video._id,
                uploadId: upload.uploadId,
                s3Key: upload.s3Key,
                totalParts: upload.totalParts,
                part_size: PART_SIZE,
                expiresAt: upload.expiresAt,
            },
                "Video upload session created Successfully"
            ),
        );
    } catch (error) {
        await abortMultipartUpload({
            key: s3Key,
            uploadId
        }).catch((cleanupError) => {
            console.error("S3 multipart cleanup failed", cleanupError);
        });

        if (video) {
            await Video.deleteOne({ _id: video._id }).catch((cleanupError) => {
                console.log("Video cleanup Failed", cleanupError);
            })
        }
        throw error;
    }
})

const generateMutipartUploadURLs = asyncHandler(async (req, res) => {
    const { uploadId } = req.params;
    const { partNumbers } = req.body;

    if (!uploadId) {
        throw new ApiError(400, "Upload Id is required");
    }

    if (!Array.isArray(partNumbers) || partNumbers.length === 0) {
        throw new ApiError(400, "Part number are required");
    }

    if (partNumbers.length > MAX_PARTS_PER_REQUEST) {
        throw new ApiError(400, `Maximum ${MAX_PARTS_PER_REQUEST} parts allowed per request`);
    }

    const uniequeParts = new Set(partNumbers);

    if (uniequeParts.size !== partNumbers.length) {
        throw new ApiError(400, "Duplicate part number are not allowed");
    }

    const upload = await Upload.findOne({
        uploadId,
        user: req.user._id
    });

    if(!upload) {
        throw new ApiError(404, "Upload Session Not Found")
    }

    if (upload.expiresAt <= new Date()) {
        throw new ApiError(410, "Upload session has expired");
    }

    if (!["pending", "uploading"].includes(upload.status)) {
        throw new ApiError(400, "This upload session is not active");
    }

    for (const partNumber of partNumbers) {
        if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > upload.totalParts) {
            throw new ApiError(400, "Invalid Part Number");
        }
    }

    const urls = await Promise.all(
        partNumbers.map(async (partNumber) => {
            const url = await getMultipartUploadUrl({
                key: upload.s3Key,
                UploadId: upload.uploadId,
                partNumber,
            });
            return {
                partNumber,
                url
            };
        })
    );

    if (upload.status === "pending") {
        upload.status = "uploading";
        await upload.save();
    }

    return res.status(200).json(
        new ApiResponse(200, {
            uploadId: upload.uploadId,
            videoId: upload.video,
            urls,
            expiresIn: 900
        }, "Multipart upload URLs generated Successfully")
    )
})

const completeVideoUpload = asyncHandler(async (req, res) => {
    const { uploadId } = req.params;
    const { parts } = req.body;

    if (!uploadId || !Array.isArray(parts) || parts.length === 0) {
        throw new ApiError(400, "Upload completion information is required");
    }

    const upload = await Upload.findOne({
        uploadId,
        user: req.user._id
    })

    if (!upload) {
        throw new ApiError(404, "Upload session not found");
    }

    const video = await Video.findOne({
        _id: upload.video,
        owner: req.user._id
    });

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    if (upload.status === "completed") {
        await videoQueue.add("process-video", {
            videoId: video._id.toString(),
            userId: req.user._id.toString(),
            s3Key: upload.s3Key
        },
            {
                jobId: `process-video-${video._id}`,
            }
        );

        return res.status(200).json(
            new ApiResponse(200, {
                videoId: video._id,
                status: "uploaded",
            },
                "Video upload was already completed"
            )
        );
    }

    if(upload.expiresAt <= new Date()) {
        throw new ApiError(410, "Upload session has expired");
    }

    if(upload.status !== "uploading") {
        throw new ApiError(400, "Upload is not ready for completion");
    }

    if(parts.length !== upload.totalParts) {
        throw new ApiError(400, "Not all video parts have been uploaded");
    }

    const partNumbers = new Set();

    for(const part of parts) {
        if(!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > upload.totalParts) {
            throw new ApiError(400, "Invalid part number");
        }

        if(typeof part.ETag !== "string" || !part.ETag.trim()) {
            throw new ApiError(400, "Invalid part ETag");
        }

        if(partNumbers.has(part.partNumber)) {
            throw new ApiError(400, "Duplicate part number");
        }

        partNumbers.add(part.partNumber);
    }

    for(let i=1; i<=upload.totalParts; i++) {
        if(!partNumbers.has(i)) {
            throw new ApiError(400, `Missing video part ${i}`);
        }
    }

    const lockedUpload = await Upload.findOneAndUpdate(
        {_id: upload._id, status: "uploading"},
        {$set: {
            status: "completing",
            uploadedParts: parts.map((part) => ({
                partNumber: part.partNumber,
                etag: part.ETag
            })),
        }},
        {
            new: true,
            runValidators: true,
        }
    );

    if(!lockedUpload) {
        throw new ApiError(400, "Upload completion is already in progress");
    }

    try {
        await completeMutipartUpload({
            key: upload.s3Key,
            UploadId: upload.uploadId,
            parts,
        });
    } catch (error) {
        let objectExists = false;

        try {
            objectExists = await checkS3ObjectExists(upload.s3Key);
        } catch (error) {
            console.log("S3 completion verification failed", error);
            throw new ApiError(503, "Unable to verify S3 upload completion");
        }

        if(!objectExists) {
            await Upload.updateOne(
                {_id: upload._id, status: "completing"},
                {$set: {status: "uploading"}}
            );
            throw error;
        }

        console.warn("S3 object exists after completion error continuing recovery");
    }

  const [uploadResult, videoResult] = await Promise.all([
    Upload.updateOne(
        { _id: upload._id, status: "completing" },
        { $set: { status: "completed" } }
    ),

    Video.updateOne(
        { _id: video._id, status: "uploading" },
        { $set: { status: "uploaded" } }
    ),
    ]);

    if (uploadResult.matchedCount !== 1 || videoResult.matchedCount !== 1) {
        throw new ApiError(500, "Failed to update upload completion status");
    }

  await videoQueue.add(
    "process-video",
    {
      videoId: video._id.toString(),
      userId: req.user._id.toString(),
      s3Key: upload.s3Key,
    },
    {
      jobId: `process-video-${video._id}`,
    }
  );

   return res.status(200).json(
    new ApiResponse(
      200,
      {
        videoId: video._id,
        status: "uploaded",
        processing: true,
      },
      "Video uploaded successfully and processing has been queued"
    )
  );
})


const abortVideoUpload = asyncHandler(async (req, res) => {
    const { uploadId } = req.params;

    if (!uploadId) {
        throw new ApiError(400, "Upload ID is required");
    }

    const upload = await Upload.findOne({
        uploadId,
        user: req.user._id,
    });

    if (!upload) {
        throw new ApiError(404, "Upload session not found");
    }

    if (upload.status === "aborted") {
        return res.status(200).json(
            new ApiResponse(200, null, "Upload already aborted")
        );
    }

    if (upload.status === "completed") {
        throw new ApiError(409, "Upload has already been completed");
    }

    if (upload.status === "completing") {
        throw new ApiError(409, "Upload completion is in progress");
    }

    if (!["pending", "uploading"].includes(upload.status)) {
        throw new ApiError(
            409,
            "Upload cannot be aborted in its current state"
        );
    }

    // Atomically acquire the abort lock.
    const abortLock = await Upload.findOneAndUpdate(
        {
            _id: upload._id,
            status: { $in: ["pending", "uploading"] },
        },
        {
            $set: { status: "aborted" },
        },
        { new: true }
    );

    if (!abortLock) {
        throw new ApiError(
            409,
            "Upload status changed. Please check upload status again"
        );
    }

    try {
        await abortMultipartUpload({
            key: upload.s3Key,
            uploadId: upload.uploadId,
        });
    } catch (error) {
        // Keep the record for recovery if S3 abort fails.
        await Upload.findByIdAndUpdate(upload._id, {
            $set: { status: "failed" },
        });

        throw new ApiError(500, "Failed to abort multipart upload");
    }

    const deletedVideo = await Video.findOneAndDelete({
    _id: upload.video,
    owner: req.user._id,
    status: "uploading",
});

if (deletedVideo) {
    await invalidateVideoCache(deletedVideo);

    if (deletedVideo.thumbnail) {
        await deleteFromS3(deletedVideo.thumbnail);
    }
}

    await Upload.deleteOne({ _id: upload._id });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                uploadId: upload.uploadId,
                videoId: upload.video,
                status: "aborted",
            },
            "Video upload aborted successfully"
        )
    );
});


const getVideoUploadStatus = asyncHandler(async (req, res) => {
    const { uploadId } = req.params;

    if (!uploadId) {
        throw new ApiError(400, "Upload ID is required");
    }

    const upload = await Upload.findOne({
        uploadId,
        user: req.user._id,
  }).select("-s3Key");

    if (!upload) {
        throw new ApiError(404, "Upload session not found");
    }
    
    return res.status(200).json(
    new ApiResponse(
        200,
        {
            uploadId: upload.uploadId,
            videoId: upload.video,
            fileName: upload.fileName,
            fileSize: upload.fileSize,
            totalParts: upload.totalParts,
            status: upload.status,
            expiresAt: upload.expiresAt,
            createdAt: upload.createdAt,
            updatedAt: upload.updatedAt,
        },
        "Upload status fetched successfully"
    )
);
});

const generateThumbnailURL = asyncHandler(async(req, res) => {
    const {videoId} = req.params;
    const {fileName, mimeType, fileSize} = req.body;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid Video Id");
    }

    if(!fileName || !mimeType || !fileSize) {
        throw new ApiError(400, "Thumbnail information is required");
    }

    if(typeof fileName !== "string" || !fileName.trim()) {
        throw new ApiError(400, "Invalid thumbnail file name");
    }

    const allowedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
    ]

    if(!allowedMimeTypes.includes(mimeType)) {
        throw new ApiError(400, "Unsupported thumbnail format");
    } 

    const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024;

    if(!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_THUMBNAIL_SIZE) {
        throw new ApiError(400, "Invalid Thumbnail Filesize");
    }

    const video = await Video.findOne({
        _id: videoId,
        owner: req.user._id
    });

    if(!video) {
        throw new ApiError(404, "Video Not Found");
    }

    const {url, key} = await getThumbnailuploadUrl({
        fileName: fileName.trim(),
        contentType: mimeType,
    })

    return res.status(200).json(
        new ApiResponse(200, {
            videoId: video._id,
            uploadUrl: url,
            thumbnailKey: key,
            expiresIn: 900
        }, "Thumbnail upload URL generated successfully")
    )
});

const uploadThumbnail = asyncHandler(async(req, res) => {
    const {videoId} = req.params;
    const {thumbnailKey} = req.body;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    if(typeof thumbnailKey !== "string" || !thumbnailKey.startsWith("uploads/thumbnails/")) {
        throw new ApiError(400, "Invalid Thumbnail Key");
    }

    const video = await Video.findOne({
        _id: videoId,
        owner: req.user._id
    });

    if(!video) {
        throw new ApiError(404, "Video Not Found");
    }

    const exists = await checkS3ObjectExists(thumbnailKey);

    if(!exists) {
        throw new ApiError(404, "Thumbnail not found in S3");
    }

    video.thumbnail = thumbnailKey,
    await video.save();

    await invalidateVideoCache();

    return res.status(200).json(
        new ApiResponse(200, {
            videoId: video._id,
            thumbnail: video.thumbnail,
        }, "Thumbnail Updated Successfully")
    )
});

const getThumbnail = asyncHandler(async(req, res) => {
    const {videoId} = req.params;

    if(!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid VideoId");
    }

    const video = await Video.findById(videoId).select("thumbnail owner");

    if(!video) {
        throw new ApiError(400, "Video Not Found");
    }

    const thumbnailUrl = await getFromS3(video.thumbnail);

    return res.status(200).
    json(
        new ApiResponse(200, {videoId: video._id, thumbnailUrl}, "Thumbnail fetched Successfully")
    )
});

export {
    getVideoUploadStatus,
    completeMutipartUpload,
    abortVideoUpload,
    completeVideoUpload,
    initiateVideoUpload,
    generateMutipartUploadURLs,
    generateThumbnailURL,
    uploadThumbnail,
    getThumbnail,
}