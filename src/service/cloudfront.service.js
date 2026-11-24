import {getSignedUrl} from "@aws-sdk/cloudfront-signer"

const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN?.replace(/\/+$/, "");
const KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID;
const PRIVATE_KEY = process.env.CLOUDFRONT_PRIVATE_KEY?.replace(/\\n/g, "\n");

export const getCloudFrontURL = (key) => {
    if(!key || !CLOUDFRONT_DOMAIN) {
        throw new Error("CloudFront domain or file key is missing");
    }

    return `${CLOUDFRONT_DOMAIN}/${key.replace(/^\/+/, "")}`;
}

export const getSignedCloudFrontURL = (key, expiresIn = 300) => {
    if (!KEY_PAIR_ID || !PRIVATE_KEY) {
        throw new Error("CloudFront signing configuration is missing");
    }

    if(!Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new Error("Invalid Cloudfront URL expiration");
    }

    const url = getCloudFrontURL(key);

    return getSignedUrl({
        url,
        keyPairId: KEY_PAIR_ID,
        privateKey: PRIVATE_KEY,
        dateLessThan: new Date(Date.now() + expiresIn * 1000).toISOString(),
    })
}