# minio-storage

Lightweight media presign and management service built for S3-compatible storage (MinIO). This repository contains server-side helpers for creating presigned uploads, deleting objects, and utilities used by a frontend uploader component.

## Overview

- Server: TypeScript Express-style module providing media presign, sign, and delete endpoints.
- Frontend: React/Next-style uploader utilities that request presigned upload fields and post files directly to S3/MinIO.
- Storage: MinIO (S3-compatible) used in the provided Docker Compose for VPS deployment.

This README documents how to run locally, what environment variables are required, the upload flow, allowed file types/limits, and production notes.

---

## Quick links

- Server env loader: [server/config/env.ts](server/config/env.ts)
- S3 helpers: [server/config/s3.ts](server/config/s3.ts)
- Media module: [server/modules/media](server/modules/media)
- Frontend upload logic: [frontend/lib/upload.ts](frontend/lib/upload.ts)
- Frontend delete helper: [frontend/lib/delete-uploads.ts](frontend/lib/delete-uploads.ts)
- Media uploader component: [frontend/form-field/media-uploader-field.tsx](frontend/form-field/media-uploader-field.tsx)
- MinIO compose (VPS): [vps/docker-compose.yaml](vps/docker-compose.yaml)
- VPS env example: [vps/.env.example](vps/.env.example)

---

## Prerequisites

