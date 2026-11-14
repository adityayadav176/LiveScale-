
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

redis.on("connect", () => {
    console.log("Redis Connecting...");
});

redis.on("ready", () => {
    console.log("Redis Connected Successfully!");
});

redis.on("error", (err) => {
    console.error("Redis Connection Failed:", err.message);
});

redis.on("close", () => {
    console.log("Redis Connection Closed");
});

export default redis;
