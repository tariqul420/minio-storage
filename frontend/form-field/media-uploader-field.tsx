/* eslint-disable @next/next/no-img-element */
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadFileWithPresign } from "@/lib/media/upload";
import { cn } from "@/lib/utils";
import { ImageIcon, LinkIcon, UploadIcon, XIcon } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

type MediaKind = "image" | "video" | "pdf" | "audio";

type PendingFile = {
  file: File;
  previewUrl: string;
};

type Props = {
  name: string;
  label: string;
  hint?: string;
  multiple?: boolean;
  className?: string;
  acceptTypes?: MediaKind[];
  urlPlaceholder?: string;
  disabled?: boolean;
};

export type MediaUploaderFieldRef = {
  uploadPendingFiles: () => Promise<{ urls: string[]; uploadedKeys: string[] }>;
  revertUncommittedUploads: () => void;
  getCurrentUrls: () => string[];
  markCommittedUrls: () => void;
};

function normalizeUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const MediaUploaderField = forwardRef<MediaUploaderFieldRef, Props>(
  function MediaUploaderField(
    {
      name,
      label,
      hint,
      multiple = false,
      className,
      acceptTypes = ["image"],
      urlPlaceholder = "https://cdn.example.com/image.jpg",
      disabled = false,
    },
    ref,
  ) {
    const { control, setValue } = useFormContext();
    const value = useWatch({ control, name });
    const urls = useMemo(() => normalizeUrls(value), [value]);

    const inputRef = useRef<HTMLInputElement | null>(null);
    const committedUrlsRef = useRef<string[]>(urls);
    const currentUrlsRef = useRef<string[]>(urls);
    const pendingFilesRef = useRef<PendingFile[]>([]);
    const activePendingFilesRef = useRef<PendingFile[]>([]);
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

    const [open, setOpen] = useState(false);
    const [manualUrl, setManualUrl] = useState("");
    const [error, setError] = useState<string | null>(null);
    const activePendingFiles = useMemo(
      () => pendingFiles.filter((item) => urls.includes(item.previewUrl)),
      [pendingFiles, urls],
    );

    const accept = useMemo(() => {
      const items: string[] = [];
      if (acceptTypes.includes("image")) items.push("image/*");
      if (acceptTypes.includes("video")) items.push("video/*");
      if (acceptTypes.includes("pdf")) items.push("application/pdf");
      if (acceptTypes.includes("audio")) items.push("audio/*");
      return items.join(",");
    }, [acceptTypes]);

    useEffect(() => {
      currentUrlsRef.current = urls;
    }, [urls]);

    useEffect(() => {
      pendingFilesRef.current = pendingFiles;
    }, [pendingFiles]);

    useEffect(() => {
      activePendingFilesRef.current = activePendingFiles;
    }, [activePendingFiles]);

    useEffect(() => {
      return () => {
        pendingFilesRef.current.forEach((item) => {
          URL.revokeObjectURL(item.previewUrl);
        });
      };
    }, []);

    function clearPendingFiles(previewUrls?: string[]) {
      if (!previewUrls || previewUrls.length === 0) {
        pendingFilesRef.current = [];
        activePendingFilesRef.current = [];
      } else {
        pendingFilesRef.current = pendingFilesRef.current.filter(
          (item) => !previewUrls.includes(item.previewUrl),
        );
        activePendingFilesRef.current = activePendingFilesRef.current.filter(
          (item) => !previewUrls.includes(item.previewUrl),
        );
      }

      setPendingFiles((current) => {
        const removable =
          previewUrls && previewUrls.length > 0
            ? current.filter((item) => previewUrls.includes(item.previewUrl))
            : current;

        removable.forEach((item) => {
          URL.revokeObjectURL(item.previewUrl);
        });

        if (!previewUrls || previewUrls.length === 0) {
          return [];
        }

        return current.filter((item) => !previewUrls.includes(item.previewUrl));
      });
    }

    const updateUrls = useCallback(
      (nextUrls: string[]) => {
        currentUrlsRef.current = nextUrls;
        if (multiple) {
          setValue(name, nextUrls, { shouldDirty: true, shouldValidate: true });
        } else {
          setValue(name, nextUrls[0] ?? "", {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
      },
      [multiple, name, setValue],
    );

    function removeUrl(url: string) {
      clearPendingFiles([url]);
      updateUrls(urls.filter((item) => item !== url));
    }

    function addUrl() {
      const trimmed = manualUrl.trim();

      if (!trimmed || !isValidUrl(trimmed)) {
        setError("Please enter a valid URL.");
        return;
      }

      if (!multiple) {
        updateUrls([trimmed]);
      } else if (!urls.includes(trimmed)) {
        updateUrls([...urls, trimmed]);
      }

      setManualUrl("");
      setError(null);
      setOpen(false);
    }

    async function handleFiles(files: FileList | null) {
      if (!files?.length) return;

      const nextPendingFiles = Array.from(files).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      if (!multiple) {
        clearPendingFiles();
        const singlePendingFile = nextPendingFiles.slice(0, 1);
        pendingFilesRef.current = singlePendingFile;
        activePendingFilesRef.current = singlePendingFile;
        setPendingFiles(singlePendingFile);
        updateUrls([singlePendingFile[0]?.previewUrl ?? ""]);
      } else {
        const mergedPendingFiles = [
          ...pendingFilesRef.current,
          ...nextPendingFiles,
        ];
        pendingFilesRef.current = mergedPendingFiles;
        activePendingFilesRef.current = mergedPendingFiles;
        setPendingFiles((current) => [...current, ...nextPendingFiles]);
        updateUrls([
          ...urls,
          ...nextPendingFiles.map((item) => item.previewUrl),
        ]);
      }

      setError(null);
      setOpen(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }

    useImperativeHandle(
      ref,
      () => ({
        async uploadPendingFiles() {
          const pending = activePendingFilesRef.current;
          const currentUrls = currentUrlsRef.current;

          if (pending.length === 0) {
            return {
              urls: currentUrls,
              uploadedKeys: [],
            };
          }

          const uploadedKeys: string[] = [];
          const nextUrls = [...currentUrls];

          try {
            for (const item of pending) {
              const uploaded = await uploadFileWithPresign(item.file);
              uploadedKeys.push(uploaded.key);

              const previewIndex = nextUrls.indexOf(item.previewUrl);
              if (previewIndex >= 0) {
                nextUrls[previewIndex] = uploaded.url;
              } else if (multiple) {
                nextUrls.push(uploaded.url);
              } else {
                nextUrls.splice(0, nextUrls.length, uploaded.url);
              }
            }

            clearPendingFiles(pending.map((item) => item.previewUrl));
            updateUrls(nextUrls);
            currentUrlsRef.current = nextUrls;

            return {
              urls: nextUrls,
              uploadedKeys,
            };
          } catch (error) {
            const uploadError =
              error instanceof Error ? error : new Error("File upload failed.");

            (
              uploadError as Error & {
                uploadedKeys?: string[];
              }
            ).uploadedKeys = uploadedKeys;

            throw uploadError;
          }
        },
        revertUncommittedUploads() {
          clearPendingFiles();
          updateUrls(committedUrlsRef.current);
          currentUrlsRef.current = committedUrlsRef.current;
        },
        getCurrentUrls() {
          return currentUrlsRef.current;
        },
        markCommittedUrls() {
          committedUrlsRef.current = currentUrlsRef.current;
        },
      }),
      [multiple, updateUrls],
    );

    function getPendingFile(url: string): PendingFile | undefined {
      return pendingFiles.find((p) => p.previewUrl === url);
    }

    function inferMediaKind(url: string): MediaKind | "unknown" {
      const pending = getPendingFile(url);
      if (pending) {
        const t = pending.file.type || "";
        if (t.startsWith("image/")) return "image";
        if (t.startsWith("video/")) return "video";
        if (t.startsWith("audio/")) return "audio";
        if (t === "application/pdf") return "pdf";
      }

      const path = url.split("?")[0].split("#")[0].toLowerCase();

      if (/\.(jpe?g|png|webp|gif|svg)$/.test(path)) return "image";
      if (/\.(mp4|webm|ogg|mov)$/.test(path)) return "video";
      if (/\.(mp3|wav|m4a|aac|oga)$/.test(path)) return "audio";
      if (/\.(pdf)$/.test(path)) return "pdf";

      return "unknown";
    }

    function renderMediaPreview(url: string) {
      const kind = inferMediaKind(url);

      switch (kind) {
        case "image":
          return (
            <img src={url} alt={label} className="h-full w-full object-cover" />
          );
        case "video":
          return (
            <video controls className="h-full w-full object-cover">
              <source src={url} />
              Your browser does not support the video element.
            </video>
          );
        case "audio":
          return <audio controls className="w-full" src={url} />;
        case "pdf":
          return <iframe src={url} title={label} className="h-full w-full" />;
        default:
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 text-sm text-primary underline"
            >
              Open file
            </a>
          );
      }
    }

    const hasValue = urls.length > 0;

    return (
      <Controller
        name={name}
        control={control}
        render={({ fieldState }) => (
          <Field className={className} data-invalid={fieldState.invalid}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <FieldLabel>{label}</FieldLabel>
                {hint ? <FieldDescription>{hint}</FieldDescription> : null}
              </div>

              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                  >
                    <UploadIcon className="size-4" />
                    {hasValue ? "Change" : "Upload"}
                  </Button>
                </DialogTrigger>

                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{label}</DialogTitle>
                    <DialogDescription>
                      Upload a file or paste a direct media URL.
                    </DialogDescription>
                  </DialogHeader>

                  <Tabs defaultValue="upload" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="upload">Upload</TabsTrigger>
                      <TabsTrigger value="url">URL</TabsTrigger>
                    </TabsList>

                    <TabsContent value="upload" className="mt-4">
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={disabled}
                        className={cn(
                          "flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 p-6 text-center transition hover:bg-muted/50",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <div className="mb-3 flex size-11 items-center justify-center rounded-full border bg-background">
                          <ImageIcon className="size-5 text-muted-foreground" />
                        </div>

                        <p className="text-sm font-medium">Click to upload</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Supported: {acceptTypes.join(", ")}
                        </p>
                      </button>

                      <input
                        ref={inputRef}
                        type="file"
                        accept={accept}
                        multiple={multiple}
                        className="hidden"
                        onChange={(event) => handleFiles(event.target.files)}
                      />
                    </TabsContent>

                    <TabsContent value="url" className="mt-4 space-y-3">
                      <div className="relative">
                        <LinkIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={manualUrl}
                          onChange={(event) => setManualUrl(event.target.value)}
                          placeholder={urlPlaceholder}
                          className="pl-9"
                          disabled={disabled}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addUrl();
                            }
                          }}
                        />
                      </div>

                      {error ? (
                        <p className="text-xs text-destructive">{error}</p>
                      ) : null}
                    </TabsContent>
                  </Tabs>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={addUrl}
                      disabled={!manualUrl.trim()}
                    >
                      Add URL
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <FieldContent>
              <div
                className={cn(
                  "mt-3 rounded-xl border bg-muted/20 p-3",
                  !hasValue && "border-dashed",
                )}
              >
                {hasValue ? (
                  <div
                    className={cn(
                      multiple
                        ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                        : "max-w-sm",
                    )}
                  >
                    {urls.map((url) => (
                      <div
                        key={url}
                        className={cn(
                          "group relative overflow-hidden rounded-lg border bg-background",
                          multiple ? "aspect-video" : "aspect-square w-full",
                        )}
                      >
                        {renderMediaPreview(url)}

                        {!disabled ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="destructive"
                            className="absolute right-2 top-2 size-7 opacity-0 transition group-hover:opacity-100"
                            onClick={() => removeUrl(url)}
                          >
                            <XIcon className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-28 flex-col items-center justify-center text-center">
                    <ImageIcon className="mb-2 size-7 text-muted-foreground" />
                    <p className="text-sm font-medium">No media selected</p>
                    <p className="text-xs text-muted-foreground">
                      Upload or paste URL to add media.
                    </p>
                  </div>
                )}
              </div>
            </FieldContent>

            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : null}
          </Field>
        )}
      />
    );
  },
);

export default MediaUploaderField;
