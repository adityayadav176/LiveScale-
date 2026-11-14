import { checkUsernameExists, deleteAvatar, deleteCoverImage, fetchUser, generateAvatarUploadUrl, generateCoverImageUploadUrl, getAvatar, getCoverImage, loginUser, logoutUser, refreshAccessToken, sendUpdatePasswordOTP, sendVerificationOTP, SignupUser, updateAvatar, updateCoverImage, updatePassword, updateProfile, verifyEmail } from "../controller/auth.controller.js";
import express from "express";
import { verifyUser } from './../middleware/verifyUser.middleware.js';

const router = express.Router();

router.post("/signup", SignupUser);
router.post("/login", loginUser);
router.post("/update-avatar-url", verifyUser, generateAvatarUploadUrl);
router.post("/update-avatar", verifyUser, updateAvatar);
router.get("/avatar", verifyUser, getAvatar);
router.post("/update-coverimage-url", verifyUser, generateCoverImageUploadUrl);
router.post("/update-coverimage", verifyUser, updateCoverImage);
router.get("/coverimage", verifyUser, getCoverImage);
router.get("/me", verifyUser, fetchUser);
router.post("/send-password-reset-otp", sendUpdatePasswordOTP);
router.post("/update-password", updatePassword);
router.post("/send-email-verification-otp", verifyUser, sendVerificationOTP);
router.post("/verify-email", verifyUser, verifyEmail);
router.post("/update-profile", verifyUser, updateProfile);
router.delete("/delete-avatar", verifyUser, deleteAvatar);
router.delete("/delete-coverImage", verifyUser, deleteCoverImage);
router.get("/check-username", checkUsernameExists);
router.post("/logout", verifyUser, logoutUser);
router.post("/refresh-access-token", refreshAccessToken);

export default router;