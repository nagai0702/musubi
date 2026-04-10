/**
 * Gmail API経由でメール送信（Google OAuth利用）
 */
import { google } from 'googleapis';
import { getOAuthClient } from './sheets';

function gmailClient() {
  return google.gmail({ version: 'v1', auth: getOAuthClient() });
}

interface SendMailOptions {
  to: string;
  subject: string;
  bodyHtml: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    data: Buffer;
  }>;
}

export async function sendMail(opts: SendMailOptions) {
  const from = import.meta.env.MAIL_FROM || 'noreply@musubi-en.com';
  const boundary = 'boundary_' + crypto.randomUUID().replace(/-/g, '');

  let raw = '';
  raw += `From: 株式会社結び <${from}>\r\n`;
  raw += `To: ${opts.to}\r\n`;
  raw += `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=\r\n`;
  raw += `MIME-Version: 1.0\r\n`;
  raw += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

  // HTML本文
  raw += `--${boundary}\r\n`;
  raw += `Content-Type: text/html; charset=UTF-8\r\n`;
  raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
  raw += Buffer.from(opts.bodyHtml).toString('base64') + '\r\n';

  // 添付ファイル
  if (opts.attachments) {
    for (const att of opts.attachments) {
      raw += `--${boundary}\r\n`;
      raw += `Content-Type: ${att.mimeType}; name="${att.filename}"\r\n`;
      raw += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
      raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
      raw += att.data.toString('base64') + '\r\n';
    }
  }

  raw += `--${boundary}--\r\n`;

  const encodedMessage = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmailClient().users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}

/** 契約書PDF送付メール */
export async function sendContractEmail(
  to: string,
  customerName: string,
  pdfBuffers: Array<{ filename: string; data: Buffer }>
) {
  const bodyHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">${customerName} 様</h2>
      <p>このたびは株式会社結びのサービスにお申し込みいただき、誠にありがとうございます。</p>
      <p>ご契約の書類を添付いたしますので、ご確認・保管をお願いいたします。</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p><strong>添付書類:</strong></p>
      <ul>
        ${pdfBuffers.map(p => `<li>${p.filename}</li>`).join('')}
      </ul>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="font-size: 13px; color: #666;">
        ※クーリングオフについて：契約締結日から8日以内であれば、書面またはメールにて無条件で契約を解除できます。<br>
        ※本メールにお心当たりがない場合は、お手数ですが破棄してください。
      </p>
      <p style="font-size: 13px; color: #999; margin-top: 24px;">
        株式会社結び<br>
      </p>
    </div>
  `;

  await sendMail({
    to,
    subject: `【株式会社結び】ご契約書類のお届け`,
    bodyHtml,
    attachments: pdfBuffers.map(p => ({
      filename: p.filename,
      mimeType: 'application/pdf',
      data: p.data,
    })),
  });
}
