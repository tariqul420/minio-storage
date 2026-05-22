"use client";

const DEFAULT_KEY_PREFIX = "uploads";
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;

const COMPRESSIBLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const PASSTHROUGH_IMAGE_TYPES = new Set(["image/svg+xml", "image/gif"]);

type PresignUploadPayload = {
  filename: string;
  contentType: string;
  keyPrefix?: string;
  maxSize?: number;
};

type PresignUploadResponse = {
  url: string;
  fields: Record<string, string>;
  key: string;
  bucket: string;
  publicUrl: string;
  s3Url: string;
  expiresIn: number;
  contentType: string;
};

type UploadReadyFile = {
  file: File;
  contentType: string;
};

function ensureApiBaseUrl() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }

  return apiBaseUrl;
}

function guessContentType(filename: string) {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";

  return "application/octet-stream";
}

function changeFileExtension(filename: string, extension: string) {
  return filename.replace(/\.[^.]+$/, "") + extension;
}

async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("Could not read image for optimization."));
      img.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function optimizeImageFile(file: File): Promise<UploadReadyFile> {
  const sourceType = file.type || guessContentType(file.name);

  if (PASSTHROUGH_IMAGE_TYPES.has(sourceType)) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error(
        "This image is too large. Please use an image under 5 MB.",
      );
    }

    return {
      file,
      contentType: sourceType,
    };
  }

  if (!COMPRESSIBLE_IMAGE_TYPES.has(sourceType)) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error(
        "Unsupported large image format. Please upload JPG, PNG, or WebP under 5 MB.",
      );
    }

    return {
      file,
      contentType: sourceType,
    };
  }

  const image = await loadImageElement(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image processing is not supported in this browser.");
  }

  context.drawImage(image, 0, 0, width, height);

  const qualities = [0.82, 0.76, 0.7, 0.64, 0.58];
  let bestBlob: Blob | null = null;

  for (const quality of qualities) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", quality);
    });

    if (!blob) continue;
    bestBlob = blob;

    if (blob.size <= TARGET_IMAGE_BYTES) {
      break;
    }
  }

  if (!bestBlob) {
    throw new Error("Image optimization failed. Please try another image.");
  }

  if (bestBlob.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error(
      "This image is too large even after optimization. Please choose a smaller image.",
    );
  }

  const optimizedFile = new File(
    [bestBlob],
    changeFileExtension(file.name, ".webp"),
    {
      type: "image/webp",
      lastModified: Date.now(),
    },
  );

  return {
    file: optimizedFile,
    contentType: optimizedFile.type,
  };
}

async function prepareFileForUpload(file: File): Promise<UploadReadyFile> {
  const contentType = file.type || guessContentType(file.name);

  if (contentType.startsWith("image/")) {
    return optimizeImageFile(file);
  }

  if (file.size > DEFAULT_MAX_SIZE) {
    throw new Error(
      "This file is too large. Please upload a file under 10 MB.",
    );
  }

  return {
    file,
    contentType,
  };
}

export async function createUploadPresign(payload: PresignUploadPayload) {
  const apiBaseUrl = ensureApiBaseUrl();

  const response = await fetch(`${apiBaseUrl}/v1/media/upload/presign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      filename: payload.filename,
      contentType: payload.contentType,
      keyPrefix: payload.keyPrefix ?? DEFAULT_KEY_PREFIX,
      maxSize: payload.maxSize ?? DEFAULT_MAX_SIZE,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Could not create an upload session.");
  }

  const json = (await response.json()) as { data?: PresignUploadResponse };

  if (!json.data) {
    throw new Error("Upload session response was invalid.");
  }

  return json.data;
}

export async function uploadFileWithPresign(
  file: File,
  options?: {
    keyPrefix?: string;
    maxSize?: number;
  },
) {
  const prepared = await prepareFileForUpload(file);
  const presign = await createUploadPresign({
    filename: prepared.file.name,
    contentType: prepared.contentType,
    keyPrefix: options?.keyPrefix,
    maxSize: options?.maxSize ?? prepared.file.size ?? DEFAULT_MAX_SIZE,
  });

  const formData = new FormData();

  Object.entries(presign.fields).forEach(([key, value]) => {
    formData.append(key, value);
  });

  formData.append("file", prepared.file);

  const uploadResponse = await fetch(presign.url, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    const message = await uploadResponse.text();
    throw new Error(message || `Failed to upload ${prepared.file.name}.`);
  }

  return {
    url: presign.publicUrl,
    key: presign.key,
    bucket: presign.bucket,
    contentType: prepared.contentType,
  };
}
