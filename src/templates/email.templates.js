
export const emailTemplates = {
    welcome: ({ fullName }) => ({
        subject: "Welcome to LiveScale! 🎬",
        html: `
            <div style="
                max-width: 600px;
                margin: 0 auto;
                padding: 30px;
                font-family: Arial, sans-serif;
                background-color: #f7f8fc;
                color: #1f2937;
                border-radius: 12px;
            ">
                <h1 style="color: #6d28d9; text-align: center;">
                    Welcome to LiveScale!
                </h1>

                <h2>Hello ${fullName},</h2>

                <p>We're excited to have you join LiveScale!</p>
                <p>Your account has been successfully created.</p>

                <p>
                    Discover, upload, and enjoy videos with
                    the LiveScale community.
                </p>

                <p>
                    Thank you for being part of our journey.
                </p>

                <p>
                    Best regards,<br />
                    <strong>Team LiveScale</strong>
                </p>

                <hr />

                <p style="text-align: center; font-size: 12px; color: #6b7280;">
                    © 2026 LiveScale. All rights reserved.
                </p>
            </div>
        `
    }),

    emailVerification: ({ otp }) => ({
        subject: "LiveScale Email Verification",
        html: `
            <h2>Verify Your Email</h2>
            <p>Your email verification OTP is:</p>
            <h1>${otp}</h1>
            <p>This OTP expires in 5 minutes.</p>
        `
    }),

    welcomeVerified: ({ fullName }) => ({
        subject: "Your LiveScale Account Is Verified!",
        html: `
            <h2>Welcome ${fullName}!</h2>
            <p>Your email has been successfully verified.</p>
            <p>Your LiveScale account is ready to use.</p>
        `
    }),

    passwordReset: ({ otp }) => ({
        subject: "LiveScale Password Reset",
        html: `
            <h2>Password Reset Request</h2>
            <p>Your password reset OTP is:</p>
            <h1>${otp}</h1>
            <p>This OTP expires in 5 minutes.</p>
            <p>If you did not request this, ignore this email.</p>
        `
    })
};
