import { Router } from "express";
import {
    ToggleVideoLike,
    toggleCommentLike,
    getLikedVideo
} from "../controller/like.controller.js";

import { verifyUser } from "../middleware/verifyUser.middleware.js";

const router = Router();

router.post("/video/:videoId", verifyUser, ToggleVideoLike);
router.post("/comment/:commentId", verifyUser, toggleCommentLike);
router.get("/videos", verifyUser, getLikedVideo);

export default router;
