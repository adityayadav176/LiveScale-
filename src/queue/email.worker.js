
import redis from "../db/redis.js";
import { Worker } from "bullmq";
import { emailService } from "../service/email.service.js";
import { emailTemplates } from "../templates/email.templates.js";

const emailWorker = new Worker(
    "email-queue",

    async (job) => {
        const { to, type, data } = job.data;

        const template = emailTemplates[type];

        if (!template) {
            throw new Error(`Unknown Email Type: ${type}`);
        }

        const { subject, html } = template(data);

        await emailService(to, subject, html);

        return { success: true };
    },

    {
        connection: redis,
        concurrency: 5
    }
);

emailWorker.on("completed", (job) => {
    console.log(`Email Job ${job.id} Completed`);
});

emailWorker.on("failed", (job, error) => {
    console.error(`Email Job ${job?.id} Failed:`, error.message);
});

export default emailWorker;
