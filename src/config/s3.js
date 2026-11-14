import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
})

export const checkS3Connection = async() => {
    try {
        await s3.send(
            new HeadBucketCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
            })
        )
        console.log("AWS S3 Connected Successfully!");
    } catch (error) {
        console.log("AWS S3 Connection Failed", error.message);
    }
}

export default s3;