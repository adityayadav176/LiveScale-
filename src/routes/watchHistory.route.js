import express from "express"
import { verifyUser } from './../middleware/verifyUser.middleware.js';
import { addToWatchHistory, getWatchHistory, removeFromWatchHistory } from "../controller/watchHistory.controller.js";

const router = express.Router();

router.get("/", verifyUser, getWatchHistory);
router.post("/:videoId", verifyUser, addToWatchHistory);
router.delete("/:videoId", verifyUser, removeFromWatchHistory);

export default router;