import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
})

const verifySmtp = async() => {
    try {
        await transporter.verify();
        console.log("SMTP Server Running...");
    } catch (error) {
        console.log("SMTP Server Error", error);
        process.exit(1);
    }
}

export {
    transporter,
    verifySmtp
}