import express from "express"
import { verifyUser } from './../middleware/verifyUser.middleware.js';
import { channelSubscribers, getChannelStats, getSubscribedChannels, toggleSubscribe } from "../controller/subscription.controller.js";

const router = express.Router();

router.post("/toggleSubscribed", verifyUser, toggleSubscribe);
router.get("/Subcribers", verifyUser, channelSubscribers);
router.get("/SubscibedChannel", verifyUser, getSubscribedChannels);
router.get("/stats", verifyUser, getChannelStats);

export default router;