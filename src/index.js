import { app } from "./app.js";
import { configDotenv } from "dotenv";
import { APP_NAME } from "./content.js";
import { connectToMongo } from "./db/db.js";
import redis from "./db/redis.js";
import { verifySmtp } from "./service/nodemailer.js";
import { checkS3Connection } from "./config/s3.js";
import "./queue/video.worker.js";
import "./queue/email.worker.js";
import "./queue/notification.worker.js";
configDotenv();

const PORT = process.env.PORT;

const startServer = async() => {
    try {
        await redis.ping();
        await checkS3Connection();
        await connectToMongo();
        await verifySmtp();
        
        app.listen(PORT, () => {
            console.log(`${APP_NAME} Server Running On Port: ${PORT}`);
        })
    } catch (error) {
        console.log("Server Started Failed", error);
        process.exit(1);
    }
}

startServer();