- Node.js (recommended >= 18)
- npm, pnpm, or yarn to install dependencies for `server/` and `frontend/` (check each package's package.json)
- Docker & Docker Compose for local MinIO or VPS deployment

Note: This repo snapshot contains the server and frontend source fragments. Inspect each package's `package.json` (if present) for exact scripts (`dev`, `build`, `start`).

---

## Environment variables

Create a `.env` in the server working directory (server expects `.env` at process.cwd()). Required environment variables used by the server:

```
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minio-access-key
S3_SECRET_ACCESS_KEY=minio-secret-key
S3_BUCKET_NAME=storage
# Optional
S3_PUBLIC_BASE_URL=http://cdn.example.com   # used when files are served via a public base URL
S3_FORCE_PATH_STYLE=true                    # true for MinIO / custom endpoints
S3_PRESIGN_EXPIRES_IN_SECONDS=300          # default 300
```

Frontend (client) environment variable:

```
NEXT_PUBLIC_API_URL=http://localhost:4000   # base URL for your API (adjust port)
```

VPS/Docker Compose-specific variables are provided in `vps/.env.example`. Copy it to `vps/.env` and fill values before starting the compose stack.

---

## Start MinIO locally (development)

The repository includes a ready-to-run compose file for VPS/production in `vps/docker-compose.yaml`. For local testing you can reuse that compose (or run MinIO directly).

Example using the provided compose file (recommended for parity with production):

```bash
# copy example env and edit values
cp vps/.env.example vps/.env
# Edit vps/.env and set MINIO_ROOT_USER and MINIO_ROOT_PASSWORD

# Start the compose stack (from repo root)
docker compose --env-file vps/.env -f vps/docker-compose.yaml up -d
```

The `eduflow-minio-init` service in the compose will create the bucket and attach a policy for the application user (values come from `vps/.env`).

Alternatively run a single MinIO container for quick local tests:

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioroot -e MINIO_ROOT_PASSWORD=miniorootpw \
  -v minio-data:/data minio/minio server /data --console-address ":9001"
```

---

## Developer quick start (high level)

1. Start MinIO (see previous section).
2. Create `server/.env` with the `S3_*` variables so the server can connect to MinIO.
3. Start the backend:

```bash
cd server
# install deps (npm / pnpm / yarn)
npm install
# run dev (check package.json for the exact script name; commonly `npm run dev`)
npm run dev
```

4. Start the frontend:

```bash
cd frontend
npm install
npm run dev   # or check package.json for exact script
```

If your frontend runs on a different origin, add that origin to `S3_CORS_ORIGINS` in `vps/.env` (for the MinIO compose) or configure CORS in your MinIO instance.

---

## Upload flow (how presigned uploads work)

1. Client calls `POST /v1/media/upload/presign` with JSON:

```json
{
  "filename": "image.jpg",
  "contentType": "image/jpeg",
  "keyPrefix": "uploads/profile",
  "maxSize": 5242880
}
```

2. Server validates the request (see [server/modules/media/media.validation.ts](server/modules/media/media.validation.ts)) and returns a presign object:

- `url` and `fields` — the client must POST a `multipart/form-data` to `url` with all `fields` plus the `file` field.
- `publicUrl` — final public URL to use after a successful upload.

3. Client uploads directly to the S3/MinIO endpoint using the returned `url` and `fields` (no server streaming required).

4. Deleting uploaded files: call `POST /v1/media/upload/delete` with `{ keys: [...], urls: [...] }`.

Example client helpers are in [frontend/lib/upload.ts](frontend/lib/upload.ts) and [frontend/lib/delete-uploads.ts](frontend/lib/delete-uploads.ts).

---

## API endpoints (found in server modules)

- `GET /v1/media/sign?key=...&bucket=...` — returns a signed object reference (used for generating S3/S3-style `s3://` URIs).
- `POST /v1/media/upload/presign` — create presigned upload session (see payload above).
- `POST /v1/media/upload/delete` — delete uploads by keys or URLs.

Note: Routes are protected by an authorization middleware in the code (`authorize(Role.SUPER_ADMIN, Role.OWNER)`). Ensure your auth layer is configured when calling these endpoints.

---

## Allowed types and size limits (server-side enforcement)

These limits are enforced in `server/modules/media/media.validation.ts`:

- Images: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml` — max 5 MB
- Documents: `application/pdf` — max 10 MB
- Video: `video/mp4`, `video/webm` — max 25 MB
- Audio: `audio/mpeg`, `audio/wav` — max 25 MB

Client-side helpers in `frontend/lib/upload.ts` attempt to optimize images before upload and use a default `maxSize` of 10 MB for non-image files. Final limits are enforced server-side.

---

## Production notes & best practices

- Never commit `.env` or secrets to version control. Use your deployment platform secrets or Docker secrets.
- Use `S3_PUBLIC_BASE_URL` when you serve files behind a CDN or reverse proxy; otherwise, ensure the `S3_ENDPOINT` is a fully-qualified URL (includes protocol).
- For MinIO, `S3_FORCE_PATH_STYLE=true` is recommended unless you use a DNS setup that supports virtual-hosted–style buckets.
- Configure CORS origins carefully (`S3_CORS_ORIGINS` in `vps/.env`) to avoid overly permissive policies.
- Use HTTPS/TLS for all public endpoints. The example compose uses Traefik labels to enable TLS via a certificate resolver.
- Rotate S3 credentials regularly and scope policies to the minimum required actions.

---

## Troubleshooting

- Missing required environment variables: server will throw a clear error at startup if any of `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` are not set. See [server/config/env.ts](server/config/env.ts).
- If uploads fail with `403` or auth errors, check MinIO user credentials and bucket policy (see `vps/docker-compose.yaml` init script that creates user and policy).
- If public URLs look incorrect, verify `S3_PUBLIC_BASE_URL`, `S3_ENDPOINT`, and `S3_FORCE_PATH_STYLE` settings.

---

## Where to look in the code

- Server env loader: [server/config/env.ts](server/config/env.ts)
- S3 helpers & deletion utilities: [server/config/s3.ts](server/config/s3.ts)
- Media controller/service/validation: [server/modules/media](server/modules/media)
- Frontend presign/upload helpers: [frontend/lib/upload.ts](frontend/lib/upload.ts)
- VPS compose: [vps/docker-compose.yaml](vps/docker-compose.yaml)
