
import redis from "../db/redis.js";
import crypto from "crypto";

const OTP_EXPIRY = 300;
const MAX_ATTEMPTS = 5;

const getEmail = (email) => email.trim().toLowerCase();

export function otpKey(email) {
    const emailHash = crypto
        .createHash("sha256")
        .update(getEmail(email))
        .digest("hex");

    return `otp:${emailHash}`;
}

const hashOtp = (otp) => {
    return crypto
        .createHmac("sha256", process.env.OTP_SECRET)
        .update(otp)
        .digest("hex");
};

export const generateOtp = () => {
    return crypto.randomInt(100000, 1000000).toString();
};

export const storeOtp = async (email, otp) => {
    const key = otpKey(email);

    await redis.multi()
        .hset(key, "hash", hashOtp(otp), "attempts", 0)
        .expire(key, OTP_EXPIRY)
        .exec();
};

export const verifyOtp = async (email, otp) => {
    if (!/^\d{6}$/.test(otp)) {
        return "INVALID";
    }

    const script = `
        local stored = redis.call("HGET", KEYS[1], "hash")

        if not stored then
            return -1
        end

        local attempts = redis.call(
            "HINCRBY", KEYS[1], "attempts", 1
        )

        if stored == ARGV[1] then
            redis.call("DEL", KEYS[1])
            return 1
        end

        if attempts >= tonumber(ARGV[2]) then
            redis.call("DEL", KEYS[1])
            return -2
        end

        return 0
    `;

    const result = await redis.eval(
        script,
        1,
        otpKey(email),
        hashOtp(otp),
        MAX_ATTEMPTS
    );

    if (result === 1) return "VERIFIED";
    if (result === -1) return "EXPIRED";
    if (result === -2) return "MAX_ATTEMPTS";

    return "INVALID";
};

export const deleteOtp = async (email) => {
    await redis.del(otpKey(email));
};
