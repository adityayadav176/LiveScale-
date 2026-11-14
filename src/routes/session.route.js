import express from "express";

import { verifyUser } from "../middleware/verifyUser.middleware.js";

import {
    getAllSessions,
    logoutAllDevices,
    logoutSpecificDevice
} from "../controller/session.controller.js";

const router = express.Router();

router.get("/all", verifyUser, getAllSessions);

router.delete("/all", verifyUser, logoutAllDevices);

router.delete("/:sessionId", verifyUser, logoutSpecificDevice);

export default router;