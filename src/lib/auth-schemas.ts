import { z } from "zod";

export const emailSchema = z.string().trim().email("Enter a valid email").max(255);
export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "Too long")
  .regex(/[A-Za-z]/, "Must contain a letter")
  .regex(/\d/, "Must contain a number");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password required").max(128),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Name required").max(80),
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpValues = z.infer<typeof signUpSchema>;

export const forgotSchema = z.object({ email: emailSchema });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const resetSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });
export type ResetValues = z.infer<typeof resetSchema>;

export const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only");

export const orgSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugSchema,
  description: z.string().trim().max(280).optional().or(z.literal("")),
});
export type OrgValues = z.infer<typeof orgSchema>;

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugSchema,
  description: z.string().trim().max(280).optional().or(z.literal("")),
  status: z.enum(["active", "suspended"]),
});
export type OrgSettingsValues = z.infer<typeof orgSettingsSchema>;

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "member"]),
});
export type InviteValues = z.infer<typeof inviteSchema>;
