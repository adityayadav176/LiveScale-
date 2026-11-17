import { randomUUID } from "crypto";
import { Upload } from "../model/upload.model.js"
import { Video } from "../model/Video.model.js"
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js"
import { abortMultipartUpload, checkS3ObjectExists, completeMutiparUpload, createMultipartUpload, getMultipartUploadUrl } from "../service/s3.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import videoQueue from './../queue/video.queue';
import { set } from "mongoose";

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

    const s3Key = `uploads/videos:${randomUUID()}-${safeFileName}`;

    const uploadId = await createMultipartUpload({
        key: s3Key,
        contentType: contentType
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

    if (!upload) {
        throw new ApiError(404, "Upload session not found");
    }

    if (!["pending", "uploading"].includes(upload.status)) {
        throw new ApiError(400, "This upload session is not active");
    }

    for (const partNumber of partNumbers) {
        if (Number.isInteger(partNumber) || partNumber < 1 || partNumber > upload.totalParts) {
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
        await completeMutiparUpload({
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

    await Promise.all([
    Upload.updateOne(
      { _id: upload._id, status: "completing" },
      { $set: { status: "completed" } }
    ),

    Video.updateOne(
      { _id: video._id, status: "uploading" },
      { $set: { status: "uploaded" } }
    ),
  ]);

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

})

const getVideoUploadStatus = asyncHandler(async (req, res) => {

})