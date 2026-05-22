"use client";

import InputField from "@/components/global/form-field/input-field";
import MediaUploaderField, {
  type MediaUploaderFieldRef,
} from "@/components/global/form-field/media-uploader-field";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUpdateProfileMutation } from "@/features/auth/queries/auth.mutations";
import {
  profileZodSchema,
  type IProfilePayload,
} from "@/features/auth/validators/profile.validator";
import { uiCopy } from "@/lib/copy";
import { deleteUploadsByKeys } from "@/lib/media/delete-uploads";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import ChangePasswordDialog from "./change-password-dialog";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
  phone?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface ProfileFormProps {
  user: User;
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const mutation = useUpdateProfileMutation();
  const router = useRouter();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const imageFieldRef = useRef<MediaUploaderFieldRef | null>(null);

  const form = useForm<IProfilePayload>({
    mode: "onTouched",
    resolver: zodResolver(profileZodSchema) as never,
    defaultValues: {
      name: user.name || "",
      image: user.image || "",
      phone: user.phone || "",
    },
  });

  async function onSubmit(values: IProfilePayload) {
    let uploadedKeys: string[] = [];
    const imageUploader = imageFieldRef.current;
    try {
      const uploadResult = await imageUploader?.uploadPendingFiles();
      if (uploadResult) {
        uploadedKeys = uploadResult.uploadedKeys;
        values = {
          ...values,
          image: uploadResult.urls[0] ?? "",
        };
      }

      await mutation.mutateAsync(values);
      imageUploader?.markCommittedUrls();
      router.refresh();
    } catch (err: unknown) {
      const partialKeys =
        typeof err === "object" &&
        err !== null &&
        "uploadedKeys" in err &&
        Array.isArray((err as { uploadedKeys?: unknown }).uploadedKeys)
          ? (
              (err as { uploadedKeys?: unknown }).uploadedKeys as unknown[]
            ).filter((k): k is string => typeof k === "string")
          : [];

      const keysToDelete = [...uploadedKeys, ...partialKeys];

      if (keysToDelete.length > 0) {
        try {
          await deleteUploadsByKeys(keysToDelete);
        } catch {}
      }
      imageUploader?.revertUncommittedUploads();
      // Error handling is done in the mutation's onError callback
    }
  }

  async function submitProfileForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await form.handleSubmit(async (values) => {
      await onSubmit(values);
    })(event);
  }
  return (
    <FormProvider {...form}>
      <form
        onSubmit={submitProfileForm}
        className="space-y-6 rounded-lg border bg-card p-6"
      >
        <div>
          <h2 className="mb-2 text-xl font-semibold">My Profile</h2>
          <p className="text-sm text-muted-foreground">
            Update your public profile information and avatar.
          </p>
        </div>

        <div className="grid md:grid-cols-3">
          <MediaUploaderField
            ref={imageFieldRef}
            name="image"
            label="Profile image"
            multiple={false}
            acceptTypes={["image"]}
            disabled={mutation.isPending}
            hint="Recommended: square image. Max 5 MB."
            urlPlaceholder="https://cdn.example.com/image.jpg"
          />
        </div>

        <InputField
          name="name"
          label="Full name"
          placeholder="Your full name"
          disabled={mutation.isPending}
        />

        <div className="space-y-2">
          <InputField
            label="Email"
            placeholder="you@example.com"
            type="email"
            value={user.email || ""}
            disabled
            className="cursor-not-allowed opacity-70"
            hint="This email address cannot be changed."
          />
        </div>

        <InputField
          name="phone"
          label="Phone number"
          placeholder="Your phone number"
          type="tel"
          disabled={mutation.isPending}
        />

        <Separator className="my-6" />

        <div>
          <h3 className="mb-2 text-lg font-semibold">Security</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Manage your account password and security settings.
          </p>

          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">
                  Change your account password regularly.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPasswordDialog(true)}
              disabled={mutation.isPending}
            >
              Change password
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t pt-6">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              form.reset({
                name: user.name || "",
                image: user.image || "",
                phone: user.phone || "",
              });
              toast.info(uiCopy.toast.discarded);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save changes
          </Button>
        </div>

        <ChangePasswordDialog
          open={showPasswordDialog}
          onOpenChange={setShowPasswordDialog}
        />
      </form>
    </FormProvider>
  );
}
