const nodemailer = require('nodemailer');

/**
 * Service to handle sending emails with attachments
 */
const sendEmailWithAttachment = async (options) => {
    const { to, subject, body, filename, content, contentType = 'application/pdf' } = options;

    // Validate Environment in Production
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.error('CRITICAL: SMTP configuration missing in production. Email sending aborted.');
            throw new Error('SMTP configuration missing in production.');
        }
    }

    // Configure transport (using a mock/test account or environment variables)
    // For production, you would use actual SMTP settings
    let transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const mailOptions = {
        from: `"Prime ERP System" <${process.env.SMTP_FROM || 'noreply@primeerp.com'}>`,
        to: to,
        subject: subject,
        text: body,
        attachments: [
            {
                filename: filename,
                content: content,
                contentType: contentType
            }
        ]
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('Email sent: %s', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Email sending failed:', error);
        throw error;
    }
};

module.exports = {
    sendEmailWithAttachment
};
