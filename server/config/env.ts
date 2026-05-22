import dotenv from "dotenv";
import status from "http-status";
import path from "path";
import { AppError } from "../shared/errors/app-error";

dotenv.config({ path: path.join(process.cwd(), ".env") });

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  fieldName: string,
) {
  if (!value) return fallback;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(
      status.INTERNAL_SERVER_ERROR,
      `Environment variable ${fieldName} must be a positive integer.`,
    );
  }

  return parsed;
}

interface EnvConfig {
  S3: {
    REGION: string;
    ENDPOINT: string;
    ACCESS_KEY_ID: string;
    SECRET_ACCESS_KEY: string;
    BUCKET_NAME: string;
    PUBLIC_BASE_URL?: string;
    FORCE_PATH_STYLE: boolean;
    PRESIGN_EXPIRES_IN_SECONDS: number;
  };
}

const loadEnvVars = (): EnvConfig => {
  const requiredEnvVars = [
    "S3_REGION",
    "S3_ENDPOINT",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET_NAME",
  ];

  const optionalWithWarning = [""];

  optionalWithWarning.forEach((varName) => {
    if (!process.env[varName]) {
      console.warn(
        `[WARN] Environment variable ${varName} is not set. Payment gateway features will be unavailable.`,
      );
    }
  });

  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      throw new AppError(
        status.INTERNAL_SERVER_ERROR,
        `Environment variable ${varName} is required but not set in .env file.`,
      );
    }
  });

  return {
    S3: {
      REGION: process.env.S3_REGION as string,
      ENDPOINT: process.env.S3_ENDPOINT as string,
      ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID as string,
      SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY as string,
      BUCKET_NAME: process.env.S3_BUCKET_NAME as string,
      PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL ?? undefined,
      FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE !== "false",
      PRESIGN_EXPIRES_IN_SECONDS: parsePositiveInteger(
        process.env.S3_PRESIGN_EXPIRES_IN_SECONDS,
        300,
        "S3_PRESIGN_EXPIRES_IN_SECONDS",
      ),
    },
  };
};

export const envVars = loadEnvVars();
