import { transporter } from "./nodemailer"

const emailService = async(to, subject, html) => {
    try {
        await transporter.sendMail({
            from: process.env.SMTP_EMAIL,
            to: to,
            html: html,
            subject: subject
        });
    } catch (error) {
        console.log("Email Sending Failed", error);
        throw error;
    }
}

export {
    emailService
};