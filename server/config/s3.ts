import {
  DeleteObjectsCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { envVars } from "./env";

type S3ObjectRef = {
  bucket: string;
  key: string;
};

const MEDIA_ROOT_PREFIX = "uploads";

function normalizeKey(key: string) {
  return key.replace(/^\/+/, "").trim();
}

function isAllowedMediaKey(key: string) {
  const normalizedKey = normalizeKey(key);
  return (
    normalizedKey === MEDIA_ROOT_PREFIX ||
    normalizedKey.startsWith(`${MEDIA_ROOT_PREFIX}/`)
  );
}

const s3Config: S3ClientConfig = {
  region: envVars.S3.REGION,
  endpoint: envVars.S3.ENDPOINT,
  forcePathStyle: envVars.S3.FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: envVars.S3.ACCESS_KEY_ID,
    secretAccessKey: envVars.S3.SECRET_ACCESS_KEY,
  },
};

export const s3Client = new S3Client(s3Config);

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export function buildS3ObjectUrl(
  key: string,
  bucket = envVars.S3.BUCKET_NAME,
): string {
  const normalizedKey = normalizeKey(key);

  if (envVars.S3.PUBLIC_BASE_URL) {
    return `${normalizeBaseUrl(envVars.S3.PUBLIC_BASE_URL)}/${bucket}/${normalizedKey}`;
  }

  if (envVars.S3.FORCE_PATH_STYLE) {
    return `${normalizeBaseUrl(envVars.S3.ENDPOINT)}/${bucket}/${normalizedKey}`;
  }

  const endpoint = new URL(envVars.S3.ENDPOINT);
  return `${endpoint.protocol}//${bucket}.${endpoint.host}/${normalizedKey}`;
}

export function parseS3ObjectFromUrl(rawUrl: string): S3ObjectRef | null {
  if (!rawUrl) return null;

  if (rawUrl.startsWith("s3://")) {
    const withoutScheme = rawUrl.slice("s3://".length);
    const [bucket, ...keyParts] = withoutScheme.split("/");
    const key = keyParts.join("/");
    if (!bucket || !key) return null;
    return { bucket, key };
  }

  try {
    const objectUrl = new URL(rawUrl);

    if (envVars.S3.PUBLIC_BASE_URL) {
      const publicUrl = new URL(envVars.S3.PUBLIC_BASE_URL);

      if (objectUrl.origin === publicUrl.origin) {
        const path = objectUrl.pathname.replace(/^\/+/, "");
        const [bucket, ...keyParts] = path.split("/");
        const key = keyParts.join("/");

        if (bucket && key) {
          return { bucket, key };
        }
      }
    }

    const endpointUrl = new URL(envVars.S3.ENDPOINT);

    if (
      !envVars.S3.FORCE_PATH_STYLE &&
      objectUrl.hostname.endsWith(`.${endpointUrl.hostname}`)
    ) {
      const bucket = objectUrl.hostname.slice(
        0,
        -(endpointUrl.hostname.length + 1),
      );
      const key = objectUrl.pathname.replace(/^\/+/, "");

      if (bucket && key) {
        return { bucket, key };
      }
    }

    if (objectUrl.host === endpointUrl.host) {
      const path = objectUrl.pathname.replace(/^\/+/, "");
      const [bucket, ...keyParts] = path.split("/");
      const key = keyParts.join("/");

      if (bucket && key) {
        return { bucket, key };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function deleteS3ObjectsByKeys(
  keys: string[],
  bucket = envVars.S3.BUCKET_NAME,
): Promise<{ deleted: string[]; failed: string[] }> {
  const uniqueKeys = Array.from(
    new Set(keys.map(normalizeKey).filter(Boolean)),
  );

  if (!bucket || uniqueKeys.length === 0) {
    return { deleted: [], failed: uniqueKeys };
  }

  const allowedKeys = uniqueKeys.filter(isAllowedMediaKey);
  const disallowedKeys = uniqueKeys.filter((key) => !isAllowedMediaKey(key));

  const deleted: string[] = [];
  const failed: string[] = [...disallowedKeys];

  for (const keyGroup of chunkArray(allowedKeys, 1000)) {
    try {
      const result = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keyGroup.map((key) => ({ Key: key })),
            Quiet: false,
          },
        }),
      );

      const deletedKeys = new Set(
        (result.Deleted ?? [])
          .map((item) => item.Key)
          .filter((key): key is string => Boolean(key)),
      );

      deleted.push(...deletedKeys);

      const errorKeys = new Set(
        (result.Errors ?? [])
          .map((item) => item.Key)
          .filter((key): key is string => Boolean(key)),
      );

      failed.push(...errorKeys);

      for (const key of keyGroup) {
        if (!deletedKeys.has(key) && !errorKeys.has(key)) {
          failed.push(key);
        }
      }
    } catch {
      failed.push(...keyGroup);
    }
  }

  return {
    deleted: Array.from(new Set(deleted)),
    failed: Array.from(new Set(failed.filter((key) => !deleted.includes(key)))),
  };
}

export async function deleteS3ObjectsByUrls(
  urls: string[],
): Promise<{ deleted: string[]; failed: string[] }> {
  const parsedRefs = urls.map((url) => ({
    url,
    ref: parseS3ObjectFromUrl(url),
  }));

  const objectRefs = parsedRefs
    .map((entry) => entry.ref)
    .filter(Boolean) as S3ObjectRef[];

  const invalidUrls = parsedRefs
    .filter((entry) => !entry.ref)
    .map((entry) => entry.url);

  if (objectRefs.length === 0) {
    return { deleted: [], failed: invalidUrls };
  }

  const grouped = objectRefs.reduce<Record<string, string[]>>((acc, ref) => {
    acc[ref.bucket] = acc[ref.bucket] ?? [];
    acc[ref.bucket].push(ref.key);
    return acc;
  }, {});

  const deleted: string[] = [];
  const failed: string[] = [];

  for (const [bucket, keys] of Object.entries(grouped)) {
    const result = await deleteS3ObjectsByKeys(keys, bucket);
    deleted.push(...result.deleted.map((key) => `${bucket}/${key}`));
    failed.push(...result.failed.map((key) => `${bucket}/${key}`));
  }

  return { deleted, failed: [...invalidUrls, ...failed] };
}

export function normalizeMediaKeyPrefix(prefix: string) {
  const normalizedSegments = prefix
    .split("/")
    .map((segment) => segment.trim().replace(/[^a-zA-Z0-9_-]/g, "-"))
    .filter(Boolean);

  if (normalizedSegments.length === 0) {
    return MEDIA_ROOT_PREFIX;
  }

  if (normalizedSegments[0] !== MEDIA_ROOT_PREFIX) {
    normalizedSegments.unshift(MEDIA_ROOT_PREFIX);
  }

  return normalizedSegments.join("/");
}
