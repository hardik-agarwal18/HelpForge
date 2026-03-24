import { z } from "zod";

const emailField = z
  .email({ error: "Invalid email format" })
  .transform((e) => e.toLowerCase().trim());

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(100, "Password is too long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character",
  );

export const registerSchema = z.object({
  body: z
    .object({
      email: emailField,
      password: passwordField,
      confirmPassword: z.string().optional(),
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(100, "Name is too long"),
    })
    .strict()
    .refine(
      (data) =>
        !data.confirmPassword || data.password === data.confirmPassword,
      {
        message: "Passwords do not match",
        path: ["confirmPassword"],
      },
    ),
});

export const loginSchema = z.object({
  body: z
    .object({
      email: emailField,
      password: z.string().min(1, "Password is required"),
    })
    .strict(),
});

export const refreshSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().min(1, "Refresh token is required"),
    })
    .strict(),
});
