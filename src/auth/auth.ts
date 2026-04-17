import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, magicLink, organization, twoFactor } from "better-auth/plugins";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import {
  sendMagicLinkEmail,
  sendWelcomeEmail,
  sendResetPasswordEmail,
} from "@/emails/resend";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  baseURL: process.env.BETTER_AUTH_URL!,
  basePath: "/auth",
  secret: process.env.BETTER_AUTH_SECRET!,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendWelcomeEmail({ to: user.email, name: user.name, verifyUrl: url });
    },
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail({ to: user.email, link: url });
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  plugins: [
    bearer(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, link: url });
      },
    }),
    organization({
      schema: {
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),
    twoFactor({
      schema: {
        twoFactor: schema.twoFactor,
      },
    }),
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
