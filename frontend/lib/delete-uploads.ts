"use client";

export async function deleteUploadsByKeys(keys: string[]) {
  const uniqueKeys = Array.from(
    new Set(keys.map((k) => k.trim()).filter(Boolean)),
  );

  if (uniqueKeys.length === 0) {
    return;
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }

  const res = await fetch(`${apiBaseUrl}/v1/media/upload/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ keys: uniqueKeys }),
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(
      message || "Could not remove uploaded files. Please try again.",
    );
  }
}
