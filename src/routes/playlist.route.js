import { Router } from "express";

import {
    createPlaylist,
    updatePlaylist,
    addVideoInPlaylist,
    deletePlaylist,
    removeVideoFromPlaylist,
    getPlaylistById,
    getMyPlaylist
} from "../controller/playlist.controller.js";

import { verifyUser } from '../middleware/verifyUser.middleware.js';

const router = Router();


router.use(verifyUser);
router.post("/create", createPlaylist);
router.get("/my-playlists", getMyPlaylist);
router.get("/:playlistId", getPlaylistById);
router.patch("/:playlistId", updatePlaylist);
router.delete("/:playlistId", deletePlaylist);
router.patch("/:playlistId/add/:videoId", addVideoInPlaylist);
router.patch("/:playlistId/remove/:videoId", removeVideoFromPlaylist);

export default router;