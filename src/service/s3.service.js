import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3 from "../config/s3.js";
import crypto from "crypto"
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

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
