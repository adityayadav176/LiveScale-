
import { Router } from "express";
import {
    addComment,
    updateComment,
    deleteComment,
    getVideoComment
} from "../controller/comment.controller.js";

import { verifyUser } from "../middleware/verifyUser.middleware.js";

const router = Router();

router.post("/:videoId", verifyUser, addComment);
router.get("/:videoId", getVideoComment);
router.patch("/:commentId", verifyUser, updateComment);
router.delete("/:commentId", verifyUser, deleteComment);

export default router;
