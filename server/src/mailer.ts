import nodemailer from "nodemailer";
import type { Config } from "./config.js";

export function createMailer(config: Config) {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000
  });
  return {
    verify: () => transport.verify(),
    send: (recipient: string, filename: string, title: string, content: Buffer) => transport.sendMail({
      from: config.SMTP_FROM,
      to: recipient,
      subject: title,
      text: "Книга создана приложением TabTome.",
      attachments: [{ filename, content, contentType: "application/epub+zip" }]
    })
  };
}
