import nodemailer from 'nodemailer';

export async function sendRegistrationCodeEmail({
  to,
  code,
}: {
  to: string;
  code: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    return {
      sent: false,
      reason: 'SMTP_NOT_CONFIGURED',
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to,
    subject: 'AI PMO 注册码',
    text: `你的 AI PMO 注册码是：${code}\n\n该注册码仅可使用一次，请勿转发给他人。`,
    html: `<p>你的 AI PMO 注册码是：</p><p style="font-size:20px;font-weight:700;letter-spacing:2px;">${code}</p><p>该注册码仅可使用一次，请勿转发给他人。</p>`,
  });

  return {
    sent: true,
  };
}
