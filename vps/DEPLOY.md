# VPS Deployment Guide (Step-by-step)

This guide explains how to deploy the MinIO (S3-compatible) stack from `vps/docker-compose.yaml` to a VPS. It covers SSH login, preparing the host, DNS/domain configuration, creating the `.env` file, starting the stack with Docker Compose, verification steps, and common troubleshooting.

Prerequisites

- A VPS with SSH access and sudo/root privileges.
- Ability to edit DNS records for the domain(s) you plan to use (A records pointing to the VPS public IP).
- Ports 22 (SSH), 80 (HTTP) and 443 (HTTPS) accessible (required for ACME/Let's Encrypt via Traefik).

1. SSH into the server

```bash
# Example
ssh youruser@YOUR_SERVER_IP
# or with a private key
ssh -i ~/.ssh/id_rsa youruser@YOUR_SERVER_IP
```

2. Install Docker and Docker Compose (Ubuntu example)

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
# (optional) Add current user to the docker group then re-login
sudo usermod -aG docker $USER
```

3. Create the `web` Docker network if you use Traefik or external networking

```bash
docker network inspect web >/dev/null 2>&1 || docker network create web
```

4. Clone or copy the repository to the server

Place the repository in a suitable location, for example `/srv` or `/opt`:

```bash
cd /srv
git clone <REPO_URL> minio-storage
cd minio-storage/vps
```

If you already have the repo locally and want to copy it to the server, use `scp` or `rsync`.

5. Create and edit the `.env` file for the compose stack

Copy the example and edit the values to match your environment:

```bash
cp .env.example .env
nano .env   # or use your preferred editor
```

Example `vps/.env` values (replace with strong, unique secrets):

```
MINIO_ROOT_USER=generated-root-user
MINIO_ROOT_PASSWORD=strongpassword
S3_BUCKET_NAME=storage
S3_ACCESS_KEY_ID=generated-access-key-id
S3_SECRET_ACCESS_KEY=generated-secret-access-key
S3_CORS_ORIGINS=http://localhost:3000,http://localhost:5000
```

Notes:

- Keep `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` secure.
- `S3_CORS_ORIGINS` should include the origin(s) of any browser-based frontends that will upload directly to MinIO.

6. DNS / domain configuration

- Edit the domain names in `vps/docker-compose.yaml` (Traefik labels) to match the domains you own, or update your Traefik configuration accordingly.
- Create A records at your DNS provider that point your MinIO hostnames to the VPS public IP, for example:
  - `s3.example.com` → YOUR_SERVER_IP
  - `minio.example.com` → YOUR_SERVER_IP

DNS changes can take some time to propagate.

7. Traefik / reverse proxy notes

- The example `docker-compose.yaml` uses Traefik labels for automatic HTTPS via ACME. If you plan to use Traefik, ensure Traefik is installed and attached to the same `web` network and has a certificate resolver (the example uses `letsencrypt`).
- If you do not use Traefik, remove or modify the Traefik labels in the compose file and ensure MinIO endpoints are reachable as intended.

8. Start the stack

From the `vps/` folder run:

```bash
docker compose --env-file .env -f docker-compose.yaml up -d
```

This will start `example-minio` and `example-minio-init` containers. The init container will wait for MinIO and attempt to create the configured bucket and application user.

9. Verify the deployment

Check that containers are running and examine logs:

```bash
docker compose -f docker-compose.yaml ps
docker compose -f docker-compose.yaml logs -f example-minio
docker logs example-minio-init

# Health check (from the VPS)
curl -f http://127.0.0.1:9000/minio/health/live && echo "MinIO is healthy"
```

10. Verify with MinIO Client (`mc`)

Install `mc` and configure an alias to inspect buckets and users:

```bash
curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o mc
chmod +x mc
sudo mv mc /usr/local/bin/mc

# Set alias
mc alias set example http://127.0.0.1:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# List the configured bucket
mc ls example/$S3_BUCKET_NAME

# Verify the application user exists
mc admin user info example $S3_ACCESS_KEY_ID
```

11. Configure the backend server environment

If you run the `server` application on the same VPS, provide it with S3 connection settings in `server/.env` (or in your process manager):

```bash
cd /srv/minio-storage/server
cat > .env <<EOF
S3_REGION=us-east-1
S3_ENDPOINT=http://s3.example.com
S3_ACCESS_KEY_ID=generated-access-key-id
S3_SECRET_ACCESS_KEY=generated-secret-access-key
S3_BUCKET_NAME=storage
S3_FORCE_PATH_STYLE=true
S3_PRESIGN_EXPIRES_IN_SECONDS=300
EOF
```

If Traefik/HTTPS is used for the S3 endpoint, use `https://s3.example.com` for `S3_ENDPOINT`.

12. Firewall settings (UFW example)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

13. Optional: systemd service to manage the compose stack

Create `/etc/systemd/system/minio-stack.service` with the following content:

```ini
[Unit]
Description=MinIO Compose Stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/srv/minio-storage/vps
ExecStart=/usr/bin/docker compose --env-file /srv/minio-storage/vps/.env -f docker-compose.yaml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.yaml down
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now minio-stack.service
```

14. Troubleshooting

- `network web not found` when running compose → run `docker network create web`.
- Certificate issuance fails (Let's Encrypt) → confirm DNS records, ensure ports 80 and 443 are reachable, and check Traefik logs and resolver configuration.
- `example-minio-init` fails to create the bucket → inspect `docker logs example-minio-init` and `docker compose logs example-minio` to verify credentials and connectivity.

15. Security recommendations

- Do not commit `.env` or any secret values to version control.
- Keep MinIO root credentials secure; create and use application-scoped access keys for app workloads.
- Rotate access keys periodically.

Conclusion

I can help further by:

- updating `docker-compose.yaml` domain labels to your real hostnames,
- generating a `server/.env` sample populated with your chosen values,
- or creating a Traefik example configuration that matches your VPS environment.

References: `vps/docker-compose.yaml`, `vps/.env.example`, Traefik documentation, MinIO documentation.