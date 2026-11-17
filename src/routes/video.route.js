import { Router } from "express";
import { deleteVideo, getAllVideo, getMyVideoById, getMyVideos, getVideoById, getVideoPlaybackURL, publishVideo, unPublishedVideo, updateVideoMetaData } from "../controller/video.controller.js";
import { verifyUser } from "../middleware/verifyUser.middleware.js";

const router = Router();

router.get("/", getAllVideo);
router.get("/mine", verifyUser, getMyVideos);
router.get("/mine/:videoId", verifyUser, getMyVideoById);
router.get("/:videoId", getVideoById);
router.patch("/:videoId/metadata", verifyUser, updateVideoMetaData);
router.patch("/:videoId/publish", verifyUser, publishVideo);
router.patch("/:videoId/unpublish", verifyUser, unPublishedVideo);
router.delete("/:videoId", verifyUser, deleteVideo);
router.get("/:videoId/playback", getVideoPlaybackURL);
export default router;