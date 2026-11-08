import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

/** Envía correos por SMTP. En desarrollo, a Mailpit (http://localhost:8025). */
export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return async (mail) => {
    await transport.sendMail({ from, ...mail });
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function magicLinkMail(to: string, url: string, minutes: number): Mail {
  return {
    to,
    subject: 'Tu enlace para entrar a pixels-coworker',
    text: `Hola:\n\nPara entrar a pixels-coworker, abre este enlace (válido ${minutes} minutos):\n\n${url}\n\nSi no lo pediste, ignora este correo.\n`,
    html: `<p>Hola:</p>
<p>Para entrar a pixels-coworker, pulsa el botón (el enlace vale ${minutes} minutos):</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#4f7cff;color:#fff;border-radius:6px;text-decoration:none">Entrar</a></p>
<p style="color:#666">Si no lo pediste, ignora este correo.</p>`,
  };
}
