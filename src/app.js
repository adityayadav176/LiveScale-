import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors"
import { errorMiddleware } from "./middleware/error.middleware.js";
import morgan from "morgan";
import helmet from "helmet";
import authRouter from "./routes/auth.route.js"
import likeRouter from "./routes/like.route.js"
import commentRouter from "./routes/comment.route.js"
import playlistRouter from "./routes/playlist.route.js"

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["POST", "GET", "PUT", "PATCH"]
}));

app.use(morgan("dev"));
app.use(helmet());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({extended: true, limit: "16kb"}));
app.use(express.static("public/temp"));

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/like", likeRouter);
app.use("/api/v1/comment", commentRouter);
app.use("/api/v1/playlist", playlistRouter);

app.use(errorMiddleware);

export {app};