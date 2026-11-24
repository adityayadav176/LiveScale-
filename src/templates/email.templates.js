
export const emailTemplates = {
    welcome: ({ fullName }) => ({
        subject: "Welcome to LiveScale! 🎬",
        html: `
            <div style="max-width:600px;margin:30px auto;background:#11111b;color:#fff;font-family:Arial,sans-serif;border-radius:16px;overflow:hidden;border:1px solid #30264b;">

                <div style="background:#21183a;padding:35px 20px;text-align:center;">
                    <h1 style="margin:0;color:#fff;font-size:30px;letter-spacing:1px;">
                        ▶ LiveScale
                    </h1>
                    <p style="color:#c4b5fd;font-size:12px;letter-spacing:3px;">
                        YOUR WORLD. YOUR VIDEOS.
                    </p>
                </div>

                <div style="padding:35px 30px;">
                    <p style="color:#a78bfa;font-size:12px;font-weight:bold;letter-spacing:2px;">
                        WELCOME ABOARD
                    </p>

                    <h1 style="font-size:29px;line-height:1.4;color:#fff;">
                        Hello ${fullName}! 👋
                    </h1>

                    <p style="color:#c4c4d0;font-size:15px;line-height:1.8;">
                        Your LiveScale account has been successfully created.
                        We're excited to have you join our growing community!
                    </p>

                    <div style="background:#21183a;border:1px solid #493477;border-radius:12px;padding:22px;margin:25px 0;">
                        <h2 style="color:#c4b5fd;font-size:19px;margin-top:0;">
                            Your journey starts here.
                        </h2>

                        <p style="color:#ddd6fe;line-height:1.9;font-size:14px;margin-bottom:0;">
                            ▶ Discover amazing videos<br>
                            ▶ Upload and share your creativity<br>
                            ▶ Build your own audience<br>
                            ▶ Enjoy content from the community
                        </p>
                    </div>

                    <p style="color:#c4c4d0;font-size:14px;line-height:1.8;">
                        Thank you for becoming part of LiveScale.
                        There's so much waiting for you to explore!
                    </p>

                    <p style="color:#fff;line-height:1.8;margin-top:28px;">
                        Happy watching,<br>
                        <strong style="color:#a78bfa;">Team LiveScale</strong>
                    </p>
                </div>

                <div style="background:#0b0b12;text-align:center;padding:22px;">
                    <p style="color:#a78bfa;font-size:14px;font-weight:bold;">
                        LiveScale
                    </p>
                    <p style="color:#71717a;font-size:11px;line-height:1.7;">
                        Made for creators. Built for viewers.<br>
                        © 2026 LiveScale. All rights reserved.
                    </p>
                </div>
            </div>
        `
    }),

    emailVerification: ({ otp }) => ({
        subject: "Verify Your LiveScale Email 🔐",
        html: `
            <div style="max-width:600px;margin:30px auto;background:#11111b;color:#fff;font-family:Arial,sans-serif;border-radius:16px;overflow:hidden;border:1px solid #30264b;">

                <div style="background:#21183a;padding:30px;text-align:center;">
                    <h1 style="margin:0;color:#fff;font-size:28px;">▶ LiveScale</h1>
                    <p style="color:#c4b5fd;font-size:11px;letter-spacing:3px;">ACCOUNT SECURITY</p>
                </div>

                <div style="padding:35px 30px;">
                    <h1 style="color:#fff;font-size:27px;">Verify your email address.</h1>

                    <p style="color:#c4c4d0;font-size:15px;line-height:1.8;">
                        Use the verification code below to confirm your email and activate your LiveScale experience.
                    </p>

                    <div style="background:#21183a;border:1px solid #6d28d9;border-radius:12px;padding:28px 15px;text-align:center;margin:30px 0;">
                        <p style="color:#a78bfa;font-size:11px;letter-spacing:3px;">YOUR VERIFICATION CODE</p>
                        <h1 style="font-size:36px;letter-spacing:10px;color:#fff;margin:15px 0;">
                            ${otp}
                        </h1>
                    </div>

                    <p style="color:#c4c4d0;font-size:13px;line-height:1.8;">
                        This code expires in <strong style="color:#fff;">5 minutes</strong>.
                        Never share this code with anyone.
                    </p>

                    <p style="color:#71717a;font-size:12px;line-height:1.7;">
                        If you didn't request this verification, you can ignore this email.
                    </p>
                </div>

                <div style="background:#0b0b12;text-align:center;padding:22px;">
                    <p style="color:#a78bfa;font-weight:bold;">Team LiveScale</p>
                    <p style="color:#71717a;font-size:11px;">© 2026 LiveScale. All rights reserved.</p>
                </div>
            </div>
        `
    }),

    welcomeVerified: ({ fullName }) => ({
        subject: "Your LiveScale Account Is Verified! 🎉",
        html: `
            <div style="max-width:600px;margin:30px auto;background:#11111b;color:#fff;font-family:Arial,sans-serif;border-radius:16px;overflow:hidden;border:1px solid #30264b;">

                <div style="background:#21183a;padding:30px;text-align:center;">
                    <h1 style="margin:0;color:#fff;font-size:28px;">▶ LiveScale</h1>
                    <p style="color:#c4b5fd;font-size:11px;letter-spacing:3px;">VERIFICATION COMPLETE</p>
                </div>

                <div style="padding:35px 30px;text-align:center;">
                    <div style="font-size:42px;color:#a78bfa;">✓</div>

                    <h1 style="color:#fff;font-size:28px;line-height:1.4;">
                        You're verified, ${fullName}!
                    </h1>

                    <p style="color:#c4c4d0;font-size:15px;line-height:1.8;">
                        Your email has been successfully verified.
                        Your LiveScale account is now ready to use.
                    </p>

                    <div style="background:#21183a;border:1px solid #493477;border-radius:12px;padding:22px;margin:28px 0;">
                        <h2 style="color:#c4b5fd;font-size:19px;">Your next chapter starts now.</h2>
                        <p style="color:#ddd6fe;font-size:14px;line-height:1.8;">
                            Discover videos, share your creativity, and become part of the LiveScale community.
                        </p>
                    </div>

                    <p style="color:#c4c4d0;font-size:14px;line-height:1.8;">
                        Welcome to the community!<br>
                        <strong style="color:#a78bfa;">Team LiveScale</strong>
                    </p>
                </div>

                <div style="background:#0b0b12;text-align:center;padding:22px;">
                    <p style="color:#71717a;font-size:11px;">© 2026 LiveScale. All rights reserved.</p>
                </div>
            </div>
        `
    }),

    passwordReset: ({ otp }) => ({
        subject: "LiveScale Password Reset 🔒",
        html: `
            <div style="max-width:600px;margin:30px auto;background:#11111b;color:#fff;font-family:Arial,sans-serif;border-radius:16px;overflow:hidden;border:1px solid #30264b;">

                <div style="background:#21183a;padding:30px;text-align:center;">
                    <h1 style="margin:0;color:#fff;font-size:28px;">▶ LiveScale</h1>
                    <p style="color:#c4b5fd;font-size:11px;letter-spacing:3px;">SECURITY NOTICE</p>
                </div>

                <div style="padding:35px 30px;">
                    <h1 style="color:#fff;font-size:27px;line-height:1.4;">
                        Let's get you back into LiveScale.
                    </h1>

                    <p style="color:#c4c4d0;font-size:15px;line-height:1.8;">
                        We received a request to reset your password.
                        Use the secure code below to continue.
                    </p>

                    <div style="background:#21183a;border:1px solid #6d28d9;border-radius:12px;padding:28px 15px;text-align:center;margin:30px 0;">
                        <p style="color:#a78bfa;font-size:11px;letter-spacing:3px;">PASSWORD RESET CODE</p>
                        <h1 style="font-size:36px;letter-spacing:10px;color:#fff;margin:15px 0;">
                            ${otp}
                        </h1>
                    </div>

                    <p style="color:#c4c4d0;font-size:13px;line-height:1.8;">
                        This code expires in <strong style="color:#fff;">5 minutes</strong>.
                        Never share it with anyone.
                    </p>

                    <div style="background:#2a171c;border:1px solid #71303a;border-radius:10px;padding:16px;margin-top:25px;">
                        <p style="color:#fca5a5;font-size:13px;line-height:1.7;margin:0;">
                            Didn't request a password reset? Ignore this email.
                            Your existing password will remain unchanged.
                        </p>
                    </div>
                </div>

                <div style="background:#0b0b12;text-align:center;padding:22px;">
                    <p style="color:#a78bfa;font-weight:bold;">LiveScale Security Team</p>
                    <p style="color:#71717a;font-size:11px;">© 2026 LiveScale. All rights reserved.</p>
                </div>
            </div>
        `
    })
};
