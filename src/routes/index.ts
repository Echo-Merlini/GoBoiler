import { Hono } from "hono";
import { authRoutes } from "@/routes/auth";
import { siweRoutes } from "@/routes/siwe";
import { billingRoutes } from "@/routes/billing";
import { pushRoutes } from "@/routes/push";
import { meRoutes } from "@/routes/me";
import { adminRoutes } from "@/routes/admin";

export const routes = new Hono();

routes.route("/auth", authRoutes);
routes.route("/auth/siwe", siweRoutes);
routes.route("/billing", billingRoutes);
routes.route("/push", pushRoutes);
routes.route("/me", meRoutes);
routes.route("/admin", adminRoutes);
