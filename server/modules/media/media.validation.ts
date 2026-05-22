import { z } from "zod";
import { envVars } from "../../config/env";

const MAX_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024;
const MAX_DOCUMENT_UPLOAD_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_SIZE = 25 * 1024 * 1024;
const MAX_AUDIO_UPLOAD_SIZE = 25 * 1024 * 1024;

const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const ALLOWED_DOCUMENT_CONTENT_TYPES = new Set(["application/pdf"]);
const ALLOWED_VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/webm"]);
const ALLOWED_AUDIO_CONTENT_TYPES = new Set(["audio/mpeg", "audio/wav"]);

const safeObjectPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("..") &&
      value.split("/").every((segment) => segment.trim().length > 0),
    "Invalid object path",
  );

export const mediaSignSchema = z.object({
  bucket: z
    .string()
    .min(1)
    .optional()
    .default(envVars.S3.BUCKET_NAME)
    .refine((value) => value === envVars.S3.BUCKET_NAME, {
      message: "Invalid bucket",
    }),
  key: safeObjectPathSchema,
});

export const mediaUploadPresignSchema = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z
      .string()
      .min(1)
      .max(255)
      .regex(
        /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/,
        "Invalid content type",
      ),
    keyPrefix: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9/_-]+$/, "Invalid key prefix")
      .optional()
      .default("uploads"),
    maxSize: z
      .number()
      .int()
      .positive()
      .max(1024 * 1024 * 1024)
      .optional()
      .default(MAX_DOCUMENT_UPLOAD_SIZE),
  })
  .superRefine((value, ctx) => {
    const contentType = value.contentType.trim().toLowerCase();

    if (ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      if (value.maxSize > MAX_IMAGE_UPLOAD_SIZE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxSize"],
          message: "Image uploads cannot exceed 5 MB.",
        });
      }
      return;
    }

    if (ALLOWED_DOCUMENT_CONTENT_TYPES.has(contentType)) {
      if (value.maxSize > MAX_DOCUMENT_UPLOAD_SIZE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxSize"],
          message: "Document uploads cannot exceed 10 MB.",
        });
      }
      return;
    }

    if (ALLOWED_VIDEO_CONTENT_TYPES.has(contentType)) {
      if (value.maxSize > MAX_VIDEO_UPLOAD_SIZE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxSize"],
          message: "Video uploads cannot exceed 25 MB.",
        });
      }
      return;
    }

    if (ALLOWED_AUDIO_CONTENT_TYPES.has(contentType)) {
      if (value.maxSize > MAX_AUDIO_UPLOAD_SIZE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxSize"],
          message: "Audio uploads cannot exceed 25 MB.",
        });
      }
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contentType"],
      message: "Unsupported media type.",
    });
  });

export const mediaUploadDeleteSchema = z
  .object({
    keys: z.array(safeObjectPathSchema).max(1000).optional(),
    urls: z.array(z.string().url()).max(1000).optional(),
  })
  .refine(
    (value) => (value.keys?.length ?? 0) > 0 || (value.urls?.length ?? 0) > 0,
    {
      message: "keys or urls required",
    },
  );

export type MediaSignInput = z.infer<typeof mediaSignSchema>;
export type MediaUploadPresignInput = z.infer<typeof mediaUploadPresignSchema>;
export type MediaUploadDeleteInput = z.infer<typeof mediaUploadDeleteSchema>;
