import redis from "../db/redis.js";

export const getCache = async (key) => {
    try {
        const cachedData = await redis.get(key);

        if(cachedData === null) {
            return null;
        }

        try {
            return JSON.parse(cachedData);
        } catch (error) {
            await redis.del(key);
            return null;
        }
    } catch (error) {
        console.log("Redis GET failed: ", error.message);
        return null;
    }
}

export const setCache = async(key, data, ttl = 300) => {
    try {
        if(!key || data === undefined) {
            return false;
        }

        await redis.set(key, JSON.stringify(data), "EX", ttl);
        return true;
    } catch (error) {
        console.log("Redis SET failed:", error.message);
        return false;
    }
}

export const deleteCache = async(...keys) => {
    try {
        const validKeys = keys.flat().filter(Boolean);

        if(validKeys.length === 0) {
            return false;
        }

        await redis.del(...validKeys);
        return true;
    } catch (error) {
        console.log("Redis DELETE failed:", error.message);
        return false;
    }
}

export const incrementCacheVersion = async(key) => {
    try {
        return await redis.incr(key);
    } catch (error) {
        console.log("Redis INCR failed", error);
        return null;
    }
}

export const getCacheVersion = async(key) => {
    try {
        const version = await redis.get(key);
        return version ?? "0";
    } catch (error) {
        console.error("Redis VERSION GET failed", error.message);
        return "0";
    }
}

export const incrementVideoViews = async (videoId) => {
    try {
        return await redis.incr(`video:${videoId}:views`);
    } catch (error) {
        console.error("Redis view increment failed:", error.message);
        return null;
    }
};

export const invalidateVideoCache = async(video) => {
    await Promise.all([
        deleteCache(`video:public:${video._id}`),
        incrementCacheVersion("videos:public:version"),
        incrementCacheVersion(`videos:user:${video.owner}:version`),
        incrementCacheVersion(`video:user:${video.owner}:${video._id}:version`)
    ]);
}