import { profileTypesEnum } from "@core/db/schemas/profile";

export type ProfileType = keyof typeof profileTypesEnum;
