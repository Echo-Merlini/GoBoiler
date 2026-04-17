import { Hono } from "hono";
import { requireAuth } from "@/auth/middleware";
import { uploadFile, presignUpload } from "@/lib/storage";
import { nanoid } from "@/lib/utils";

export const uploadRoutes = new Hono();

// POST /upload — direct upload (file in multipart body, ≤10 MB)
uploadRoutes.post("/", requireAuth, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "No file provided" }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: "File too large (max 10 MB)" }, 400);

  const ext  = file.name.split(".").pop() ?? "bin";
  const key  = `uploads/${nanoid()}.${ext}`;
  const buf  = Buffer.from(await file.arrayBuffer());

  try {
    const url = await uploadFile(key, buf, file.type || "application/octet-stream");
    return c.json({ key, url });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /upload/presign — get a presigned PUT URL for client-side upload
uploadRoutes.post("/presign", requireAuth, async (c) => {
  const { filename, contentType } = await c.req.json<{ filename: string; contentType: string }>();
  if (!filename || !contentType) return c.json({ error: "filename and contentType required" }, 400);

  const ext = filename.split(".").pop() ?? "bin";
  const key = `uploads/${nanoid()}.${ext}`;

  try {
    const result = await presignUpload(key, contentType);
    return c.json({ key, ...result });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
