import { Resend } from "resend";
import { createElement } from "react";
import { WelcomeEmail } from "@/emails/templates/welcome";
import { MagicLinkEmail } from "@/emails/templates/magic-link";
import { ResetPasswordEmail } from "@/emails/templates/reset-password";
import { InvoiceEmail } from "@/emails/templates/invoice";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.EMAIL_FROM ?? "noreply@yourdomain.com";

export async function sendWelcomeEmail({
  to,
  name,
}: {
  to: string;
  name: string;
}) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome!",
    react: createElement(WelcomeEmail, { name }),
  });
}

export async function sendMagicLinkEmail({
  to,
  link,
}: {
  to: string;
  link: string;
}) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Your sign-in link",
    react: createElement(MagicLinkEmail, { link }),
  });
}

export async function sendResetPasswordEmail({
  to,
  link,
}: {
  to: string;
  link: string;
}) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your password",
    react: createElement(ResetPasswordEmail, { link }),
  });
}

export async function sendInvoiceEmail({
  to,
  name,
  amount,
  invoiceUrl,
  date,
}: {
  to: string;
  name: string;
  amount: string;
  invoiceUrl: string;
  date: string;
}) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Your invoice",
    react: createElement(InvoiceEmail, { name, amount, invoiceUrl, date }),
  });
}
