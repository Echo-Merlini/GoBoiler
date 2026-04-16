import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization, twoFactor } from "better-auth/plugins";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { sendMagicLinkEmail } from "@/emails/resend";

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
  secret: process.env.BETTER_AUTH_SECRET!,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  plugins: [
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
    twoFactor(),
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
