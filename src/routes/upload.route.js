import { Router } from "express";
import { verifyUser } from '../middleware/verifyUser.middleware.js';
import { abortVideoUpload, completeVideoUpload, generateMutipartUploadURLs, getVideoUploadStatus, initiateVideoUpload } from "../controller/upload.controller";

const router = Router();

router.use(verifyUser());
router.post("/initiate", initiateVideoUpload);
router.post("/:uploadId/parts", generateMutipartUploadURLs);
router.post("/:uploadId/complete", completeVideoUpload);
router.post("/:uploadId/abort", abortVideoUpload);
router.get("/:uploadId/status", getVideoUploadStatus);

export default router;