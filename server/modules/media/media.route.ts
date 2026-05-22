import { Role } from "@prisma/client";
import { Router } from "express";
import { authorize } from "../../shared/middlewares/authorize.middleware";
import { mediaController } from "./media.controller";

const router = Router();

router.get(
  "/sign",
  authorize(Role.SUPER_ADMIN, Role.OWNER),
  mediaController.signMedia,
);
router.post(
  "/upload/presign",
  authorize(Role.SUPER_ADMIN, Role.OWNER),
  mediaController.createPresign,
);
router.post(
  "/upload/delete",
  authorize(Role.SUPER_ADMIN, Role.OWNER),
  mediaController.deleteUploads,
);

export const mediaRoutes = router;
