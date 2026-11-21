import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3 from "../config/s3.js";
import crypto from "crypto"
import {createReadStream, createWriteStream} from "fs"
import {pipeline} from "stream/promises"
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, UploadPartCommand } from "@aws-sdk/client-s3";

const bucket = process.env.AWS_BUCKET_NAME;

export const uploadToS3 = async({fileName, contentType}) => {
    if(!fileName || !contentType) {
        throw new Error("S3 Object file Information Is Required");
    }

    const key = `uploads/user-uploads/${crypto.randomUUID()}-${fileName}`;

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType
    })

    const url = await getSignedUrl(s3, command, {expiresIn: 60}) // 1 minute

    return {url, key};
}

export const getThumbnailuploadUrl = async({fileName, contentType}) => {
    if(!fileName || !contentType) {
        throw new Error("Thumbnail information is required");
    }

    const key = `uploads/thumbnails/${crypto.randomUUID()}-${fileName}`;

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType
    });

    const url = await getSignedUrl(s3, command, {expiresIn: 900});
    return {url, key};
}

export const createMultipartUpload = async ({key, contentType}) => {
    if(!key || !contentType) {
        throw new Error("S3 key and content type are required");
    }

    const command = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType
    });

    const response = await s3.send(command);

    if(!response.UploadId) {
        throw new Error("Failed to create S3 multipart upload!")
    }

    return response.UploadId;
}

export const getMultipartUploadUrl = async({key, UploadId, partNumber}) => {
    if(!key || !UploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 1000) {
        throw new Error("Invalid mutipart upload information");
    }

    const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: UploadId,
        PartNumber: partNumber
    })

    return await getSignedUrl(s3, command, {expiresIn: 900});
};

export const completeMutipartUpload = async({key, UploadId, parts}) => {
    if(!key || !UploadId || !Array.isArray(parts) || parts.length === 0) {
        throw new Error("Multipart completion information is required");
    }

    const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    const command = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: UploadId,
        MultipartUpload: {
            parts: sortedParts
        },
    });

    return await s3.send(command);
}

export const abortMultipartUpload = async({key, uploadId}) => {
    if(!key || !uploadId) {
        throw new Error("S3 key and upload Id are required");
    }

    const command = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
    });

    return await s3.send(command);
}

export const getFromS3 = async(key) => {
    if(!key) {
        throw new Error("S3 Key Is Required");
    }

    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
    })

    return await getSignedUrl(s3, command, {expiresIn: 60});
}

export const deleteFromS3 = async(key) => {
    if(!key) {
        throw new Error("S3 key Is Required");
    }

    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
    });

    await s3.send(command);
    return "File Deleted Successfully";
}

export const checkS3ObjectExists = async(key) => {
    try {
        if(!key) {
            throw new Error("S3 key Is Required");
        }
    
        const command = new HeadObjectCommand({
            Bucket: bucket,
            Key: key
        });
    
        await s3.send(command);
    
        return true;
    } catch (error) {
        if(error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
}

export const getS3ObjectMetaData = async(key) => {
    if(!key) {
        throw new Error("S3 Key Is Required");
    }

    const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key
    });

    const response = await s3.send(command);

    return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        etag: response.ETag
    }
}

export const downloadFromS3 = async({key, destination}) => {
    if(!key || !destination) {
        throw new Error("S2 key and destination are required");
    }

    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
    })
    
    const response = await s3.send(command);

    if(!response.Body) {
        throw new Error("S2 object body is empty");
    }

    await pipeline(
        response.Body,
        createWriteStream(destination)
    );

    return {
        destination,
        ContentType: response.ContentType,
        contentLength: response.ContentLength 
    }
}

export const uploadFileToS3 = async({filePath, key, contentType}) => {
    if(!filePath || !key || !contentType) {
        throw new Error("File Path S3 key content type are required");
    }

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType
    })

     await s3.send(command);

     return {
        key,
        message: "File uploaded successfully"
    };
}

export const uploadHLSDirectoryToS3 = async ({ outputDir, videoId }) => {
    if (!outputDir || !videoId) {
        throw new Error("Output directory and video ID are required");
    }

    const uploadedFiles = [];

    const uploadDirectory = async (directory, prefix = "") => {
        const entries = await fs.readdir(directory, {
            withFileTypes: true
        });

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            const relativePath = path.posix.join(prefix, entry.name);

            if (entry.isDirectory()) {
                await uploadDirectory(fullPath, relativePath);
                continue;
            }

            const extension = path.extname(entry.name).toLowerCase();

            const contentTypes = {
                ".m3u8": "application/vnd.apple.mpegurl",
                ".ts": "video/mp2t",
                ".jpg": "image/jpeg",
                ".vtt": "text/vtt"
            };

            const contentType = contentTypes[extension];

            if (!contentType) continue;

            const key = `videos/${videoId}/hls/${relativePath}`;

            await uploadFileToS3({
                filePath: fullPath,
                key,
                contentType
            });

            uploadedFiles.push(key);
            console.log("Uploaded:", key);
        }
    };

    await uploadDirectory(outputDir);

    return {
        uploadedCount: uploadedFiles.length,
        uploadedFiles
    };
};