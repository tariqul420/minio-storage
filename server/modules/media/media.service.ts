import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import crypto from "crypto";
import status from "http-status";
import { envVars } from "../../config/env";
import {
  buildS3ObjectUrl,
  deleteS3ObjectsByKeys,
  deleteS3ObjectsByUrls,
  normalizeMediaKeyPrefix,
  s3Client,
} from "../../config/s3";
import { AppError } from "../../shared/errors/app-error";
import {
  MediaSignInput,
  MediaUploadDeleteInput,
  MediaUploadPresignInput,
} from "./media.validation";

const sanitizeFilename = (name = "file") =>
  String(name)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 200) || crypto.randomUUID();

function normalizeContentType(contentType: string) {
  return contentType.trim().toLowerCase();
}

const signMedia = async (payload: MediaSignInput) => {
  const bucket = payload.bucket || envVars.S3.BUCKET_NAME;
  const url = buildS3ObjectUrl(payload.key, bucket);

  return {
    url,
    bucket,
    key: payload.key,
    s3Url: `s3://${bucket}/${payload.key}`,
  };
};

const createMediaPresign = async (payload: MediaUploadPresignInput) => {
  const bucket = envVars.S3.BUCKET_NAME;

  if (!bucket) {
    throw new AppError(
      status.INTERNAL_SERVER_ERROR,
      "S3 bucket is not configured",
    );
  }

  const safeFilename = sanitizeFilename(payload.filename);
  const safePrefix = normalizeMediaKeyPrefix(payload.keyPrefix);
  const objectName = `${Date.now()}-${safeFilename}`;
  const key = `${safePrefix}/${objectName}`;
  const contentType = normalizeContentType(payload.contentType);

  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: bucket,
    Key: key,
    Conditions: [
      ["content-length-range", 0, payload.maxSize],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: {
      "Content-Type": contentType,
    },
    Expires: envVars.S3.PRESIGN_EXPIRES_IN_SECONDS,
  });

  return {
    url,
    fields,
    key,
    bucket,
    publicUrl: buildS3ObjectUrl(key, bucket),
    s3Url: `s3://${bucket}/${key}`,
    expiresIn: envVars.S3.PRESIGN_EXPIRES_IN_SECONDS,
    contentType,
  };
};

const deleteMediaUploads = async (payload: MediaUploadDeleteInput) => {
  const keys = payload.keys ?? [];
  const urls = payload.urls ?? [];

  const byKeys = await deleteS3ObjectsByKeys(keys);
  const byUrls = await deleteS3ObjectsByUrls(urls);

  return {
    deleted: [...byKeys.deleted, ...byUrls.deleted],
    failed: [...byKeys.failed, ...byUrls.failed],
  };
};

export const mediaService = {
  signMedia,
  createMediaPresign,
  deleteMediaUploads,
};
