
import { Router } from "express";
import { verifyUser } from "../middleware/verifyUser.middleware.js";

import {
  abortVideoUpload,
  completeVideoUpload,
  generateMutipartUploadURLs,
  generateThumbnailURL,
  getVideoUploadStatus,
  initiateVideoUpload,
  uploadThumbnail,
} from "../controller/upload.controller.js";

const router = Router();

router.use(verifyUser);

router.post("/initiate", initiateVideoUpload);
router.post("/:uploadId/parts", generateMutipartUploadURLs);
router.post("/:uploadId/complete", completeVideoUpload);
router.post("/:uploadId/abort", abortVideoUpload);
router.get("/:uploadId/status", getVideoUploadStatus);

// Thumbnail routes
router.post("/:videoId/thumbnail/url", generateThumbnailURL);
router.post("/:videoId/thumbnail/upload", uploadThumbnail);
export default router;
